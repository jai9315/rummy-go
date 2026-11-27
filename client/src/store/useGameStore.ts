import { create } from "zustand";
import { Card, LobbyPlayer, PublicGameState, RoomInvite } from "../types";

export interface SetPrivateHandOptions {
  /**
   * When true (e.g. after SORT_HAND), replace existing group ordering with
   * the newly sorted hand order instead of preserving the old group layout.
   */
  applyOrder?: boolean;
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
  showDeclareModal: boolean;
  declareCardId: string | null;

  setGameState: (state: PublicGameState | null) => void;
  setPrivateHand: (cards: Card[], options?: SetPrivateHandOptions) => void;
  setLobbyPlayers: (players: LobbyPlayer[]) => void;
  setError: (err: string | null) => void;
  setKickedMessage: (msg: string | null) => void;
  setPendingInvite: (invite: RoomInvite | null) => void;
  clearPendingInvite: () => void;
  toggleMuted: () => void;
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
  showDeclareModal: false,
  declareCardId: null,

  setGameState: (state) => set({ gameState: state }),

  setPrivateHand: (cards, options) => {
    const validCardIds = new Set(cards.map((c) => c.id));
    const prunedSelectedCardIds = get().selectedCardIds.filter((id) =>
      validCardIds.has(id)
    );
    const currentGroups = get().handGroups;

    // Apply incoming order directly when groups are empty or an explicit sort was requested
    if (options?.applyOrder || currentGroups.length === 0) {
      set({
        privateHand: cards,
        handGroups: cards.length > 0 ? [cards] : [],
        selectedCardIds: prunedSelectedCardIds,
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

    // Any remaining new cards added to last group or new group
    const unplaced = cards.filter((c) => !placedIds.has(c.id));
    if (unplaced.length > 0) {
      if (newGroups.length > 0) {
        newGroups[newGroups.length - 1].push(...unplaced);
      } else {
        newGroups.push(unplaced);
      }
    }

    set({
      privateHand: cards,
      handGroups: newGroups,
      selectedCardIds: prunedSelectedCardIds,
    });
  },

  setLobbyPlayers: (players) => set({ lobbyPlayers: players }),

  setError: (err) => set({ error: err }),

  setKickedMessage: (msg) => set({ kickedMessage: msg }),

  setPendingInvite: (invite) => set({ pendingInvite: invite }),

  clearPendingInvite: () => set({ pendingInvite: null }),

  toggleMuted: () => set((state) => ({ isMuted: !state.isMuted })),

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
      showDeclareModal: false,
      declareCardId: null,
    }),
}));
