import crypto from "crypto";
import { Deck } from "./Deck";
import { Evaluator } from "./Evaluator";
import {
  Card,
  GameStatus,
  PlayerPublicInfo,
  PlayerRanking,
  PublicGameState,
  Rank,
  RoundHistoryEntry,
  Suit,
  TossResult,
  TurnPhase,
} from "./types";

const TOSS_RANK_PRIORITY: Record<string, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  "10": 10,
  "9": 9,
  "8": 8,
  "7": 7,
  "6": 6,
  "5": 5,
  "4": 4,
  "3": 3,
  "2": 2,
};

const TOSS_SUIT_PRIORITY: Record<string, number> = {
  SPADES: 4,
  HEARTS: 3,
  DIAMONDS: 2,
  CLUBS: 1,
};

const TOSS_SUITS: Suit[] = ["SPADES", "HEARTS", "DIAMONDS", "CLUBS"];
const TOSS_RANKS: Rank[] = [
  "A",
  "K",
  "Q",
  "J",
  "10",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
];

export interface PlayerInternalState {
  id: string;
  username: string;
  profileImage: string;
  seatNumber: number;
  hand: Card[]; // STRICTLY PRIVATE on server
  isReady: boolean;
  connectionStatus: "CONNECTED" | "DISCONNECTED";
  hasDropped: boolean;
  isEliminated: boolean;
  offlineTurnsMissed: number;
  offlineRoundsMissed: number;
  canPlayCurrentRound: boolean;
  score: number;
  totalScore: number;
  consecutiveTimeouts: number;
  hasDrawn: boolean; // true once the player has drawn at least one card this round
  melds?: Card[][];
}

export interface GameOptions {
  turnTimeLimitSeconds?: number;
  showTimeLimitSeconds?: number;
  tossDurationMs?: number;
  entryPoints?: number;
  roundCount?: number;
  targetPoints?: number;
  onStateUpdate?: (state: PublicGameState) => void;
  onPrivateUpdate?: (playerId: string, cards: Card[]) => void;
  onTurnTimeout?: (playerId: string) => void;
  onRemoveOfflinePlayer?: (playerId: string) => void;
}

export class Game {
  public readonly id: string;
  public readonly roomId: string;
  public readonly roomCode: string;
  public readonly roundCount: number;
  public readonly targetPoints: number;
  public readonly poolMode: boolean;
  public roundNumber: number = 1;
  public currentRoundGameId: string;
  public status: GameStatus = "WAITING";

  private players: Map<string, PlayerInternalState> = new Map();
  private turnOrder: string[] = [];
  private roundStarterIndex: number = 0;
  private currentTurnIndex: number = 0;
  private turnPhase: TurnPhase = "DRAW";

  private deck: Deck = new Deck();
  private discardPile: Card[] = [];
  private wildJoker: Card | null = null;
  private wildRank: Rank = "A";

  private timerInterval: NodeJS.Timeout | null = null;
  private tossTimer: NodeJS.Timeout | null = null;
  private tossDurationMs: number;
  private tossResults?: TossResult[];
  private tossEndsAt: number | null = null;
  private turnTimeLimit: number;
  private showTimeLimit: number;
  private turnTimeRemaining: number;
  private turnEndsAt: number | null = null;
  private showEndsAt: number | null = null;
  private nextRoundEndsAt: number | null = null;

  private winnerId?: string;
  private winnerMelds?: Card[][];
  private roundRevealedHands?: Record<string, Card[][]>;
  private submittedMeldPlayerIds: Set<string> = new Set();
  private roundScores: Record<string, { points: number; totalScore: number; reason: string }> = {};
  private roundHistory: RoundHistoryEntry[] = [];
  private roundDropRecords: Map<string, { points: number; reason: string }> = new Map();

