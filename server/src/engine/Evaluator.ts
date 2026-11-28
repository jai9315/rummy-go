import { Card, MeldGroup, Rank, Suit } from "./types";

const RANK_ORDER: Record<Rank, number> = {
  A: 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  PRINTED_JOKER: 0,
};

export class Evaluator {
  public static isJoker(card: Card): boolean {
    return card.isPrintedJoker || card.rank === "PRINTED_JOKER" || card.isWildJoker;
  }

  public static getCardPoints(card: Card): number {
    if (this.isJoker(card)) return 0;
    if (["A", "K", "Q", "J"].includes(card.rank)) return 10;
    const num = parseInt(card.rank, 10);
    return isNaN(num) ? 10 : num;
  }

  /**
   * Evaluates a single meld (group of cards)
   */
  public static evaluateMeld(cards: Card[]): MeldGroup {
    if (!cards || cards.length < 3) {
      return {
        type: "INVALID",
        cards,
        isValid: false,
        reason: "Groups must have at least 3 cards",
      };
    }

    // 1. Check for Pure Sequence
    if (this.isValidPureSequence(cards)) {
      return {
        type: "PURE_SEQUENCE",
        cards,
        isValid: true,
      };
    }

    // 2. Check for Impure Sequence
    if (this.isValidImpureSequence(cards)) {
      return {
        type: "IMPURE_SEQUENCE",
        cards,
        isValid: true,
      };
    }

    // 3. Check for Set
    if (this.isValidSet(cards)) {
      return {
        type: "SET",
        cards,
        isValid: true,
      };
    }

    return {
      type: "INVALID",
      cards,
      isValid: false,
      reason: "Not a valid sequence or set",
    };
  }

  /**
   * Pure Sequence: 3+ consecutive cards of the same suit.
   * Printed Jokers are strictly forbidden. A Wild Joker card may be used in a
   * pure sequence ONLY in its natural suit and natural rank (not as a substitute).
   */
  public static isValidPureSequence(cards: Card[]): boolean {
    if (cards.length < 3) return false;

    // Printed Jokers can never appear in a pure sequence.
    // Wild Jokers are permitted only when used in their natural suit & rank.
    if (cards.some((c) => c.isPrintedJoker || c.rank === "PRINTED_JOKER" || c.suit === "JOKER")) {
      return false;
    }

    // All cards must have identical suit
    const suit = cards[0].suit;
    if (cards.some((c) => c.suit !== suit)) return false;

    // Check consecutive ranks with Ace low (1) or Ace high (14)
    return this.checkConsecutive(cards, false) || this.checkConsecutive(cards, true);
  }

  private static checkConsecutive(cards: Card[], aceHigh: boolean): boolean {
    const values = cards
      .map((c) => {
        if (c.rank === "A" && aceHigh) return 14;
        return RANK_ORDER[c.rank];
      })
      .sort((a, b) => a - b);

    // Duplicate values cannot be in a sequence
    for (let i = 0; i < values.length - 1; i++) {
      if (values[i + 1] - values[i] !== 1) {
        return false;
      }
    }
    return true;
  }

  /**
   * Impure Sequence: 3+ consecutive cards of the same suit,
   * with 1+ jokers substituting for missing cards.
   */
  public static isValidImpureSequence(cards: Card[]): boolean {
    if (cards.length < 3) return false;

    const naturalCards: Card[] = [];
    let jokerCount = 0;

    for (const card of cards) {
      if (this.isJoker(card)) {
        jokerCount++;
      } else {
        naturalCards.push(card);
      }
    }

    if (jokerCount === 0) {
      return this.isValidPureSequence(cards);
    }

    // If all cards are jokers, in Indian Rummy that's not a pure sequence, but can form impure if at least 1 natural card exists
    if (naturalCards.length === 0) {
      return false;
    }

    // All natural cards must share the same suit
    const suit = naturalCards[0].suit;
    if (naturalCards.some((c) => c.suit !== suit)) {
      return false;
    }

    return (
      this.canFormSequenceWithJokers(naturalCards, jokerCount, false) ||
      this.canFormSequenceWithJokers(naturalCards, jokerCount, true)
    );
  }

