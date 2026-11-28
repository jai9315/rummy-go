import { create } from "zustand";
import {
  Card,
  ChatBubble,
  FeltTheme,
  LobbyPlayer,
  PublicGameState,
  RoomInvite,
  TableChatMessage,
  TableReaction,
} from "../types";

export interface SetPrivateHandOptions {
  /**
   * When true (e.g. after SORT_HAND), replace existing group ordering with
   * the newly sorted hand order instead of preserving the old group layout.
   */
  applyOrder?: boolean;
}

const FELT_THEME_STORAGE_KEY = "rummy_felt_theme";

function readInitialFeltTheme(): FeltTheme {
  if (typeof window === "undefined") return "emerald";
  try {
    const saved = window.localStorage.getItem(FELT_THEME_STORAGE_KEY);
    if (saved === "royal" || saved === "burgundy" || saved === "emerald") {
      return saved;
    }
    return "emerald";
  } catch {
    return "emerald";
  }
}

interface GameStoreState {
  gameState: PublicGameState | null;
  privateHand: Card[];
  selectedCardIds: string[];
  handGroups: Card[][];
  lobbyPlayers: LobbyPlayer[];
  error: string | null;
  kickedMessage: string | null;
  pendingInvite: RoomInvite | null;
  isMuted: boolean;
  feltTheme: FeltTheme;
  chatMessages: TableChatMessage[];
  activeChatBubbles: Record<string, ChatBubble>;
  unreadChatCount: number;
  activeReactions: TableReaction[];
  showDeclareModal: boolean;
  declareCardId: string | null;
  pendingDrawTargetGroupIndex: number | null;

  setGameState: (state: PublicGameState | null) => void;
  setPrivateHand: (cards: Card[], options?: SetPrivateHandOptions) => void;
  setPendingDrawTargetGroup: (groupIndex: number | null) => void;
  setLobbyPlayers: (players: LobbyPlayer[]) => void;
  setError: (err: string | null) => void;
  setKickedMessage: (msg: string | null) => void;
  setPendingInvite: (invite: RoomInvite | null) => void;
  clearPendingInvite: () => void;
  toggleMuted: () => void;
  setFeltTheme: (theme: FeltTheme) => void;
  addChatMessage: (msg: TableChatMessage) => void;
  clearChatBubble: (playerId: string, messageId?: string) => void;
  markChatRead: () => void;
  addReaction: (reaction: TableReaction) => void;
  removeReaction: (reactionId: string) => void;
  toggleCardSelection: (cardId: string) => void;
  clearSelection: () => void;
  groupSelectedCards: () => void;
  ungroupMeld: (groupIndex: number) => void;
  moveCard: (
    cardId: string,
    targetGroupIndex: number,
    targetCardIndex?: number
  ) => void;
  setHandGroups: (groups: Card[][]) => void;
  setShowDeclareModal: (show: boolean, declareCardId?: string | null) => void;
  returnToLobby: () => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  gameState: null,
  privateHand: [],
  selectedCardIds: [],
  handGroups: [],
  lobbyPlayers: [],
  error: null,
  kickedMessage: null,
  pendingInvite: null,
  isMuted: false,
  feltTheme: readInitialFeltTheme(),
  chatMessages: [],
  activeChatBubbles: {},
  unreadChatCount: 0,
  activeReactions: [],
  showDeclareModal: false,
  declareCardId: null,
  pendingDrawTargetGroupIndex: null,

  setGameState: (state) => set({ gameState: state }),

  setPendingDrawTargetGroup: (groupIndex) =>
    set({ pendingDrawTargetGroupIndex: groupIndex }),

