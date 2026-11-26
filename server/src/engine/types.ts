export type Suit = "HEARTS" | "SPADES" | "DIAMONDS" | "CLUBS" | "JOKER";

export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "PRINTED_JOKER";

export interface Card {
  id: string; // e.g. "H_A_1", "PJ_1"
  suit: Suit;
  rank: Rank;
  isWildJoker: boolean;
  isPrintedJoker: boolean;
  deckIndex?: number;
}

export type MeldType = "PURE_SEQUENCE" | "IMPURE_SEQUENCE" | "SET" | "INVALID";

export interface MeldGroup {
  type: MeldType;
  cards: Card[];
  isValid: boolean;
  reason?: string;
}

export interface PlayerPublicInfo {
  id: string;
  username: string;
  profileImage: string;
  seatNumber: number;
  cardCount: number;
  isCurrentTurn: boolean;
  isReady: boolean;
  connectionStatus: "CONNECTED" | "DISCONNECTED";
  hasDropped: boolean;
  score: number;
}

export type GameStatus =
  | "WAITING"
  | "DEALING"
  | "PLAYING"
  | "DECLARED"
  | "ROUND_END"
  | "GAME_OVER";

export type TurnPhase = "DRAW" | "DISCARD";

export interface PublicGameState {
  gameId: string;
  roomId: string;
  roomCode: string;
  status: GameStatus;
  roundNumber: number;
  currentTurnPlayerId: string;
  turnPhase: TurnPhase;
  turnTimeLimitSeconds: number;
  turnTimeRemainingSeconds: number;
  wildJoker: Card;
  topDiscardCard: Card | null;
  closedDeckCount: number;
  discardPileCount: number;
  players: PlayerPublicInfo[];
  lastAction?: {
    playerId: string;
    username: string;
    type: "DRAW_CLOSED" | "DRAW_OPEN" | "DISCARD" | "DROP" | "DECLARE";
    card?: Card;
    timestamp: number;
  };
  winnerId?: string;
  roundScores?: Record<string, { points: number; totalScore: number; reason: string }>;
}

export interface PrivateHandUpdate {
  type: "PRIVATE_HAND_UPDATE";
  playerId: string;
  cards: Card[];
  groups?: Card[][];
  timestamp: number;
}
