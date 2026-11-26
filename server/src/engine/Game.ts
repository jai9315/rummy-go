import { Deck } from "./Deck";
import { Evaluator } from "./Evaluator";
import {
  Card,
  GameStatus,
  PlayerPublicInfo,
  PublicGameState,
  TurnPhase,
} from "./types";

export interface PlayerInternalState {
  id: string;
  username: string;
  profileImage: string;
  seatNumber: number;
  hand: Card[]; // STRICTLY PRIVATE on server
  isReady: boolean;
  connectionStatus: "CONNECTED" | "DISCONNECTED";
  hasDropped: boolean;
  score: number;
  totalScore: number;
  consecutiveTimeouts: number;
  melds?: Card[][];
}

export interface GameOptions {
  turnTimeLimitSeconds?: number;
  entryPoints?: number;
  roundCount?: number;
  onStateUpdate?: (state: PublicGameState) => void;
  onPrivateUpdate?: (playerId: string, cards: Card[]) => void;
  onTurnTimeout?: (playerId: string) => void;
}

export class Game {
  public readonly id: string;
  public readonly roomId: string;
  public readonly roomCode: string;
  public roundNumber: number = 1;
  public status: GameStatus = "WAITING";

  private players: Map<string, PlayerInternalState> = new Map();
  private turnOrder: string[] = [];
  private currentTurnIndex: number = 0;
  private turnPhase: TurnPhase = "DRAW";

  private deck: Deck = new Deck();
  private discardPile: Card[] = [];
  private wildJoker!: Card;

  private turnTimer: NodeJS.Timeout | null = null;
  private timerInterval: NodeJS.Timeout | null = null;
  private turnTimeLimit: number;
  private turnTimeRemaining: number;
  private roundScores: Record<string, { points: number; totalScore: number; reason: string }> = {};

  private onStateUpdate?: (state: PublicGameState) => void;
  private onPrivateUpdate?: (playerId: string, cards: Card[]) => void;
  private onTurnTimeout?: (playerId: string) => void;

  constructor(
    id: string,
    roomId: string,
    roomCode: string,
    options: GameOptions = {}
  ) {
    this.id = id;
    this.roomId = roomId;
    this.roomCode = roomCode;
    this.turnTimeLimit = options.turnTimeLimitSeconds || 30;
    this.turnTimeRemaining = this.turnTimeLimit;
    this.onStateUpdate = options.onStateUpdate;
    this.onPrivateUpdate = options.onPrivateUpdate;
    this.onTurnTimeout = options.onTurnTimeout;
  }

  public addPlayer(
    id: string,
    username: string,
    profileImage: string = "",
    seatNumber: number
  ): void {
    if (this.status !== "WAITING") {
      throw new Error("Cannot add player to an ongoing game");
    }
    if (this.players.size >= 6) {
      throw new Error("Room is full (max 6 players)");
    }
    this.players.set(id, {
      id,
      username,
      profileImage,
      seatNumber,
      hand: [],
      isReady: false,
      connectionStatus: "CONNECTED",
      hasDropped: false,
      score: 0,
      totalScore: 0,
      consecutiveTimeouts: 0,
    });
  }

  public setPlayerReady(playerId: string, ready: boolean): void {
    const player = this.players.get(playerId);
    if (player) {
      player.isReady = ready;
    }
  }