  setPrivateHand: (cards, options) => {
    const validCardIds = new Set(cards.map((c) => c.id));
    const prunedSelectedCardIds = get().selectedCardIds.filter((id) =>
      validCardIds.has(id)
    );
    const currentGroups = get().handGroups;
    const pendingTargetGroup = get().pendingDrawTargetGroupIndex;

    // Apply incoming order directly when groups are empty or an explicit sort was requested
    if (options?.applyOrder || currentGroups.length === 0) {
      set({
        privateHand: cards,
        handGroups: cards.length > 0 ? [cards] : [],
        selectedCardIds: prunedSelectedCardIds,
        pendingDrawTargetGroupIndex: null,
      });
      return;
    }

    // Re-map cards preserving existing groups
    const cardMap = new Map(cards.map((c) => [c.id, c]));
    const newGroups: Card[][] = [];
    const placedIds = new Set<string>();

    for (const group of currentGroups) {
      const updatedGroup = group
        .map((c) => cardMap.get(c.id))
        .filter((c): c is Card => !!c);
      if (updatedGroup.length > 0) {
        newGroups.push(updatedGroup);
        updatedGroup.forEach((c) => placedIds.add(c.id));
      }
    }

    // Place any newly drawn card(s) into the dropped target meld group (if chosen) or last group
    const unplaced = cards.filter((c) => !placedIds.has(c.id));
    if (unplaced.length > 0) {
      if (
        pendingTargetGroup !== null &&
        pendingTargetGroup >= 0 &&
        pendingTargetGroup < newGroups.length
      ) {
        newGroups[pendingTargetGroup].push(...unplaced);
      } else if (
        pendingTargetGroup !== null &&
        pendingTargetGroup >= newGroups.length
      ) {
        newGroups.push([...unplaced]);
      } else if (newGroups.length > 0) {
        newGroups[newGroups.length - 1].push(...unplaced);
      } else {
        newGroups.push(unplaced);
      }
    }

    set({
      privateHand: cards,
      handGroups: newGroups,
      selectedCardIds: prunedSelectedCardIds,
      pendingDrawTargetGroupIndex:
        unplaced.length > 0 ? null : pendingTargetGroup,
    });
  },

  setLobbyPlayers: (players) => set({ lobbyPlayers: players }),

  setError: (err) => set({ error: err }),

  setKickedMessage: (msg) => set({ kickedMessage: msg }),

  setPendingInvite: (invite) => set({ pendingInvite: invite }),

  clearPendingInvite: () => set({ pendingInvite: null }),

  toggleMuted: () => set((state) => ({ isMuted: !state.isMuted })),

