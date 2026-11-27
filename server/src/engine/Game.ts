import { Deck } from "./Deck";
import { Evaluator } from "./Evaluator";
import {
  Card,
  GameStatus,
  PlayerPublicInfo,
  PlayerRanking,
  PublicGameState,
  Rank,
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
  hasDrawn: boolean; // true once the player has drawn at least one card this round
  melds?: Card[][];
}

export interface GameOptions {
  turnTimeLimitSeconds?: number;
  showTimeLimitSeconds?: number;
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
  public readonly roundCount: number;
  public roundNumber: number = 1;
  public currentRoundGameId: string;
  public status: GameStatus = "WAITING";

  private players: Map<string, PlayerInternalState> = new Map();
  private turnOrder: string[] = [];
  private currentTurnIndex: number = 0;
  private turnPhase: TurnPhase = "DRAW";

  private deck: Deck = new Deck();
  private discardPile: Card[] = [];
  private wildJoker!: Card;
  private wildRank: Rank = "A";

  private timerInterval: NodeJS.Timeout | null = null;
  private turnTimeLimit: number;
  private showTimeLimit: number;
  private turnTimeRemaining: number;
  private turnEndsAt: number | null = null;
  private showEndsAt: number | null = null;

  private winnerId?: string;
  private winnerMelds?: Card[][];
  private submittedMeldPlayerIds: Set<string> = new Set();
  private roundScores: Record<string, { points: number; totalScore: number; reason: string }> = {};
  private roundDropRecords: Map<string, { points: number; reason: string }> = new Map();

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
    this.currentRoundGameId = id;
    this.roomId = roomId;
    this.roomCode = roomCode;
    this.roundCount = Math.max(1, options.roundCount ?? 1);
    this.turnTimeLimit = options.turnTimeLimitSeconds || 30;
    this.showTimeLimit = options.showTimeLimitSeconds || 30;
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
      hasDrawn: false,
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
   * Starts a new round (preserves cumulative totalScore across rounds)
   */
  public startRound(): void {
    if (this.players.size < 2) {
      throw new Error("Need at least 2 players to start game");
    }

    this.clearTimers();
    this.status = "DEALING";
    this.winnerId = undefined;
    this.winnerMelds = undefined;
    this.submittedMeldPlayerIds.clear();
    this.roundScores = {};
    this.roundDropRecords.clear();
    this.turnEndsAt = null;
    this.showEndsAt = null;
    this.deck.reset();
    this.deck.shuffle();

    // Reset per-round player state (keep cumulative totalScore intact!)
    const activePlayers = Array.from(this.players.values()).sort(
      (a, b) => a.seatNumber - b.seatNumber
    );
    this.turnOrder = activePlayers.map((p) => p.id);

    // Deal 13 cards to each player
    const { hands } = this.deck.deal(activePlayers.length, 13);
    for (let i = 0; i < activePlayers.length; i++) {
      activePlayers[i].hand = hands[i];
      activePlayers[i].hasDropped = false;
      activePlayers[i].score = 0;
      activePlayers[i].consecutiveTimeouts = 0;
      activePlayers[i].hasDrawn = false;
      activePlayers[i].melds = undefined;
    }

    // Cut a card from remaining deck to be Wild Joker
    const cutCard = this.deck.draw();
    if (!cutCard) throw new Error("Deck exhausted during wild joker cut");

    // Mark wild jokers across all hands AND all remaining closed deck cards
    const allCardsInPlay: Card[] = [];
    for (const p of activePlayers) {
      allCardsInPlay.push(...p.hand);
    }
    allCardsInPlay.push(...this.deck.getRemainingCards());

    const { cutCard: markedCutCard, wildRank } = Deck.markWildJokers(
      cutCard,
      allCardsInPlay
    );
    this.wildJoker = markedCutCard;
    this.wildRank = wildRank;

    // Place one initial card face up in discard pile
    const initialDiscard = this.deck.draw();
    if (!initialDiscard) throw new Error("Deck exhausted during initial discard");
    if (!initialDiscard.isPrintedJoker && initialDiscard.rank === this.wildRank) {
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
   * Advances to the next round in a multi-round game
   */
  public startNextRound(nextDbGameId?: string): void {
    if (this.status !== "ROUND_END") {
      throw new Error(`Cannot start next round in status ${this.status}`);
    }
    if (this.roundNumber >= this.roundCount) {
      throw new Error("All scheduled rounds have already been completed");
    }

    this.roundNumber += 1;
    this.currentRoundGameId = nextDbGameId || `${this.id}_r${this.roundNumber}`;
    this.startRound();
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
      // If closed deck is still empty (nothing to reshuffle), fall back to discard pile
      // so the game cannot stall. If discard is also empty, no cards are available.
      if (this.deck.count === 0) {
        if (this.discardPile.length === 0) {
          throw new Error("No cards available to draw");
        }
        source = "DISCARD";
      }
    }
    if (source === "CLOSED") {
      drawnCard = this.deck.draw();
      if (!drawnCard) throw new Error("No cards available to draw");

      // Mark wild joker using explicit wildRank (handles Printed Joker cut -> Ace wild)
      if (!drawnCard.isPrintedJoker && drawnCard.rank === this.wildRank) {
        drawnCard.isWildJoker = true;
      }
    } else {
      if (this.discardPile.length === 0) {
        throw new Error("Discard pile is empty");
      }
      drawnCard = this.discardPile.pop()!;
    }

    player.hand.push(drawnCard);
    player.hasDrawn = true;
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
   * Sorts and persists the player's private hand order server-side.
   */
  public sortPlayerHand(playerId: string, by: "SUIT" | "RANK" = "SUIT"): Card[] {
    const player = this.players.get(playerId);
    if (!player) return [];
    const sorted = Evaluator.sortHand(player.hand, by);
    player.hand = sorted;
    return [...player.hand];
  }

  /**
   * Player drops out of the round
   */
  public drop(playerId: string): { penalty: number; publicState: PublicGameState } {
    this.validateTurn(playerId, "DRAW");
    const player = this.players.get(playerId)!;

    // Per-player Indian Rummy drop rules:
    // First drop (20 pts) = player's very first turn before drawing any card.
    // Middle drop (40 pts) = player has already drawn at least one card this round.
    const isFirstDrop = player.hand.length === 13 && !player.hasDrawn;
    const penalty = isFirstDrop ? 20 : 40;
    const reason = isFirstDrop ? "First Drop (20 pts)" : "Middle Drop (40 pts)";

    player.hasDropped = true;
    player.score += penalty;
    player.totalScore += penalty;
    this.roundDropRecords.set(player.id, { points: penalty, reason });

    const lastAction: PublicGameState["lastAction"] = {
      playerId,
      username: player.username,
      type: "DROP",
      timestamp: Date.now(),
    };

    // Check if only 1 active player remains
    const remainingPlayers = Array.from(this.players.values()).filter(
      (p) => !p.hasDropped
    );

    if (remainingPlayers.length === 1) {
      // Round finishes! Remaining player wins round; include ALL dropped players in roundScores
      const winner = remainingPlayers[0];
      const scores = this.buildDropEndScores(winner, "Winner (Opponents Dropped)");
      this.endRound(winner.id, scores, lastAction);
      return { penalty, publicState: this.getPublicState(lastAction) };
    }

    this.advanceTurn();
    const publicState = this.getPublicState(lastAction);
    if (this.onStateUpdate) {
      this.onStateUpdate(publicState);
    }

    return { penalty, publicState };
  }

  /**
   * Player declares a win with 13 cards grouped into melds + 1 declare card.
   * On valid declaration, transitions to SHOW phase so active opponents can submit melds.
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
      const state = this.getPublicState();
      this.broadcastState();
      return {
        isValid: false,
        reason: "Declaration must contain exactly 13 cards",
        publicState: state,
      };
    }

    // Verify all meld card IDs exist in player hand (excluding declare card),
    // that no card ID is reused across multiple melds, and rebuild the melds
    // using the SERVER-HELD card data. Card rank, suit, and joker status are
    // always derived from the server-held hand — never trusted from the client.
    const handCardById = new Map<string, Card>();
    for (const c of player.hand) {
      handCardById.set(c.id, c);
    }
    handCardById.delete(declareCardId);

    const usedCardIds = new Set<string>();
    const serverMelds: Card[][] = [];

    for (const m of melds) {
      const serverMeld: Card[] = [];
      for (const c of m) {
        if (!c || typeof c.id !== "string") {
          const state = this.getPublicState();
          this.broadcastState();
          return {
            isValid: false,
            reason: "Melds contain invalid or forged cards",
            publicState: state,
          };
        }
        // Reject reuse of the same card across multiple melds
        if (usedCardIds.has(c.id)) {
          const state = this.getPublicState();
          this.broadcastState();
          return {
            isValid: false,
            reason: "Melds contain invalid or forged cards",
            publicState: state,
          };
        }
        // Look up the actual card from the server-held hand
        const actualCard = handCardById.get(c.id);
        if (!actualCard) {
          const state = this.getPublicState();
          this.broadcastState();
          return {
            isValid: false,
            reason: "Melds contain invalid or forged cards",
            publicState: state,
          };
        }
        usedCardIds.add(c.id);
        serverMeld.push(actualCard);
      }
      serverMelds.push(serverMeld);
    }

    // 3. Run validation through Evaluator using SERVER-HELD card data only
    const validation = Evaluator.validateDeclaration(serverMelds);
    const lastAction: PublicGameState["lastAction"] = {
      playerId,
      username: player.username,
      type: "DECLARE",
      timestamp: Date.now(),
    };

    if (validation.isValid) {
      // Valid Declaration! Discard the 14th finish card and transition into SHOW phase
      const [declaredDiscard] = player.hand.splice(declareIdx, 1);
      this.discardPile.push(declaredDiscard);
      if (this.onPrivateUpdate) {
        this.onPrivateUpdate(player.id, [...player.hand]);
      }

      player.melds = serverMelds;
      this.winnerId = player.id;
      this.winnerMelds = serverMelds;
      this.submittedMeldPlayerIds.clear();

      const activeOpponents = this.getActiveShowOpponents();
      if (activeOpponents.length === 0) {
        this.status = "SHOW";
        this.finalizeShowPhase(lastAction);
        return {
          isValid: true,
          publicState: this.getPublicState(lastAction),
        };
      }

      this.status = "SHOW";
      this.startShowTimer();
      this.broadcastState(lastAction);

      return {
        isValid: true,
        publicState: this.getPublicState(lastAction),
      };
    } else {
      // Invalid Declaration! Penalty is 80 points
      player.score += 80;
      player.totalScore += 80;
      player.hasDropped = true; // Invalid declaration drops the player
      this.roundDropRecords.set(player.id, {
        points: 80,
        reason: "Invalid Declaration (80 pts)",
      });

      const remainingPlayers = Array.from(this.players.values()).filter(
        (p) => !p.hasDropped
      );

      if (remainingPlayers.length === 1) {
        const winner = remainingPlayers[0];
        const scores = this.buildDropEndScores(winner, "Winner");
        this.endRound(winner.id, scores, lastAction);
      } else {
        this.advanceTurn();
        this.broadcastState(lastAction);
      }

      return {
        isValid: false,
        reason: validation.reason || "Invalid card combination",
        publicState: this.getPublicState(lastAction),
      };
    }
  }

  /**
   * Remaining active (non-dropped, non-winner) opponent submits their arranged
   * melds during the SHOW phase. Reconstructs every card strictly by server cardId.
   */
  public submitMelds(
    playerId: string,
    melds: Card[][]
  ): { submitted: boolean; allSubmitted: boolean; publicState: PublicGameState } {
    if (this.status !== "SHOW") {
      throw new Error(`Cannot submit melds when game status is ${this.status}`);
    }

    const player = this.players.get(playerId);
    if (!player) {
      throw new Error("Player not found in game");
    }
    if (playerId === this.winnerId) {
      throw new Error("Declaring winner cannot submit opponent melds");
    }
    if (player.hasDropped) {
      throw new Error("Dropped players cannot submit melds");
    }
    if (this.submittedMeldPlayerIds.has(playerId)) {
      throw new Error("Melds already submitted");
    }
    if (!Array.isArray(melds)) {
      throw new Error("Melds must be an array of card groups");
    }

    // Reconstruct every submitted card strictly from server-held hand by cardId
    const handCardById = new Map<string, Card>();
    for (const c of player.hand) {
      handCardById.set(c.id, c);
    }

    const usedCardIds = new Set<string>();
    const serverMelds: Card[][] = [];

    for (const group of melds) {
      if (!Array.isArray(group)) {
        throw new Error("Each meld group must be an array of cards");
      }
      if (group.length === 0) continue;

      const serverGroup: Card[] = [];
      for (const c of group) {
        if (!c || typeof c.id !== "string") {
          throw new Error("Melds contain invalid or forged cards");
        }
        if (usedCardIds.has(c.id)) {
          throw new Error("Melds contain duplicate cards");
        }
        const actualCard = handCardById.get(c.id);
        if (!actualCard) {
          throw new Error("Melds contain invalid or forged cards");
        }
        usedCardIds.add(c.id);
        serverGroup.push(actualCard);
      }
      if (serverGroup.length > 0) {
        serverMelds.push(serverGroup);
      }
    }

    // Any cards in the player's server hand not included in the submitted melds
    // are strictly counted as individual ungrouped deadwood cards.
    for (const card of player.hand) {
      if (!usedCardIds.has(card.id)) {
        serverMelds.push([card]);
      }
    }

    player.melds = serverMelds;
    this.submittedMeldPlayerIds.add(playerId);

    const lastAction: PublicGameState["lastAction"] = {
      playerId,
      username: player.username,
      type: "SUBMIT_MELDS",
      timestamp: Date.now(),
    };

    const activeOpponents = this.getActiveShowOpponents();
    const allSubmitted = activeOpponents.every((opp) =>
      this.submittedMeldPlayerIds.has(opp.id)
    );

    if (allSubmitted) {
      this.finalizeShowPhase(lastAction);
    } else {
      this.broadcastState(lastAction);
    }

    return {
      submitted: true,
      allSubmitted,
      publicState: this.getPublicState(lastAction),
    };
  }

  /**
   * Finalizes the SHOW phase once all active opponents submit or the show timer expires.
   */
  public finalizeShowPhase(lastAction?: PublicGameState["lastAction"]): void {
    if (this.status !== "SHOW") return;
    this.clearTimers();

    const winnerId = this.winnerId;
    const winner = winnerId ? this.players.get(winnerId) : undefined;
    if (!winnerId || !winner) return;

    const scores: Record<string, { points: number; totalScore: number; reason: string }> = {
      [winner.id]: {
        points: 0,
        totalScore: winner.totalScore,
        reason: "Valid Declaration (Winner)",
      },
    };

    for (const other of this.players.values()) {
      if (other.id === winner.id) continue;

      if (other.hasDropped) {
        const dropRec = this.roundDropRecords.get(other.id);
        scores[other.id] = {
          points: dropRec?.points ?? other.score,
          totalScore: other.totalScore,
          reason: dropRec?.reason ?? "Dropped",
        };
        continue;
      }

      const didSubmit =
        this.submittedMeldPlayerIds.has(other.id) &&
        Boolean(other.melds && other.melds.length > 0);

      // Submitted opponents are scored on their validated melds (only invalid/ungrouped deadwood).
      // Unsubmitted opponents are auto-scored on their ungrouped hand (capped at 80).
      const meldsToScore = didSubmit
        ? other.melds!
        : other.hand.map((c) => [c]);

      const res = Evaluator.calculatePlayerScore(meldsToScore);
      other.score += res.points;
      other.totalScore += res.points;
      scores[other.id] = {
        points: res.points,
        totalScore: other.totalScore,
        reason: didSubmit
          ? `Melds Submitted (${res.points} pts)`
          : `Auto-Scored Timeout (${res.points} pts)`,
      };
    }

    this.endRound(winner.id, scores, lastAction);
  }

  private getActiveShowOpponents(): PlayerInternalState[] {
    return Array.from(this.players.values()).filter(
      (p) => p.id !== this.winnerId && !p.hasDropped
    );
  }

  /**
   * Builds a complete roundScores map containing the winner plus ALL dropped players.
   */
  private buildDropEndScores(
    winner: PlayerInternalState,
    winnerReason: string
  ): Record<string, { points: number; totalScore: number; reason: string }> {
    const scores: Record<string, { points: number; totalScore: number; reason: string }> = {};

    for (const p of this.players.values()) {
      if (p.id === winner.id) {
        scores[p.id] = {
          points: 0,
          totalScore: p.totalScore,
          reason: winnerReason,
        };
      } else {
        const dropRec = this.roundDropRecords.get(p.id);
        scores[p.id] = {
          points: dropRec?.points ?? p.score,
          totalScore: p.totalScore,
          reason: dropRec?.reason ?? "Dropped",
        };
      }
    }

    return scores;
  }

  /**
   * Reshuffle discard pile back into closed deck when closed deck runs out
   */
  private reshuffleDiscardIntoDeck(): void {
    // Nothing to reshuffle: only the top discard card (or fewer) remains.
    // Leave the deck empty; drawCard will report no cards available,
    // and the player may still draw from the discard pile.
    if (this.discardPile.length <= 1) {
      return;
    }
    const topCard = this.discardPile.pop()!;
    const cardsToShuffle = [...this.discardPile];
    this.discardPile = [topCard];

    // Add back to deck and shuffle
    this.deck.pushCards(cardsToShuffle);
    this.deck.shuffle();
  }

  private advanceTurn(): void {
    const activeIds = this.turnOrder.filter((id) => {
      const p = this.players.get(id);
      return p && !p.hasDropped;
    });

    if (activeIds.length <= 1) return;

    let nextIndex = (this.currentTurnIndex + 1) % this.turnOrder.length;
    while (this.players.get(this.turnOrder[nextIndex])?.hasDropped) {
      nextIndex = (nextIndex + 1) % this.turnOrder.length;
    }

    this.currentTurnIndex = nextIndex;
    this.turnPhase = "DRAW";
    this.startTurnTimer();
  }

  public isTimerRunning(): boolean {
    return this.timerInterval !== null;
  }

  public stopTimer(): void {
    if (this.turnEndsAt !== null) {
      this.turnTimeRemaining = Math.max(
        1,
        Math.ceil((this.turnEndsAt - Date.now()) / 1000)
      );
    }
    this.clearTimers();
    this.turnEndsAt = null;
    this.showEndsAt = null;
  }

  /**
   * Resumes a paused turn or show timer (e.g., when a player reconnects after
   * all players had disconnected). Returns true if a timer was restarted.
   */
  public resumeTimer(): boolean {
    if (this.timerInterval !== null) return false;

    if (this.status === "PLAYING") {
      const remaining =
        this.turnTimeRemaining > 0 ? this.turnTimeRemaining : this.turnTimeLimit;
      this.startTurnTimer(remaining);
      return true;
    }

    if (this.status === "SHOW") {
      const remaining =
        this.turnTimeRemaining > 0 ? this.turnTimeRemaining : this.showTimeLimit;
      this.startShowTimer(remaining);
      return true;
    }

    return false;
  }

  private startTurnTimer(secondsOverride?: number): void {
    this.clearTimers();
    const durationSeconds =
      secondsOverride !== undefined && secondsOverride > 0
        ? secondsOverride
        : this.turnTimeLimit;
    this.turnTimeRemaining = durationSeconds;
    const deadline = Date.now() + durationSeconds * 1000;
    this.turnEndsAt = deadline;
    this.showEndsAt = null;

    this.timerInterval = setInterval(() => {
      const remainingMs = deadline - Date.now();
      this.turnTimeRemaining = Math.max(0, Math.ceil(remainingMs / 1000));
      if (remainingMs <= 0) {
        this.clearTimers();
        this.turnEndsAt = null;
        this.handleTimeout();
      }
    }, 250);
  }

  private startShowTimer(secondsOverride?: number): void {
    this.clearTimers();
    const durationSeconds =
      secondsOverride !== undefined && secondsOverride > 0
        ? secondsOverride
        : this.showTimeLimit;
    this.turnTimeRemaining = durationSeconds;
    const deadline = Date.now() + durationSeconds * 1000;
    this.showEndsAt = deadline;
    this.turnEndsAt = deadline;

    this.timerInterval = setInterval(() => {
      const remainingMs = deadline - Date.now();
      this.turnTimeRemaining = Math.max(0, Math.ceil(remainingMs / 1000));
      if (remainingMs <= 0) {
        this.finalizeShowPhase();
      }
    }, 250);
  }

  private handleTimeout(): void {
    const currentId = this.getCurrentTurnPlayerId();
    const player = this.players.get(currentId);
    if (!player) return;

    player.consecutiveTimeouts++;
    const timeoutCount = player.consecutiveTimeouts;

    if (timeoutCount >= 3) {
      // 3 consecutive timeouts -> auto drop
      this.drop(player.id);
      return;
    }

    // Auto-play default: if in DRAW phase, auto-draw closed and auto-discard
    if (this.turnPhase === "DRAW") {
      try {
        const { drawnCard } = this.drawCard(player.id, "CLOSED");
        this.discardCard(player.id, drawnCard.id);
      } catch {
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

    // drawCard/discardCard reset consecutiveTimeouts to 0; restore the timeout count
    player.consecutiveTimeouts = timeoutCount;

    if (this.onTurnTimeout) {
      this.onTurnTimeout(player.id);
    }
  }

  private clearTimers(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private endRound(
    winnerId: string,
    scores: Record<string, { points: number; totalScore: number; reason: string }>,
    lastAction?: PublicGameState["lastAction"]
  ): void {
    this.clearTimers();
    this.turnEndsAt = null;
    this.showEndsAt = null;
    this.turnTimeRemaining = 0;
    this.status = this.roundNumber >= this.roundCount ? "GAME_OVER" : "ROUND_END";
    this.winnerId = winnerId;
    this.roundScores = scores;
    this.broadcastState(lastAction);
  }

  public getCurrentTurnPlayerId(): string {
    return this.turnOrder[this.currentTurnIndex] || "";
  }

  public getWildRank(): Rank {
    return this.wildRank;
  }

  public getPlayer(playerId: string): PlayerInternalState | undefined {
    return this.players.get(playerId);
  }

  public getPlayerCards(playerId: string): Card[] {
    return this.players.get(playerId)?.hand || [];
  }

  private buildRankings(): PlayerRanking[] {
    const sorted = Array.from(this.players.values()).sort((a, b) => {
      if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
      return a.seatNumber - b.seatNumber;
    });

    const rankings: PlayerRanking[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const rank =
        i > 0 && p.totalScore === sorted[i - 1].totalScore
          ? rankings[i - 1].rank
          : i + 1;
      rankings.push({
        playerId: p.id,
        username: p.username,
        totalScore: p.totalScore,
        rank,
      });
    }
    return rankings;
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
        isCurrentTurn: this.status === "PLAYING" && p.id === currentId,
        isReady: p.isReady,
        connectionStatus: p.connectionStatus,
        hasDropped: p.hasDropped,
        score: p.totalScore,
      })
    );

    const totalScores: Record<string, number> = {};
    for (const p of this.players.values()) {
      totalScores[p.id] = p.totalScore;
    }

    const computedRemainingSeconds =
      this.turnEndsAt !== null
        ? Math.max(0, Math.ceil((this.turnEndsAt - Date.now()) / 1000))
        : Math.max(0, this.turnTimeRemaining);

    return {
      gameId: this.currentRoundGameId,
      roomId: this.roomId,
      roomCode: this.roomCode,
      status: this.status,
      roundNumber: this.roundNumber,
      roundCount: this.roundCount,
      currentTurnPlayerId: currentId,
      turnPhase: this.turnPhase,
      turnTimeLimitSeconds: this.turnTimeLimit,
      turnTimeRemainingSeconds: computedRemainingSeconds,
      turnEndsAt: this.turnEndsAt,
      showTimeLimitSeconds: this.showTimeLimit,
      showEndsAt: this.showEndsAt,
      wildJoker: this.wildJoker,
      wildRank: this.wildRank,
      topDiscardCard:
        this.discardPile.length > 0
          ? this.discardPile[this.discardPile.length - 1]
          : null,
      closedDeckCount: this.deck.count,
      discardPileCount: this.discardPile.length,
      players: publicPlayers,
      lastAction,
      winnerId: this.winnerId,
      winnerMelds: this.winnerMelds,
      submittedMeldPlayerIds: Array.from(this.submittedMeldPlayerIds),
      roundScores: this.roundScores,
      totalScores,
      rankings: this.status === "GAME_OVER" ? this.buildRankings() : undefined,
    };
  }

  private broadcastState(lastAction?: PublicGameState["lastAction"]): void {
    if (this.onStateUpdate) {
      this.onStateUpdate(this.getPublicState(lastAction));
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