  private onStateUpdate?: (state: PublicGameState) => void;
  private onPrivateUpdate?: (playerId: string, cards: Card[]) => void;
  private onTurnTimeout?: (playerId: string) => void;
  private onRemoveOfflinePlayer?: (playerId: string) => void;

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
    this.poolMode =
      options.targetPoints !== undefined || options.roundCount === undefined;
    this.targetPoints = Math.max(
      1,
      Math.floor(options.targetPoints ?? 101)
    );
    this.roundCount = Math.max(1, options.roundCount ?? 1);
    this.turnTimeLimit = options.turnTimeLimitSeconds || 30;
    this.showTimeLimit = options.showTimeLimitSeconds || 30;
    this.tossDurationMs =
      options.tossDurationMs !== undefined ? Math.max(0, options.tossDurationMs) : 3500;
    this.turnTimeRemaining = this.turnTimeLimit;
    this.onStateUpdate = options.onStateUpdate;
    this.onPrivateUpdate = options.onPrivateUpdate;
    this.onTurnTimeout = options.onTurnTimeout;
    this.onRemoveOfflinePlayer = options.onRemoveOfflinePlayer;
  }

  /**
   * Computes strict toss priority score:
   * Rank priority: A(14) > K(13) > Q(12) > J(11) > 10 > ... > 2
   * Suit tie-breaker: SPADES(4) > HEARTS(3) > DIAMONDS(2) > CLUBS(1)
   */
  public static getTossCardPriority(card: Card): number {
    const rankScore = TOSS_RANK_PRIORITY[card.rank] ?? 0;
    const suitScore = TOSS_SUIT_PRIORITY[card.suit] ?? 0;
    return rankScore * 10 + suitScore;
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
      isEliminated: false,
      offlineTurnsMissed: 0,
      offlineRoundsMissed: 0,
      canPlayCurrentRound: true,
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
    if (!player) return;
    player.connectionStatus = status;
    if (status === "CONNECTED") {
      player.offlineRoundsMissed = 0;
      // Note: if player was already dropped / marked unable to play this round while offline,
      // keep canPlayCurrentRound=false until the current round completes.
    }
  }

  public setNextRoundEndsAt(ts: number | null): void {
    this.nextRoundEndsAt = ts;
  }

  public canStartNextRound(): boolean {
    if (this.status !== "ROUND_END") return false;
    const survivors = Array.from(this.players.values()).filter((p) => !p.isEliminated);
    if (survivors.length < 2) return false;
    if (!this.poolMode && this.roundNumber >= this.roundCount) return false;
    return true;
  }

  public canStart(): boolean {
    if (this.players.size < 2) return false;
    for (const player of this.players.values()) {
      if (!player.isReady) return false;
    }
    return true;
  }

  /**
   * Starts the match with a server-authoritative TOSS phase to determine seat & turn order.
   * 1. Shuffles a fresh 52-card deck (excluding Printed Jokers) using crypto.randomInt.
   * 2. Draws 1 unique face-up card per player.
   * 3. Ranks players by Rank (A high -> 2 low) and Suit tie-breaker (♠ > ♥ > ♦ > ♣).
   * 4. Reorders players (seatNumber 1..N and turnOrder) from highest priority to lowest.
   * 5. Emits GAME_STATE_UPDATE with status="TOSS", tossResults, and tossEndsAt.
   * 6. After tossDurationMs, reshuffles the full 108-card deck and starts Round 1.
   */
  public startToss(): void {
    if (this.players.size < 2) {
      throw new Error("Need at least 2 players to start game");
    }

    this.clearTimers();
    this.winnerId = undefined;
    this.winnerMelds = undefined;
    this.roundRevealedHands = undefined;
    this.submittedMeldPlayerIds.clear();
    this.roundScores = {};
    this.roundDropRecords.clear();
    this.discardPile = [];
    this.wildJoker = null;
    this.turnEndsAt = null;
    this.showEndsAt = null;
    this.nextRoundEndsAt = null;
    this.roundStarterIndex = 0;

    // Build a fresh 52-card standard deck (excluding Printed Jokers) for unique toss draws
    const tossDeck: Card[] = [];
    let counter = 1;
    for (const suit of TOSS_SUITS) {
      for (const rank of TOSS_RANKS) {
        tossDeck.push({
          id: `TOSS_${suit[0]}_${rank}_${counter++}`,
          suit,
          rank,
          isWildJoker: false,
          isPrintedJoker: false,
        });
      }
    }

    // Cryptographically secure Fisher-Yates shuffle
    for (let i = tossDeck.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      const tmp = tossDeck[i];
      tossDeck[i] = tossDeck[j];
      tossDeck[j] = tmp;
    }

    const currentPlayers = Array.from(this.players.values()).sort(
      (a, b) => a.seatNumber - b.seatNumber
    );

    const draws = currentPlayers.map((player) => {
      const card = tossDeck.pop()!;
      player.hand = [];
      player.hasDropped = false;
      player.isEliminated = false;
      player.offlineTurnsMissed = 0;
      player.offlineRoundsMissed = 0;
      player.canPlayCurrentRound = true;
      player.score = 0;
      player.consecutiveTimeouts = 0;
      player.hasDrawn = false;
      player.melds = undefined;
      return {
        player,
        card,
        priority: Game.getTossCardPriority(card),
      };
    });

    // Highest priority first (seatIndex 0 -> gets first turn)
    draws.sort((a, b) => b.priority - a.priority);

    // Reorder internal players Map & seatNumbers to reflect permanent match seat order
    const reorderedMap = new Map<string, PlayerInternalState>();
    const results: TossResult[] = [];
    for (let seatIndex = 0; seatIndex < draws.length; seatIndex++) {
      const entry = draws[seatIndex];
      entry.player.seatNumber = seatIndex + 1;
      reorderedMap.set(entry.player.id, entry.player);
      results.push({
        playerId: entry.player.id,
        username: entry.player.username,
        card: entry.card,
        seatIndex,
      });
    }

    this.players = reorderedMap;
    this.turnOrder = draws.map((d) => d.player.id);
    this.roundStarterIndex = 0;
    this.currentTurnIndex = 0;
    this.turnPhase = "DRAW";
    this.tossResults = results;
    this.status = "TOSS";
    this.tossEndsAt = Date.now() + this.tossDurationMs;

    this.broadcastState();

    if (this.tossDurationMs <= 0) {
      this.startRound();
      return;
    }

    this.scheduleTossCompletion(this.tossDurationMs);
  }

  private scheduleTossCompletion(delayMs: number): void {
    if (this.tossTimer) {
      clearTimeout(this.tossTimer);
      this.tossTimer = null;
    }
    this.tossTimer = setTimeout(() => {
      this.tossTimer = null;
      if (this.status === "TOSS") {
        this.startRound();
      }
    }, Math.max(0, delayMs));
  }

  /**
   * Starts a fresh round:
   * 1. Builds and cryptographically reshuffles a fresh deck (1 deck for <= 3 active players, 2 decks for 4–6).
   * 2. Cuts a brand-new Wildcard Joker and deals 13 fresh cards + 1 open discard card.
   * 3. Assigns opening turn to roundStarterIndex (skipping eliminated players).
   */
  public startRound(): void {
    const allSeated = Array.from(this.players.values()).sort(
      (a, b) => a.seatNumber - b.seatNumber
    );
    const activePlayers = allSeated.filter((p) => !p.isEliminated);

    if (activePlayers.length < 2) {
      throw new Error("Need at least 2 active players to start round");
    }

    this.clearTimers();
    this.status = "DEALING";
    this.winnerId = undefined;
    this.winnerMelds = undefined;
    this.roundRevealedHands = undefined;
    this.submittedMeldPlayerIds.clear();
    this.roundScores = {};
    this.roundDropRecords.clear();
    this.turnEndsAt = null;
    this.showEndsAt = null;
    this.tossEndsAt = null;
    this.nextRoundEndsAt = null;
    this.tossResults = undefined;

    // Dynamic deck count: <= 3 active players -> 1 deck (54 cards), 4-6 players -> 2 decks (108 cards)
    const deckCount = activePlayers.length <= 3 ? 1 : 2;
    this.deck.reset(deckCount);
    this.deck.shuffle();

    // Preserve permanent seat order across all seated players
    this.turnOrder = allSeated.map((p) => p.id);

    // Deal 13 fresh cards only to non-eliminated players; eliminated players sit out cleanly
    const { hands } = this.deck.deal(activePlayers.length, 13);
    const activeHandById = new Map<string, Card[]>();
    for (let i = 0; i < activePlayers.length; i++) {
      activeHandById.set(activePlayers[i].id, hands[i]);
    }

    for (const p of allSeated) {
      if (p.isEliminated) {
        p.hand = [];
        p.hasDropped = true;
        p.canPlayCurrentRound = false;
        p.offlineTurnsMissed = 0;
        p.score = 0;
        p.consecutiveTimeouts = 0;
        p.hasDrawn = false;
        p.melds = undefined;
      } else {
        p.hand = activeHandById.get(p.id) || [];
        p.hasDropped = false;
        p.canPlayCurrentRound = true;
        p.offlineTurnsMissed = 0;
        p.score = 0;
        p.consecutiveTimeouts = 0;
        p.hasDrawn = false;
        p.melds = undefined;
      }
    }

    // Cut a brand-new Wildcard Joker from remaining deck
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

    // Place one initial card face up in open discard pile
    const initialDiscard = this.deck.draw();
    if (!initialDiscard) throw new Error("Deck exhausted during initial discard");
    if (!initialDiscard.isPrintedJoker && initialDiscard.rank === this.wildRank) {
      initialDiscard.isWildJoker = true;
    }
    this.discardPile = [initialDiscard];

    // Pick opening player from roundStarterIndex, skipping any eliminated players
    const starterIdx = this.findNextEligibleIndex(
      this.roundStarterIndex % this.turnOrder.length,
      true
    );
    this.roundStarterIndex = starterIdx;
    this.currentTurnIndex = starterIdx;
    this.turnPhase = "DRAW";
    this.status = "PLAYING";

    // Notify each seated player privately of their new hand (eliminated players get [])
    for (const p of allSeated) {
      if (this.onPrivateUpdate) {
        this.onPrivateUpdate(p.id, [...p.hand]);
      }
    }

    this.startTurnTimer();
    this.broadcastState();

    // If the opening player is already disconnected (and another active player is online), apply offline handling
    this.handleOfflineTurnIfNeeded();
  }

  /**
   * Advances to the next round:
   * - Removes any player who remained offline for >= 1 full circle (round) without returning.
   * - Rotates the opening player circularly (#1 -> #2 -> #3 -> ...), skipping eliminated players.
   * - Reshuffles fresh deck, cuts a new Wildcard Joker, and deals 13 fresh cards.
   */
  public startNextRound(nextDbGameId?: string): void {
    if (this.status !== "ROUND_END") {
      throw new Error(`Cannot start next round in status ${this.status}`);
    }

    // Remove players who stayed offline for a full circle (1 full round) without returning
    const offlineToRemove: string[] = [];
    for (const p of this.players.values()) {
      if (p.connectionStatus === "DISCONNECTED" && p.offlineRoundsMissed >= 1) {
        offlineToRemove.push(p.id);
      }
    }
    for (const pid of offlineToRemove) {
      const removedIdx = this.turnOrder.indexOf(pid);
      this.players.delete(pid);
      this.turnOrder = this.turnOrder.filter((id) => id !== pid);
      if (removedIdx !== -1 && removedIdx < this.roundStarterIndex) {
        this.roundStarterIndex = Math.max(0, this.roundStarterIndex - 1);
      }
      if (this.onRemoveOfflinePlayer) {
        this.onRemoveOfflinePlayer(pid);
      }
    }

    const remainingSurvivors = Array.from(this.players.values()).filter(
      (p) => !p.isEliminated
    );
    if (remainingSurvivors.length < 2) {
      const champ = remainingSurvivors[0] ?? Array.from(this.players.values())[0];
      this.status = "GAME_OVER";
      this.nextRoundEndsAt = null;
      if (champ) {
        this.winnerId = champ.id;
      }
      this.broadcastState();
      return;
    }

    if (!this.poolMode && this.roundNumber >= this.roundCount) {
      throw new Error("All scheduled rounds have already been completed");
    }

    this.roundNumber += 1;
    this.currentRoundGameId = nextDbGameId || `${this.id}_r${this.roundNumber}`;

    // Rotate starting player circularly (#1 -> #2 -> #3 -> ...), skipping eliminated seats
    if (this.turnOrder.length > 0) {
      const nextCandidate = (this.roundStarterIndex + 1) % this.turnOrder.length;
      this.roundStarterIndex = this.findNextEligibleIndex(nextCandidate, false);
    }

    this.startRound();
  }

  /** Alias for startNextRound() */
  public nextRound(nextDbGameId?: string): void {
    this.startNextRound(nextDbGameId);
  }

  /**
   * Resets all scores, elimination flags, and round history for an instant rematch
   * inside the same room without disconnecting LiveKit, then runs a fresh Toss.
   */
  public restartMatch(nextDbGameId?: string): void {
    if (this.status !== "GAME_OVER") {
      throw new Error(`Cannot restart match in status ${this.status}`);
    }
    if (this.players.size < 2) {
      throw new Error("Need at least 2 players to restart match");
    }

    this.clearTimers();
    this.roundNumber = 1;
    this.currentRoundGameId = nextDbGameId || `${this.id}_rematch_${Date.now()}`;
    this.roundHistory = [];
    this.roundScores = {};
    this.roundDropRecords.clear();
    this.submittedMeldPlayerIds.clear();
    this.winnerId = undefined;
    this.winnerMelds = undefined;
    this.roundRevealedHands = undefined;
    this.roundStarterIndex = 0;
    this.nextRoundEndsAt = null;

    for (const p of this.players.values()) {
      p.score = 0;
      p.totalScore = 0;
      p.isEliminated = false;
      p.hasDropped = false;
      p.canPlayCurrentRound = true;
      p.offlineTurnsMissed = 0;
      p.offlineRoundsMissed = 0;
      p.consecutiveTimeouts = 0;
      p.hasDrawn = false;
      p.hand = [];
      p.melds = undefined;
    }

    this.startToss();
  }

  private findNextEligibleIndex(startIdx: number, includeDroppedCheck: boolean): number {
    if (this.turnOrder.length === 0) return 0;
    const len = this.turnOrder.length;
    for (let offset = 0; offset < len; offset++) {
      const idx = (startIdx + offset) % len;
      const p = this.players.get(this.turnOrder[idx]);
      if (!p || p.isEliminated) continue;
      if (includeDroppedCheck && p.hasDropped) continue;
      return idx;
    }
    return 0;
  }

  /**
   * Active player draws 1 card from Closed Deck or Open Discard Pile.
   * Blocks picking a Printed Joker or Wildcard Joker from the Open Pile.
   */
  public drawCard(
    playerId: string,
    source: "CLOSED" | "DISCARD" | "OPEN"
  ): { drawnCard: Card; publicState: PublicGameState } {
    this.validateTurn(playerId, "DRAW");
    const player = this.players.get(playerId)!;

    const requestedOpen = source === "DISCARD" || source === "OPEN";
    let effectiveSource: "CLOSED" | "DISCARD" = requestedOpen ? "DISCARD" : "CLOSED";
    let drawnCard: Card | undefined;

    if (effectiveSource === "DISCARD") {
      if (this.discardPile.length === 0) {
        throw new Error("Discard pile is empty");
      }
      const topCard = this.discardPile[this.discardPile.length - 1];
      const isTopJoker =
        topCard.isPrintedJoker ||
        topCard.rank === "PRINTED_JOKER" ||
        topCard.isWildJoker ||
        topCard.rank === this.wildRank;
      if (isTopJoker) {
        throw new Error("Cannot pick a Joker from the Open Pile");
      }
      drawnCard = this.discardPile.pop()!;
    } else {
      if (this.deck.count === 0) {
        this.reshuffleDiscardIntoDeck();
      }
      // If closed deck is still empty (nothing to reshuffle), fall back to discard pile
      // so the game cannot stall. If discard is also empty, no cards are available.
      if (this.deck.count === 0) {
        if (this.discardPile.length === 0) {
          throw new Error("No cards available to draw");
        }
        effectiveSource = "DISCARD";
        drawnCard = this.discardPile.pop()!;
      } else {
        drawnCard = this.deck.draw();
        if (!drawnCard) throw new Error("No cards available to draw");
      }
    }

    // Mark wild joker using explicit wildRank (handles Printed Joker cut -> Ace wild)
    if (!drawnCard.isPrintedJoker && drawnCard.rank === this.wildRank) {
      drawnCard.isWildJoker = true;
    }

    player.hand.push(drawnCard);
    player.hasDrawn = true;
    player.consecutiveTimeouts = 0;
    player.offlineTurnsMissed = 0;
    this.turnPhase = "DISCARD";

    // Send private update to active player
    if (this.onPrivateUpdate) {
      this.onPrivateUpdate(player.id, [...player.hand]);
    }

    this.startTurnTimer();
    const publicState = this.getPublicState({
      playerId,
      username: player.username,
      type: effectiveSource === "CLOSED" ? "DRAW_CLOSED" : "DRAW_OPEN",
      card: effectiveSource === "DISCARD" ? drawnCard : undefined, // Open draw is public
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
    player.offlineTurnsMissed = 0;

    // Update player hand privately
    if (this.onPrivateUpdate) {
      this.onPrivateUpdate(player.id, [...player.hand]);
    }

    const lastAction: PublicGameState["lastAction"] = {
      playerId,
      username: player.username,
      type: "DISCARD",
      card: discardedCard,
      timestamp: Date.now(),
    };

    // Advance turn to next active player (and broadcast discard before any offline skip/drop)
    this.advanceTurnStep();
    const afterDiscardState = this.getPublicState(lastAction);
    if (this.onStateUpdate) {
      this.onStateUpdate(afterDiscardState);
    }

    // Apply offline turn skip / auto-drop if the new current turn player is disconnected
    this.handleOfflineTurnIfNeeded();

    return { discardedCard, publicState: this.getPublicState(lastAction) };
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
    player.canPlayCurrentRound = false;
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
      (p) => !p.hasDropped && !p.isEliminated
    );

    if (remainingPlayers.length === 1) {
      // Round finishes! Remaining player wins round; include ALL dropped players in roundScores
      const winner = remainingPlayers[0];
      const scores = this.buildDropEndScores(winner, "Winner (Opponents Dropped)");
      this.endRound(winner.id, scores, lastAction);
      return { penalty, publicState: this.getPublicState(lastAction) };
    }

    this.advanceTurnStep();
    const publicState = this.getPublicState(lastAction);
    if (this.onStateUpdate) {
      this.onStateUpdate(publicState);
    }
    this.handleOfflineTurnIfNeeded();

    return { penalty, publicState: this.getPublicState(lastAction) };
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
      player.canPlayCurrentRound = false;
      this.roundDropRecords.set(player.id, {
        points: 80,
        reason: "Invalid Declaration (80 pts)",
      });

      const remainingPlayers = Array.from(this.players.values()).filter(
        (p) => !p.hasDropped && !p.isEliminated
      );

      if (remainingPlayers.length === 1) {
        const winner = remainingPlayers[0];
        const scores = this.buildDropEndScores(winner, "Winner");
        this.endRound(winner.id, scores, lastAction);
      } else {
        this.advanceTurnStep();
        this.broadcastState(lastAction);
        this.handleOfflineTurnIfNeeded();
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

      if (other.isEliminated && other.hand.length === 0) {
        scores[other.id] = {
          points: 0,
          totalScore: other.totalScore,
          reason: "Eliminated (Sitting Out)",
        };
        continue;
      }

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
      (p) => p.id !== this.winnerId && !p.hasDropped && !p.isEliminated
    );
  }

  /**
   * Builds a complete roundScores map containing the winner plus ALL dropped/eliminated players.
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
      } else if (p.isEliminated && p.hand.length === 0 && !this.roundDropRecords.has(p.id)) {
        scores[p.id] = {
          points: 0,
          totalScore: p.totalScore,
          reason: "Eliminated (Sitting Out)",
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

  private advanceTurnStep(): void {
    const activeIds = this.turnOrder.filter((id) => {
      const p = this.players.get(id);
      return p && !p.hasDropped && !p.isEliminated && p.canPlayCurrentRound;
    });

    if (activeIds.length <= 1) return;

    let nextIndex = (this.currentTurnIndex + 1) % this.turnOrder.length;
    let guard = 0;
    while (guard < this.turnOrder.length) {
      const candidate = this.players.get(this.turnOrder[nextIndex]);
      if (
        candidate &&
        !candidate.hasDropped &&
        !candidate.isEliminated &&
        candidate.canPlayCurrentRound
      ) {
        break;
      }
      nextIndex = (nextIndex + 1) % this.turnOrder.length;
      guard++;
    }

    this.currentTurnIndex = nextIndex;
    this.turnPhase = "DRAW";
    this.startTurnTimer();
  }

  private advanceTurn(): void {
    this.advanceTurnStep();
    this.handleOfflineTurnIfNeeded();
  }

  private hasAnyConnectedActivePlayer(): boolean {
    for (const p of this.players.values()) {
      if (
        !p.hasDropped &&
        !p.isEliminated &&
        p.canPlayCurrentRound &&
        p.connectionStatus === "CONNECTED"
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Handles offline/disconnected players when their turn arrives:
   * - 1st missed turn while offline: skip cleanly to the next active player.
   * - 2nd missed turn while offline: auto-drop for this round (penalty 20/40 pts, canPlayCurrentRound=false).
   * Only runs while at least 1 other active player is connected (if all disconnect, timer pauses).
   */
  public handleOfflineTurnIfNeeded(): void {
    if (this.status !== "PLAYING") return;
    if (!this.hasAnyConnectedActivePlayer()) return;

    const maxIterations = Math.max(2, this.turnOrder.length * 2);
    for (let step = 0; step < maxIterations; step++) {
      if (this.status !== "PLAYING") return;
      if (!this.hasAnyConnectedActivePlayer()) return;

      const currentId = this.getCurrentTurnPlayerId();
      const current = this.players.get(currentId);
      if (
        !current ||
        current.hasDropped ||
        current.isEliminated ||
        current.connectionStatus === "CONNECTED"
      ) {
        return;
      }

      current.offlineTurnsMissed += 1;

      if (current.offlineTurnsMissed === 1) {
        // 1st missed turn offline: skip cleanly to next active player
        const skipAction: PublicGameState["lastAction"] = {
          playerId: current.id,
          username: current.username,
          type: "SKIP_OFFLINE",
          timestamp: Date.now(),
        };
        this.advanceTurnStep();
        this.broadcastState(skipAction);
      } else {
        // 2nd missed turn offline: auto-drop for the remainder of this round
        const isFirstDrop = current.hand.length === 13 && !current.hasDrawn;
        const penalty = isFirstDrop ? 20 : 40;
        const reason = `Offline Auto-Drop (${penalty} pts)`;

        current.hasDropped = true;
        current.canPlayCurrentRound = false;
        current.score += penalty;
        current.totalScore += penalty;
        this.roundDropRecords.set(current.id, { points: penalty, reason });

        const dropAction: PublicGameState["lastAction"] = {
          playerId: current.id,
          username: current.username,
          type: "DROP",
          timestamp: Date.now(),
        };

        const remainingPlayers = Array.from(this.players.values()).filter(
          (p) => !p.hasDropped && !p.isEliminated
        );

        if (remainingPlayers.length === 1) {
          const winner = remainingPlayers[0];
          const scores = this.buildDropEndScores(winner, "Winner (Opponents Dropped)");
          this.endRound(winner.id, scores, dropAction);
          return;
        }

        this.advanceTurnStep();
        this.broadcastState(dropAction);
      }
    }
  }

  public isTimerRunning(): boolean {
    return this.timerInterval !== null || this.tossTimer !== null;
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
    this.tossEndsAt = null;
  }

  /**
   * Resumes a paused turn, show, or toss timer (e.g., when a player reconnects after
   * all players had disconnected). Returns true if a timer was restarted.
   */
  public resumeTimer(): boolean {
    if (this.timerInterval !== null || this.tossTimer !== null) return false;

    if (this.status === "TOSS") {
      const remainingMs = Math.min(this.tossDurationMs, 1500);
      this.tossEndsAt = Date.now() + remainingMs;
      this.scheduleTossCompletion(remainingMs);
      return true;
    }

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

    // If the active turn player is currently offline/disconnected, apply offline skip -> auto-drop rules
    if (player.connectionStatus === "DISCONNECTED") {
      if (this.turnPhase === "DISCARD") {
        // Discard last card so hand returns to 13 before advancing/skipping
        const lastCard = player.hand[player.hand.length - 1];
        if (lastCard) {
          player.hand.pop();
          this.discardPile.push(lastCard);
        }
        this.turnPhase = "DRAW";
      }
      this.handleOfflineTurnIfNeeded();
      if (this.onTurnTimeout) {
        this.onTurnTimeout(player.id);
      }
      return;
    }

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
    if (this.tossTimer) {
      clearTimeout(this.tossTimer);
      this.tossTimer = null;
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
    this.tossEndsAt = null;
    this.turnTimeRemaining = 0;

    // Build visual round-end hand reveal (ONLY exposed on ROUND_END / GAME_OVER!)
    const revealedHands: Record<string, Card[][]> = {};
    for (const p of this.players.values()) {
      if (p.id === winnerId && this.winnerMelds && this.winnerMelds.length > 0) {
        revealedHands[p.id] = this.winnerMelds;
      } else if (p.melds && p.melds.length > 0) {
        revealedHands[p.id] = p.melds;
      } else if (p.hand.length > 0) {
        revealedHands[p.id] = [Evaluator.sortHand(p.hand, "SUIT")];
      } else {
        revealedHands[p.id] = [];
      }

      // Pool Points Mode elimination check: >= targetPoints eliminates player from subsequent rounds
      if (p.totalScore >= this.targetPoints) {
        p.isEliminated = true;
      }

      // Track full rounds stayed offline (1-circle grace before removal on next round)
      if (p.connectionStatus === "DISCONNECTED") {
        p.offlineRoundsMissed += 1;
      }
    }
    this.roundRevealedHands = revealedHands;

    const activeSurvivors = Array.from(this.players.values()).filter(
      (p) => !p.isEliminated
    );
    const matchComplete = this.poolMode
      ? activeSurvivors.length <= 1
      : activeSurvivors.length <= 1 || this.roundNumber >= this.roundCount;

    this.status = matchComplete ? "GAME_OVER" : "ROUND_END";
    this.winnerId = winnerId;
    this.roundScores = scores;
    const roundPoints: Record<string, number> = {};
    for (const [pid, info] of Object.entries(scores)) {
      roundPoints[pid] = info.points;
    }
    this.roundHistory.push({ roundNumber: this.roundNumber, scores: roundPoints });
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
        isEliminated: p.isEliminated,
        offlineTurnsMissed: p.offlineTurnsMissed,
        canPlayCurrentRound: p.canPlayCurrentRound,
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

    const showRevealedHands =
      this.status === "ROUND_END" || this.status === "GAME_OVER";

    return {
      gameId: this.currentRoundGameId,
      roomId: this.roomId,
      roomCode: this.roomCode,
      status: this.status,
      roundNumber: this.roundNumber,
      roundCount: this.roundCount,
      targetPoints: this.targetPoints,
      deckCount: this.deck.deckCount,
      currentTurnPlayerId: currentId,
      turnPhase: this.turnPhase,
      turnTimeLimitSeconds: this.turnTimeLimit,
      turnTimeRemainingSeconds: computedRemainingSeconds,
      turnEndsAt: this.turnEndsAt,
      showTimeLimitSeconds: this.showTimeLimit,
      showEndsAt: this.showEndsAt,
      nextRoundEndsAt: this.status === "ROUND_END" ? this.nextRoundEndsAt : null,
      tossResults: this.tossResults,
      tossEndsAt: this.tossEndsAt,
      wildJoker: this.wildJoker,
      wildRank: this.wildRank,
      topDiscardCard:
        this.discardPile.length > 0
          ? this.discardPile[this.discardPile.length - 1]
          : null,
      recentDiscards: this.discardPile.slice(-5),
      closedDeckCount: this.deck.count,
      discardPileCount: this.discardPile.length,
      players: publicPlayers,
      lastAction,
      winnerId: this.winnerId,
      winnerMelds: this.winnerMelds,
      roundRevealedHands: showRevealedHands ? this.roundRevealedHands : undefined,
      submittedMeldPlayerIds: Array.from(this.submittedMeldPlayerIds),
      roundScores: this.roundScores,
      roundHistory: this.roundHistory.length > 0 ? [...this.roundHistory] : undefined,
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
    const player = this.players.get(playerId);
    if (player && player.isEliminated) {
      throw new Error("Eliminated players cannot play in this round");
    }
    if (player && (!player.canPlayCurrentRound || player.hasDropped)) {
      throw new Error("You can rejoin gameplay on the next round");
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
