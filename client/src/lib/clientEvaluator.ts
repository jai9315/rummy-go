import { Card, MeldGroup, Rank, Suit } from "../types";

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

export class ClientEvaluator {
  public static isJoker(card: Card): boolean {
    return card.isPrintedJoker || card.rank === "PRINTED_JOKER" || card.isWildJoker;
  }

  public static getCardPoints(card: Card): number {
    if (this.isJoker(card)) return 0;
    if (["A", "K", "Q", "J"].includes(card.rank)) return 10;
    const num = parseInt(card.rank, 10);
    return isNaN(num) ? 10 : num;
  }

  public static calculatePlayerScore(melds: Card[][]): {
    points: number;
    evaluatedMelds: MeldGroup[];
  } {
    const evaluatedMelds = melds.map((m) => this.evaluateMeld(m));
    const pureCount = evaluatedMelds.filter((m) => m.type === "PURE_SEQUENCE").length;
    const impureCount = evaluatedMelds.filter((m) => m.type === "IMPURE_SEQUENCE").length;
    const totalSequences = pureCount + impureCount;

    let points = 0;

    if (pureCount === 0) {
      for (const meld of evaluatedMelds) {
        for (const card of meld.cards) {
          points += this.getCardPoints(card);
        }
      }
    } else if (totalSequences < 2) {
      let firstPureConsumed = false;
      for (const meld of evaluatedMelds) {
        if (!firstPureConsumed && meld.type === "PURE_SEQUENCE") {
          firstPureConsumed = true;
          continue;
        }
        for (const card of meld.cards) {
          points += this.getCardPoints(card);
        }
      }
    } else {
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

  public static evaluateMeld(cards: Card[]): MeldGroup {
    if (!cards || cards.length < 3) {
      return {
        type: "INVALID",
        cards,
        isValid: false,
        reason: "Need 3+ cards",
      };
    }

    if (this.isValidPureSequence(cards)) {
      return { type: "PURE_SEQUENCE", cards, isValid: true };
    }

    if (this.isValidImpureSequence(cards)) {
      return { type: "IMPURE_SEQUENCE", cards, isValid: true };
    }

    if (this.isValidSet(cards)) {
      return { type: "SET", cards, isValid: true };
    }

    return { type: "INVALID", cards, isValid: false, reason: "Invalid group" };
  }

  public static isValidPureSequence(cards: Card[]): boolean {
    if (cards.length < 3) return false;
    if (cards.some((c) => c.isPrintedJoker || c.rank === "PRINTED_JOKER" || c.suit === "JOKER")) {
      return false;
    }

    const suit = cards[0].suit;
    if (cards.some((c) => c.suit !== suit)) return false;

    return this.checkConsecutive(cards, false) || this.checkConsecutive(cards, true);
  }

  private static checkConsecutive(cards: Card[], aceHigh: boolean): boolean {
    const values = cards
      .map((c) => {
        if (c.rank === "A" && aceHigh) return 14;
        return RANK_ORDER[c.rank];
      })
      .sort((a, b) => a - b);

    for (let i = 0; i < values.length - 1; i++) {
      if (values[i + 1] - values[i] !== 1) return false;
    }
    return true;
  }

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

    if (jokerCount === 0) return this.isValidPureSequence(cards);
    if (naturalCards.length === 0) return false;

    const suit = naturalCards[0].suit;
    if (naturalCards.some((c) => c.suit !== suit)) return false;

    return (
      this.canFormSequence(naturalCards, jokerCount, false) ||
      this.canFormSequence(naturalCards, jokerCount, true)
    );
  }

  private static canFormSequence(naturalCards: Card[], jokerCount: number, aceHigh: boolean): boolean {
    const values = naturalCards
      .map((c) => (c.rank === "A" && aceHigh ? 14 : RANK_ORDER[c.rank]))
      .sort((a, b) => a - b);

    for (let i = 0; i < values.length - 1; i++) {
      if (values[i] === values[i + 1]) return false;
    }

    let neededJokers = 0;
    for (let i = 0; i < values.length - 1; i++) {
      const gap = values[i + 1] - values[i] - 1;
      if (gap < 0) return false;
      neededJokers += gap;
    }

    const span = values[values.length - 1] - values[0] + 1;
    const totalCards = naturalCards.length + jokerCount;

    // Sequence length cannot exceed available cards
    if (span > totalCards) return false;

    // We need at least neededJokers to bridge gaps; excess jokers can be placed at either end
    if (jokerCount < neededJokers) return false;

    // Check if the sequence with excess jokers can fit within 13-rank suit boundaries (1..13 or 2..14)
    const minPossible = aceHigh ? 2 : 1;
    const maxPossible = aceHigh ? 14 : 13;
    const excessJokers = jokerCount - neededJokers;
    const finalSpan = span + excessJokers;

    return finalSpan <= maxPossible - minPossible + 1;
  }

  public static isValidSet(cards: Card[]): boolean {
    if (cards.length < 3 || cards.length > 4) return false;

    const naturalCards: Card[] = [];

    for (const card of cards) {
      if (!this.isJoker(card)) {
        naturalCards.push(card);
      }
    }

    if (naturalCards.length === 0) return true;

    const rank = naturalCards[0].rank;
    if (naturalCards.some((c) => c.rank !== rank)) return false;

    const suitsSeen = new Set<Suit>();
    for (const card of naturalCards) {
      if (suitsSeen.has(card.suit)) return false;
      suitsSeen.add(card.suit);
    }

    return true;
  }

  /**
   * Validates a complete declaration of 13 cards divided into melds.
   * Mirrors server Evaluator.validateDeclaration() verbatim:
   * 1. Total cards must be 13.
   * 2. All melds must be individually valid (pure sequence, impure sequence, or set).
   * 3. At least one PURE sequence is mandatory.
   * 4. At least two total sequences are mandatory.
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
}