  private static canFormSequenceWithJokers(
    naturalCards: Card[],
    jokerCount: number,
    aceHigh: boolean
  ): boolean {
    const values = naturalCards
      .map((c) => {
        if (c.rank === "A" && aceHigh) return 14;
        return RANK_ORDER[c.rank];
      })
      .sort((a, b) => a - b);

    // Duplicate natural ranks in sequence is invalid
    for (let i = 0; i < values.length - 1; i++) {
      if (values[i] === values[i + 1]) return false;
    }

    // Count gaps between consecutive natural cards
    let neededJokers = 0;
    for (let i = 0; i < values.length - 1; i++) {
      const gap = values[i + 1] - values[i] - 1;
      if (gap < 0) return false;
      neededJokers += gap;
    }

    // Total length check: natural cards + jokers
    const span = values[values.length - 1] - values[0] + 1;
    const totalCards = naturalCards.length + jokerCount;

    // Sequence length cannot exceed available cards
    if (span > totalCards) return false;

    // We need at least neededJokers to bridge gaps; excess jokers can be placed at either end
    // Provided the overall span does not exceed ranks (1 to 13, or 2 to 14)
    if (jokerCount < neededJokers) return false;

    // Check if the sequence with excess jokers can fit within boundaries (1..14)
    const minPossible = aceHigh ? 2 : 1;
    const maxPossible = aceHigh ? 14 : 13;
    const excessJokers = jokerCount - neededJokers;
    const currentSpan = span;
    const finalSpan = currentSpan + excessJokers;

    return finalSpan <= maxPossible - minPossible + 1;
  }

  /**
   * Set: 3 or 4 cards of the same rank with DIFFERENT suits.
   * Can use jokers.
   * Cannot contain two natural cards of the same suit.
   */
  public static isValidSet(cards: Card[]): boolean {
    if (cards.length < 3 || cards.length > 4) return false;

    const naturalCards: Card[] = [];
    let jokerCount = 0;

    for (const card of cards) {
      if (this.isJoker(card)) {
        jokerCount++;
      } else {
        naturalCards.push(card);
      }
    }

    // Must have at least 1 natural card or all jokers
    if (naturalCards.length === 0) {
      // 3 or 4 jokers can count as a valid set in standard Indian Rummy rules
      return true;
    }

    const rank = naturalCards[0].rank;
    // All natural cards must have the same rank
    if (naturalCards.some((c) => c.rank !== rank)) return false;

    // All natural cards must have DIFFERENT suits
    const suitsSeen = new Set<Suit>();
    for (const card of naturalCards) {
      if (suitsSeen.has(card.suit)) {
        return false; // Duplicate suit in a set is INVALID
      }
      suitsSeen.add(card.suit);
    }

    return true;
  }

  /**
   * Validates a complete declaration of 13 cards divided into melds.
   * Winning requirement:
   * 1. Total cards must be 13.
   * 2. At least two sequences required.
   * 3. At least one sequence must be a PURE sequence.
   * 4. All melds must be valid (pure sequence, impure sequence, or set).
   */
  public static validateDeclaration(melds: Card[][]): {
    isValid: boolean;
    reason?: string;
    evaluatedMelds: MeldGroup[];
  } {
    const totalCards = melds.reduce((sum, m) => sum + m.length, 0);
    if (totalCards !== 13) {
      return {
        isValid: false,
        reason: `A valid declaration must have exactly 13 cards, found ${totalCards}`,
        evaluatedMelds: melds.map((m) => this.evaluateMeld(m)),
      };
    }

    const evaluatedMelds = melds.map((m) => this.evaluateMeld(m));

    // Check if every meld is individually valid
    const invalidMeld = evaluatedMelds.find((m) => !m.isValid);
    if (invalidMeld) {
      return {
        isValid: false,
        reason: invalidMeld.reason || "One or more card groups are invalid",
        evaluatedMelds,
      };
    }

    const pureCount = evaluatedMelds.filter((m) => m.type === "PURE_SEQUENCE").length;
    const impureCount = evaluatedMelds.filter((m) => m.type === "IMPURE_SEQUENCE").length;
    const totalSequences = pureCount + impureCount;

    if (pureCount < 1) {
      return {
        isValid: false,
        reason: "At least one Pure Sequence is mandatory to declare",
        evaluatedMelds,
      };
    }

    if (totalSequences < 2) {
      return {
        isValid: false,
        reason: "At least two sequences are mandatory to declare",
        evaluatedMelds,
      };
    }

    return {
      isValid: true,
      evaluatedMelds,
    };
  }