  setFeltTheme: (feltTheme) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(FELT_THEME_STORAGE_KEY, feltTheme);
      } catch {}
    }
    set({ feltTheme });
  },

  addChatMessage: (msg) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, msg].slice(-80),
      activeChatBubbles: {
        ...state.activeChatBubbles,
        [msg.playerId]: {
          id: msg.id,
          playerId: msg.playerId,
          username: msg.username,
          text: msg.text,
          timestamp: msg.timestamp,
        },
      },
      unreadChatCount: state.unreadChatCount + 1,
    })),

  clearChatBubble: (playerId, messageId) =>
    set((state) => {
      const existing = state.activeChatBubbles[playerId];
      if (!existing) return state;
      if (messageId && existing.id !== messageId) return state;
      const next = { ...state.activeChatBubbles };
      delete next[playerId];
      return { activeChatBubbles: next };
    }),

  markChatRead: () => set({ unreadChatCount: 0 }),

  addReaction: (reaction) =>
    set((state) => ({
      activeReactions: [...state.activeReactions, reaction].slice(-20),
    })),

  removeReaction: (reactionId) =>
    set((state) => ({
      activeReactions: state.activeReactions.filter((r) => r.id !== reactionId),
    })),

  toggleCardSelection: (cardId) => {
    const selected = get().selectedCardIds;
    if (selected.includes(cardId)) {
      set({ selectedCardIds: selected.filter((id) => id !== cardId) });
    } else {
      set({ selectedCardIds: [...selected, cardId] });
    }
  },

  clearSelection: () => set({ selectedCardIds: [] }),

  groupSelectedCards: () => {
    const { selectedCardIds, handGroups } = get();
    if (selectedCardIds.length === 0) return;

    const selectedSet = new Set(selectedCardIds);
    const selectedCards: Card[] = [];
    const remainingGroups: Card[][] = [];

    for (const group of handGroups) {
      const remainingInGroup: Card[] = [];
      for (const card of group) {
        if (selectedSet.has(card.id)) {
          selectedCards.push(card);
        } else {
          remainingInGroup.push(card);
        }
      }
      if (remainingInGroup.length > 0) {
        remainingGroups.push(remainingInGroup);
      }
    }

    if (selectedCards.length > 0) {
      set({
        handGroups: [...remainingGroups, selectedCards],
        selectedCardIds: [],
      });
    }
  },

  ungroupMeld: (groupIndex) => {
    const { handGroups } = get();
    if (
      handGroups.length <= 1 ||
      groupIndex < 0 ||
      groupIndex >= handGroups.length
    ) {
      return;
    }

    const releasedCards = handGroups[groupIndex];
    const remainingGroups = handGroups.filter((_, idx) => idx !== groupIndex);

    if (remainingGroups.length === 0) {
      set({ handGroups: [releasedCards], selectedCardIds: [] });
      return;
    }

    // Merge released cards back into the first (ungrouped) pool
    const updatedGroups = remainingGroups.map((group, idx) =>
      idx === 0 ? [...group, ...releasedCards] : group
    );
    set({ handGroups: updatedGroups, selectedCardIds: [] });
  },

  moveCard: (cardId, targetGroupIndex, targetCardIndex) => {
    const { handGroups } = get();
    let sourceGroupIndex = -1;
    let sourceCardIndex = -1;

    for (let g = 0; g < handGroups.length; g++) {
      const idx = handGroups[g].findIndex((c) => c.id === cardId);
      if (idx !== -1) {
        sourceGroupIndex = g;
        sourceCardIndex = idx;
        break;
      }
    }

    if (sourceGroupIndex === -1 || sourceCardIndex === -1) return;

    // No-op if dropped onto exact same position in same group
    if (
      sourceGroupIndex === targetGroupIndex &&
      targetCardIndex !== undefined &&
      targetCardIndex === sourceCardIndex
    ) {
      return;
    }

    const nextGroups = handGroups.map((group) => [...group]);
    const [movedCard] = nextGroups[sourceGroupIndex].splice(sourceCardIndex, 1);
    if (!movedCard) return;

    if (targetGroupIndex >= nextGroups.length) {
      // Dropped into a brand-new group target
      nextGroups.push([movedCard]);
    } else if (targetGroupIndex >= 0) {
      const destination = nextGroups[targetGroupIndex];
      const insertAt =
        targetCardIndex === undefined
          ? destination.length
          : Math.min(Math.max(0, targetCardIndex), destination.length);
      destination.splice(insertAt, 0, movedCard);
    } else {
      nextGroups[0].push(movedCard);
    }

    const cleanedGroups = nextGroups.filter((group) => group.length > 0);
    set({ handGroups: cleanedGroups });
  },

  setHandGroups: (groups) => set({ handGroups: groups }),

  setShowDeclareModal: (show, declareCardId = null) =>
    set({ showDeclareModal: show, declareCardId }),

  returnToLobby: () =>
    set({
      gameState: null,
      privateHand: [],
      selectedCardIds: [],
      handGroups: [],
      showDeclareModal: false,
      declareCardId: null,
    }),

  resetGame: () =>
    set({
      gameState: null,
      privateHand: [],
      selectedCardIds: [],
      handGroups: [],
      lobbyPlayers: [],
      error: null,
      kickedMessage: null,
      chatMessages: [],
      activeChatBubbles: {},
      unreadChatCount: 0,
      activeReactions: [],
      showDeclareModal: false,
      declareCardId: null,
    }),
}));
