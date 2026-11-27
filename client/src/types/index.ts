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
  id: string;
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
  | "SHOW"
  | "DECLARED"
  | "ROUND_END"
  | "GAME_OVER";

export type TurnPhase = "DRAW" | "DISCARD";

export interface PlayerRanking {
  playerId: string;
  username: string;
  totalScore: number;
  rank: number;
}

export interface PublicGameState {
  gameId: string;
  roomId: string;
  roomCode: string;
  status: GameStatus;
  roundNumber: number;
  roundCount?: number;
  currentTurnPlayerId: string;
  turnPhase: TurnPhase;
  turnTimeLimitSeconds: number;
  turnTimeRemainingSeconds: number;
  turnEndsAt?: number | null;
  showTimeLimitSeconds?: number;
  showEndsAt?: number | null;
  wildJoker: Card;
  wildRank?: Rank;
  topDiscardCard: Card | null;
  closedDeckCount: number;
  discardPileCount: number;
  players: PlayerPublicInfo[];
  lastAction?: {
    playerId: string;
    username: string;
    type: "DRAW_CLOSED" | "DRAW_OPEN" | "DISCARD" | "DROP" | "DECLARE" | "SUBMIT_MELDS";
    card?: Card;
    timestamp: number;
  };
  winnerId?: string;
  winnerMelds?: Card[][];
  submittedMeldPlayerIds?: string[];
  roundScores?: Record<string, { points: number; totalScore: number; reason: string }>;
  totalScores?: Record<string, number>;
  rankings?: PlayerRanking[];
}

export interface RoomInfo {
  id: string;
  roomCode: string;
  roomName: string;
  maxPlayers: number;
  roundCount: number;
  entryPoints: number;
  turnTimeLimitSeconds?: number;
  hasPassword?: boolean;
  status: string;
  host?: {
    id: string;
    username: string;
    profileImage?: string | null;
  } | null;
  players?: Array<{
    userId: string;
    username: string;
    profileImage: string | null;
    seatNumber: number;
    isReady: boolean;
    connectionStatus: string;
  }>;
  inviteUrl?: string;
  qrCode?: string;
}

export interface FriendUserSummary {
  id: string;
  username: string;
  profileImage?: string | null;
}

export interface FriendItem {
  id: string;
  friendUser: FriendUserSummary | null;
  isOnline: boolean;
  createdAt: string;
}

export interface PendingFriendRequest {
  id: string;
  sender: FriendUserSummary | null;
  createdAt: string;
}

export interface MatchHistoryItem {
  id: string;
  points: number;
  isWinner: boolean;
  hasDropped: boolean;
  createdAt: string;
  game?: {
    id?: string;
    gameStatus?: string;
    room?: {
      roomName?: string;
      roomCode?: string;
    } | null;
  } | null;
}

export interface RoomInvite {
  roomCode: string;
  roomName: string;
  fromUsername: string;
  fromUserId?: string;
  timestamp: number;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  profileImage: string;
  isGuest: boolean;
}

export interface LobbyPlayer {
  userId: string;
  username: string;
  profileImage: string;
  seatNumber: number;
  isReady: boolean;
  connectionStatus: "CONNECTED" | "DISCONNECTED";
  isHost: boolean;
}