  /**
   * Calculates penalty score for a losing player.
   * - If player has NO pure sequence: all non-joker cards count as deadwood (max 80).
   * - If player has 1 pure sequence: that pure sequence is free (0 pts). Unmatched cards & sets/impure count unless they also have a second sequence.
   * - If player has at least 1 pure sequence AND at least 1 second sequence: all valid sequences and valid sets are free (0 pts), only invalid/unmelded cards count.
   * - Total points capped at 80.
   */
  public static calculatePlayerScore(melds: Card[][]): { points: number; evaluatedMelds: MeldGroup[] } {
    const evaluatedMelds = melds.map((m) => this.evaluateMeld(m));
    const pureCount = evaluatedMelds.filter((m) => m.type === "PURE_SEQUENCE").length;
    const impureCount = evaluatedMelds.filter((m) => m.type === "IMPURE_SEQUENCE").length;
    const totalSequences = pureCount + impureCount;

    let points = 0;

    if (pureCount === 0) {
      // No pure sequence: EVERY card is deadwood
      for (const meld of evaluatedMelds) {
        for (const card of meld.cards) {
          points += this.getCardPoints(card);
        }
      }
    } else if (totalSequences < 2) {
      // 1 pure sequence, but no second sequence:
      // The first pure sequence is free (0 pts), all other cards (even valid sets/impure sequences) count
      let firstPureConsumed = false;
      for (const meld of evaluatedMelds) {
        if (!firstPureConsumed && meld.type === "PURE_SEQUENCE") {
          firstPureConsumed = true;
          continue; // 0 points
        }
        for (const card of meld.cards) {
          points += this.getCardPoints(card);
        }
      }
    } else {
      // Has at least 1 pure sequence AND at least 1 second sequence:
      // All valid melds are 0 points. Only invalid melds count!
      for (const meld of evaluatedMelds) {
        if (!meld.isValid) {
          for (const card of meld.cards) {
            points += this.getCardPoints(card);
          }
        }
      }
    }

    return {
      points: Math.min(80, points),
      evaluatedMelds,
    };
  }

  /**
   * Auto-sorts a player's hand by suit and rank for convenience
   */
  public static sortHand(cards: Card[], by: "SUIT" | "RANK" = "SUIT"): Card[] {
    const suitOrder: Record<Suit, number> = {
      SPADES: 1,
      HEARTS: 2,
      CLUBS: 3,
      DIAMONDS: 4,
      JOKER: 5,
    };

    return [...cards].sort((a, b) => {
      if (a.isPrintedJoker && !b.isPrintedJoker) return 1;
      if (!a.isPrintedJoker && b.isPrintedJoker) return -1;

      if (by === "SUIT") {
        if (a.suit !== b.suit) {
          return (suitOrder[a.suit] || 0) - (suitOrder[b.suit] || 0);
        }
        return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
      } else {
        if (RANK_ORDER[a.rank] !== RANK_ORDER[b.rank]) {
          return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
        }
        return (suitOrder[a.suit] || 0) - (suitOrder[b.suit] || 0);
      }
    });
  }
}
