import { create } from "zustand";
import { Card, LobbyPlayer, PublicGameState } from "../types";

interface GameStoreState {
  gameState: PublicGameState | null;
  privateHand: Card[];
  selectedCardIds: string[];
  handGroups: Card[][];
  lobbyPlayers: LobbyPlayer[];
  error: string | null;
  showDeclareModal: boolean;
  declareCardId: string | null;

  setGameState: (state: PublicGameState) => void;
  setPrivateHand: (cards: Card[]) => void;
  setLobbyPlayers: (players: LobbyPlayer[]) => void;
  setError: (err: string | null) => void;
  toggleCardSelection: (cardId: string) => void;
  clearSelection: () => void;
  groupSelectedCards: () => void;
  setHandGroups: (groups: Card[][]) => void;
  setShowDeclareModal: (show: boolean, declareCardId?: string | null) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  gameState: null,
  privateHand: [],
  selectedCardIds: [],
  handGroups: [],
  lobbyPlayers: [],
  error: null,
  showDeclareModal: false,
  declareCardId: null,

  setGameState: (state) => set({ gameState: state }),

  setPrivateHand: (cards) => {
    const currentGroups = get().handGroups;
    // If groups are empty or card count changed, initialize one default group or preserve existing groups
    if (currentGroups.length === 0) {
      set({ privateHand: cards, handGroups: [cards] });
    } else {
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

      set({ privateHand: cards, handGroups: newGroups });
    }
  },

  setLobbyPlayers: (players) => set({ lobbyPlayers: players }),

  setError: (err) => set({ error: err }),

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

  setHandGroups: (groups) => set({ handGroups: groups }),

  setShowDeclareModal: (show, declareCardId = null) =>
    set({ showDeclareModal: show, declareCardId }),

  resetGame: () =>
    set({
      gameState: null,
      privateHand: [],
      selectedCardIds: [],
      handGroups: [],
      error: null,
      showDeclareModal: false,
      declareCardId: null,
    }),
}));
