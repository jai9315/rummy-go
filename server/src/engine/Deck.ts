import crypto from "crypto";
import { Card, Rank, Suit } from "./types";

const STANDARD_SUITS: Suit[] = ["HEARTS", "SPADES", "DIAMONDS", "CLUBS"];
const STANDARD_RANKS: Rank[] = [
  "A",
  "2" as Rank,
  "3" as Rank,
  "4" as Rank,
  "5" as Rank,
  "6" as Rank,
  "7" as Rank,
  "8" as Rank,
  "9" as Rank,
  "10" as Rank,
  "J",
  "Q",
  "K",
];

export class Deck {
  private cards: Card[] = [];

  constructor() {
    this.reset();
  }

  /**
   * Resets deck to standard Indian Rummy 2-deck configuration (108 cards):
   * 2 standard 52-card decks (104 cards) + 2 printed jokers per deck (4 jokers total)
   */
  public reset(): void {
    this.cards = [];
    let idCounter = 1;

    for (let deckIdx = 1; deckIdx <= 2; deckIdx++) {
      for (const suit of STANDARD_SUITS) {
        for (const rank of STANDARD_RANKS) {
          this.cards.push({
            id: `${suit[0]}_${rank}_d${deckIdx}_${idCounter++}`,
            suit,
            rank,
            isWildJoker: false,
            isPrintedJoker: false,
            deckIndex: deckIdx,
          });
        }
      }

      // 2 Printed jokers per deck
      for (let j = 1; j <= 2; j++) {
        this.cards.push({
          id: `PJ_d${deckIdx}_${j}_${idCounter++}`,
          suit: "JOKER",
          rank: "PRINTED_JOKER",
          isWildJoker: false,
          isPrintedJoker: true,
          deckIndex: deckIdx,
        });
      }
    }
  }

  /**
   * Cryptographically secure Fisher-Yates shuffle using crypto.randomInt
   */
  public shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      // crypto.randomInt(min, max) returns random integer where min <= n < max
      const j = crypto.randomInt(0, i + 1);
      const temp = this.cards[i];
      this.cards[i] = this.cards[j];
      this.cards[j] = temp;
    }
  }

  /**
   * Deals 13 cards to each player
   */
  public deal(playerCount: number, cardsPerPlayer: number = 13): { hands: Card[][]; remainingDeck: Card[] } {
    if (this.cards.length < playerCount * cardsPerPlayer + 2) {
      throw new Error("Not enough cards in deck to deal");
    }

    const hands: Card[][] = Array.from({ length: playerCount }, () => []);

    for (let round = 0; round < cardsPerPlayer; round++) {
      for (let p = 0; p < playerCount; p++) {
        const card = this.cards.pop();
        if (card) hands[p].push(card);
      }
    }

    return { hands, remainingDeck: [...this.cards] };
  }

  /**
   * Selects and configures the Wild Joker from the remaining deck.
   * If cut card is a printed joker, Ace of all suits becomes the wild joker.
   */
  public static markWildJokers(cutCard: Card, allCards: Card[]): { cutCard: Card; wildRank: Rank } {
    let wildRank: Rank = cutCard.rank;
    if (cutCard.isPrintedJoker) {
      // Tournament standard: if printed joker is cut, Ace is the wild joker
      wildRank = "A";
    }

    for (const card of allCards) {
      if (card.isPrintedJoker) {
        card.isWildJoker = false; // It is already a printed joker
      } else if (card.rank === wildRank) {
        card.isWildJoker = true;
      } else {
        card.isWildJoker = false;
      }
    }

    const markedCutCard: Card = {
      ...cutCard,
      isWildJoker: !cutCard.isPrintedJoker && cutCard.rank === wildRank,
    };

    return { cutCard: markedCutCard, wildRank };
  }

  public draw(): Card | undefined {
    return this.cards.pop();
  }

  public get count(): number {
    return this.cards.length;
  }
}