  public removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.turnOrder = this.turnOrder.filter((id) => id !== playerId);
  }

  public setPlayerConnection(
    playerId: string,
    status: "CONNECTED" | "DISCONNECTED"
  ): void {
    const player = this.players.get(playerId);
    if (player) {
      player.connectionStatus = status;
    }
  }

  public canStart(): boolean {
    if (this.players.size < 2) return false;
    for (const player of this.players.values()) {
      if (!player.isReady) return false;
    }
    return true;
  }

  /**
   * Starts a new round
   */
  public startRound(): void {
    if (this.players.size < 2) {
      throw new Error("Need at least 2 players to start game");
    }

    this.status = "DEALING";
    this.roundScores = {};
    this.deck.reset();
    this.deck.shuffle();

    // Reset player state for round
    const activePlayers = Array.from(this.players.values()).sort(
      (a, b) => a.seatNumber - b.seatNumber
    );
    this.turnOrder = activePlayers.map((p) => p.id);

    // Deal 13 cards to each player
    const { hands, remainingDeck } = this.deck.deal(activePlayers.length, 13);
    for (let i = 0; i < activePlayers.length; i++) {
      activePlayers[i].hand = hands[i];
      activePlayers[i].hasDropped = false;
      activePlayers[i].consecutiveTimeouts = 0;
    }

    // Cut a card from remaining deck to be Wild Joker
    const cutCard = this.deck.draw();
    if (!cutCard) throw new Error("Deck exhausted during wild joker cut");

    // Mark wild jokers across all hands and deck
    const allCardsInPlay: Card[] = [];
    for (const p of activePlayers) {
      allCardsInPlay.push(...p.hand);
    }
    const { cutCard: markedCutCard, wildRank } = Deck.markWildJokers(
      cutCard,
      allCardsInPlay
    );
    this.wildJoker = markedCutCard;

    // Place one initial card face up in discard pile
    const initialDiscard = this.deck.draw();
    if (!initialDiscard) throw new Error("Deck exhausted during initial discard");
    if (initialDiscard.rank === wildRank) {
      initialDiscard.isWildJoker = true;
    }
    this.discardPile = [initialDiscard];

    this.currentTurnIndex = 0;
    this.turnPhase = "DRAW";
    this.status = "PLAYING";

    // Notify each player privately of their new hand
    for (const p of activePlayers) {
      if (this.onPrivateUpdate) {
        this.onPrivateUpdate(p.id, [...p.hand]);
      }
    }

    this.startTurnTimer();
    this.broadcastState();
  }

  /**
   * Active player draws 1 card
   */
  public drawCard(
    playerId: string,
    source: "CLOSED" | "DISCARD"
  ): { drawnCard: Card; publicState: PublicGameState } {
    this.validateTurn(playerId, "DRAW");
    const player = this.players.get(playerId)!;

    let drawnCard: Card | undefined;

    if (source === "CLOSED") {
      if (this.deck.count === 0) {
        this.reshuffleDiscardIntoDeck();
      }
      drawnCard = this.deck.draw();
      if (!drawnCard) throw new Error("No cards available to draw");

      // Check if drawn card matches wild joker rank
      if (
        !drawnCard.isPrintedJoker &&
        drawnCard.rank === this.wildJoker.rank
      ) {
        drawnCard.isWildJoker = true;
      }
    } else {
      if (this.discardPile.length === 0) {
        throw new Error("Discard pile is empty");
      }
      drawnCard = this.discardPile.pop()!;
    }

    player.hand.push(drawnCard);
    player.consecutiveTimeouts = 0;
    this.turnPhase = "DISCARD";

    // Send private update to active player
    if (this.onPrivateUpdate) {
      this.onPrivateUpdate(player.id, [...player.hand]);
    }

    this.startTurnTimer();
    const publicState = this.getPublicState({
      playerId,
      username: player.username,
      type: source === "CLOSED" ? "DRAW_CLOSED" : "DRAW_OPEN",
      card: source === "DISCARD" ? drawnCard : undefined, // Open draw is public
      timestamp: Date.now(),
    });

    if (this.onStateUpdate) {
      this.onStateUpdate(publicState);
    }

    return { drawnCard, publicState };
  }

  /**
   * Active player discards 1 card
   */
  public discardCard(
    playerId: string,
    cardId: string
  ): { discardedCard: Card; publicState: PublicGameState } {
    this.validateTurn(playerId, "DISCARD");
    const player = this.players.get(playerId)!;

    // Verify card exists in player's secret hand
    const cardIndex = player.hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) {
      throw new Error("Card does not exist in player's hand");
    }

    const [discardedCard] = player.hand.splice(cardIndex, 1);
    this.discardPile.push(discardedCard);

    // Update player hand privately
    if (this.onPrivateUpdate) {
      this.onPrivateUpdate(player.id, [...player.hand]);
    }

    // Advance turn to next active player
    this.advanceTurn();

    const publicState = this.getPublicState({
      playerId,
      username: player.username,
      type: "DISCARD",
      card: discardedCard,
      timestamp: Date.now(),
    });

    if (this.onStateUpdate) {
      this.onStateUpdate(publicState);
    }

    return { discardedCard, publicState };
  }

  /**
   * Player drops out of the round
   */
  public drop(playerId: string): { penalty: number; publicState: PublicGameState } {
    this.validateTurn(playerId, "DRAW");
    const player = this.players.get(playerId)!;

    // First drop penalty = 20, Middle drop penalty = 40
    // If player has not drawn in previous turns -> first drop
    const isFirstDrop = player.hand.length === 13 && this.currentTurnIndex === 0;
    const penalty = isFirstDrop ? 20 : 40;

    player.hasDropped = true;
    player.score += penalty;
    player.totalScore += penalty;

    // Check if only 1 active player remains
    const remainingPlayers = Array.from(this.players.values()).filter(
      (p) => !p.hasDropped
    );

    if (remainingPlayers.length === 1) {
      // Round finishes! Remaining player wins round
      const winner = remainingPlayers[0];
      this.endRound(winner.id, {
        [player.id]: {
          points: penalty,
          totalScore: player.totalScore,
          reason: isFirstDrop ? "First Drop (20 pts)" : "Middle Drop (40 pts)",
        },
        [winner.id]: {
          points: 0,
          totalScore: winner.totalScore,
          reason: "Winner (Opponents Dropped)",
        },
      });
    } else {
      this.advanceTurn();
    }

    const publicState = this.getPublicState({
      playerId,
      username: player.username,
      type: "DROP",
      timestamp: Date.now(),
    });

    if (this.onStateUpdate) {
      this.onStateUpdate(publicState);
    }

    return { penalty, publicState };
  }

  /**
   * Player declares a win with 13 cards grouped into melds + 1 declare card
   */
  public declare(
    playerId: string,
    melds: Card[][],
    declareCardId: string
  ): { isValid: boolean; reason?: string; publicState: PublicGameState } {
    this.validateTurn(playerId, "DISCARD");
    const player = this.players.get(playerId)!;

    // 1. Check that declare card is in hand
    const declareIdx = player.hand.findIndex((c) => c.id === declareCardId);
    if (declareIdx === -1) {
      throw new Error("Declare card not found in player hand");
    }

    // 2. Extract remaining 13 cards from melds and verify against hand
    const allMeldCards: Card[] = [];
    for (const m of melds) {
      allMeldCards.push(...m);
    }

    if (allMeldCards.length !== 13) {
      return {
        isValid: false,
        reason: "Declaration must contain exactly 13 cards",
        publicState: this.getPublicState(),
      };
    }

    // Verify all meld card IDs exist in player hand (excluding declare card)
    const handCardIds = new Set(player.hand.map((c) => c.id));
    handCardIds.delete(declareCardId);

    for (const c of allMeldCards) {
      if (!handCardIds.has(c.id)) {
        return {
          isValid: false,
          reason: "Melds contain invalid or forged cards",
          publicState: this.getPublicState(),
        };
      }
    }

    // 3. Run validation through Evaluator
    const validation = Evaluator.validateDeclaration(melds);

    if (validation.isValid) {
      // Valid Declaration! Winner gets 0 penalty points
      player.melds = melds;
      const scores: Record<string, { points: number; totalScore: number; reason: string }> = {
        [player.id]: { points: 0, totalScore: player.totalScore, reason: "Valid Declaration (Winner)" },
      };

      // Score all other players
      for (const other of this.players.values()) {
        if (other.id === player.id) continue;
        if (other.hasDropped) continue;

        // Auto calculate score based on other player's current hand
        // Group remaining cards or deadwood
        const otherMelds = other.melds && other.melds.length > 0 ? other.melds : [other.hand];
        const res = Evaluator.calculatePlayerScore(otherMelds);
        other.score += res.points;
        other.totalScore += res.points;
        scores[other.id] = {
          points: res.points,
          totalScore: other.totalScore,
          reason: `Loss (${res.points} pts)`,
        };
      }

      this.endRound(player.id, scores);
      return {
        isValid: true,
        publicState: this.getPublicState({
          playerId,
          username: player.username,
          type: "DECLARE",
          timestamp: Date.now(),
        }),
      };
    } else {
      // Invalid Declaration! Penalty is 80 points
      player.score += 80;
      player.totalScore += 80;
      player.hasDropped = true; // Invalid declaration drops the player

      const remainingPlayers = Array.from(this.players.values()).filter(
        (p) => !p.hasDropped
      );

      if (remainingPlayers.length === 1) {
        const winner = remainingPlayers[0];
        this.endRound(winner.id, {
          [player.id]: { points: 80, totalScore: player.totalScore, reason: "Invalid Declaration (80 pts)" },
          [winner.id]: { points: 0, totalScore: winner.totalScore, reason: "Winner" },
        });
      } else {
        this.advanceTurn();
      }

      return {
        isValid: false,
        reason: validation.reason || "Invalid card combination",
        publicState: this.getPublicState(),
      };
    }
  }

  /**
   * Reshuffle discard pile back into closed deck when closed deck runs out
   */
  private reshuffleDiscardIntoDeck(): void {
    if (this.discardPile.length <= 1) {
      throw new Error("Not enough cards to reshuffle");
    }
    const topCard = this.discardPile.pop()!;
    const cardsToShuffle = [...this.discardPile];
    this.discardPile = [topCard];

    // Add back to deck and shuffle
    for (const c of cardsToShuffle) {
      (this.deck as any).cards.push(c);
    }
    this.deck.shuffle();
  }

  private advanceTurn(): void {
    const activeIds = this.turnOrder.filter((id) => {
      const p = this.players.get(id);
      return p && !p.hasDropped;
    });

    if (activeIds.length <= 1) return;

    let nextIndex = (this.currentTurnIndex + 1) % this.turnOrder.length;
    while (
      this.players.get(this.turnOrder[nextIndex])?.hasDropped
    ) {
      nextIndex = (nextIndex + 1) % this.turnOrder.length;
    }

    this.currentTurnIndex = nextIndex;
    this.turnPhase = "DRAW";
    this.startTurnTimer();
  }

  private startTurnTimer(): void {
    this.clearTimers();
    this.turnTimeRemaining = this.turnTimeLimit;

    this.timerInterval = setInterval(() => {
      this.turnTimeRemaining--;
      if (this.turnTimeRemaining <= 0) {
        this.clearTimers();
        this.handleTimeout();
      }
    }, 1000);
  }

  private handleTimeout(): void {
    const currentId = this.getCurrentTurnPlayerId();
    const player = this.players.get(currentId);
    if (!player) return;

    player.consecutiveTimeouts++;

    if (player.consecutiveTimeouts >= 3) {
      // 3 consecutive timeouts -> auto drop
      this.drop(player.id);
      return;
    }

    // Auto-play default: if in DRAW phase, auto-draw closed and auto-discard
    if (this.turnPhase === "DRAW") {
      try {
        const { drawnCard } = this.drawCard(player.id, "CLOSED");
        this.discardCard(player.id, drawnCard.id);
      } catch (err) {
        this.advanceTurn();
      }
    } else {
      // In DISCARD phase, auto-discard last drawn card
      const lastCard = player.hand[player.hand.length - 1];
      if (lastCard) {
        this.discardCard(player.id, lastCard.id);
      } else {
        this.advanceTurn();
      }
    }

    if (this.onTurnTimeout) {
      this.onTurnTimeout(player.id);
    }
  }

  private clearTimers(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private endRound(
    winnerId: string,
    scores: Record<string, { points: number; totalScore: number; reason: string }>
  ): void {
    this.clearTimers();
    this.status = "ROUND_END";
    this.roundScores = scores;
    this.broadcastState();
  }

  public getCurrentTurnPlayerId(): string {
    return this.turnOrder[this.currentTurnIndex] || "";
  }

  public getPlayer(playerId: string): PlayerInternalState | undefined {
    return this.players.get(playerId);
  }

  public getPlayerCards(playerId: string): Card[] {
    return this.players.get(playerId)?.hand || [];
  }

  /**
   * Sanitized public game state - strictly hides other players' cards!
   */
  public getPublicState(lastAction?: PublicGameState["lastAction"]): PublicGameState {
    const currentId = this.getCurrentTurnPlayerId();

    const publicPlayers: PlayerPublicInfo[] = Array.from(this.players.values()).map(
      (p) => ({
        id: p.id,
        username: p.username,
        profileImage: p.profileImage,
        seatNumber: p.seatNumber,
        cardCount: p.hand.length, // Only count is public!
        isCurrentTurn: p.id === currentId,
        isReady: p.isReady,
        connectionStatus: p.connectionStatus,
        hasDropped: p.hasDropped,
        score: p.totalScore,
      })
    );

    return {
      gameId: this.id,
      roomId: this.roomId,
      roomCode: this.roomCode,
      status: this.status,
      roundNumber: this.roundNumber,
      currentTurnPlayerId: currentId,
      turnPhase: this.turnPhase,
      turnTimeLimitSeconds: this.turnTimeLimit,
      turnTimeRemainingSeconds: Math.max(0, this.turnTimeRemaining),
      wildJoker: this.wildJoker,
      topDiscardCard:
        this.discardPile.length > 0
          ? this.discardPile[this.discardPile.length - 1]
          : null,
      closedDeckCount: this.deck.count,
      discardPileCount: this.discardPile.length,
      players: publicPlayers,
      lastAction,
      roundScores: this.roundScores,
    };
  }

  private broadcastState(): void {
    if (this.onStateUpdate) {
      this.onStateUpdate(this.getPublicState());
    }
  }

  private validateTurn(playerId: string, requiredPhase: TurnPhase): void {
    if (this.status !== "PLAYING") {
      throw new Error(`Game is not in PLAYING state (current: ${this.status})`);
    }
    const currentId = this.getCurrentTurnPlayerId();
    if (playerId !== currentId) {
      throw new Error(`Not your turn! Current turn is player: ${currentId}`);
    }
    if (this.turnPhase !== requiredPhase) {
      throw new Error(
        `Invalid action phase: currently in ${this.turnPhase} phase, required ${requiredPhase}`
      );
    }
  }
}
