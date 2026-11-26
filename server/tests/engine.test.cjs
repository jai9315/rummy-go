const assert = require("node:assert");
const test = require("node:test");
const { Deck } = require("../dist/engine/Deck");
const { Evaluator } = require("../dist/engine/Evaluator");
const { Game } = require("../dist/engine/Game");

test("Deck initialization & shuffle", () => {
  const deck = new Deck();
  assert.strictEqual(deck.count, 108, "Indian Rummy 2 decks should have 108 cards");

  const cardsBefore = [...deck["cards"]];
  deck.shuffle();
  const cardsAfter = [...deck["cards"]];

  assert.strictEqual(cardsAfter.length, 108);
  // Verify shuffle changed order
  const orderIdentical = cardsBefore.every((c, i) => c.id === cardsAfter[i].id);
  assert.strictEqual(orderIdentical, false, "Deck should be thoroughly shuffled");
});

test("Card Dealing & Wild Joker cut", () => {
  const deck = new Deck();
  deck.shuffle();

  const { hands, remainingDeck } = deck.deal(4, 13);
  assert.strictEqual(hands.length, 4);
  hands.forEach((hand, idx) => {
    assert.strictEqual(hand.length, 13, `Player ${idx} must receive exactly 13 cards`);
  });

  const cutCard = deck.draw();
  assert.ok(cutCard);

  const allHandCards = hands.flat();
  const { wildRank } = Deck.markWildJokers(cutCard, allHandCards);
  assert.ok(wildRank);

  // Verify all cards with matching rank in hands have isWildJoker = true
  allHandCards.forEach((card) => {
    if (!card.isPrintedJoker && card.rank === wildRank) {
      assert.strictEqual(card.isWildJoker, true, `Card of rank ${card.rank} should be marked wild joker`);
    }
  });
});

test("Pure Sequence validation", () => {
  // 4H, 5H, 6H -> Pure Sequence
  const pureHearts = [
    { id: "1", suit: "HEARTS", rank: "4", isWildJoker: false, isPrintedJoker: false },
    { id: "2", suit: "HEARTS", rank: "5", isWildJoker: false, isPrintedJoker: false },
    { id: "3", suit: "HEARTS", rank: "6", isWildJoker: false, isPrintedJoker: false },
  ];
  assert.strictEqual(Evaluator.isValidPureSequence(pureHearts), true);

  // Q-S, K-S, A-S -> Ace high pure sequence
  const aceHighSpades = [
    { id: "1", suit: "SPADES", rank: "Q", isWildJoker: false, isPrintedJoker: false },
    { id: "2", suit: "SPADES", rank: "K", isWildJoker: false, isPrintedJoker: false },
    { id: "3", suit: "SPADES", rank: "A", isWildJoker: false, isPrintedJoker: false },
  ];
  assert.strictEqual(Evaluator.isValidPureSequence(aceHighSpades), true);

  // A-D, 2-D, 3-D -> Ace low pure sequence
  const aceLowDiamonds = [
    { id: "1", suit: "DIAMONDS", rank: "A", isWildJoker: false, isPrintedJoker: false },
    { id: "2", suit: "DIAMONDS", rank: "2", isWildJoker: false, isPrintedJoker: false },
    { id: "3", suit: "DIAMONDS", rank: "3", isWildJoker: false, isPrintedJoker: false },
  ];
  assert.strictEqual(Evaluator.isValidPureSequence(aceLowDiamonds), true);

  // K-A-2 -> Wrap around sequence is INVALID in Indian Rummy
  const wrapAround = [
    { id: "1", suit: "CLUBS", rank: "K", isWildJoker: false, isPrintedJoker: false },
    { id: "2", suit: "CLUBS", rank: "A", isWildJoker: false, isPrintedJoker: false },
    { id: "3", suit: "CLUBS", rank: "2", isWildJoker: false, isPrintedJoker: false },
  ];
  assert.strictEqual(Evaluator.isValidPureSequence(wrapAround), false);

  // Sequence with printed joker is NOT pure
  const withPrintedJoker = [
    { id: "1", suit: "HEARTS", rank: "4", isWildJoker: false, isPrintedJoker: false },
    { id: "2", suit: "JOKER", rank: "PRINTED_JOKER", isWildJoker: false, isPrintedJoker: true },
    { id: "3", suit: "HEARTS", rank: "6", isWildJoker: false, isPrintedJoker: false },
  ];
  assert.strictEqual(Evaluator.isValidPureSequence(withPrintedJoker), false);
});

test("Impure Sequence validation", () => {
  // 7C, 8C, PrintedJoker, 10C -> Valid Impure Sequence
  const impureClubs = [
    { id: "1", suit: "CLUBS", rank: "7", isWildJoker: false, isPrintedJoker: false },
    { id: "2", suit: "CLUBS", rank: "8", isWildJoker: false, isPrintedJoker: false },
    { id: "3", suit: "JOKER", rank: "PRINTED_JOKER", isWildJoker: false, isPrintedJoker: true },
    { id: "4", suit: "CLUBS", rank: "10", isWildJoker: false, isPrintedJoker: false },
  ];
  assert.strictEqual(Evaluator.isValidImpureSequence(impureClubs), true);

  // 9D, WildJoker, JD -> Valid Impure Sequence
  const impureWithWild = [
    { id: "1", suit: "DIAMONDS", rank: "9", isWildJoker: false, isPrintedJoker: false },
    { id: "2", suit: "SPADES", rank: "3", isWildJoker: true, isPrintedJoker: false },
    { id: "3", suit: "DIAMONDS", rank: "J", isWildJoker: false, isPrintedJoker: false },
  ];
  assert.strictEqual(Evaluator.isValidImpureSequence(impureWithWild), true);
});

test("Set validation", () => {
  // 8H, 8S, 8C -> Valid Set
  const validSet = [
    { id: "1", suit: "HEARTS", rank: "8", isWildJoker: false, isPrintedJoker: false },
    { id: "2", suit: "SPADES", rank: "8", isWildJoker: false, isPrintedJoker: false },
    { id: "3", suit: "CLUBS", rank: "8", isWildJoker: false, isPrintedJoker: false },
  ];
  assert.strictEqual(Evaluator.isValidSet(validSet), true);

  // 8H, 8H, 8S -> INVALID Set (duplicate suit)
  const duplicateSuit = [
    { id: "1", suit: "HEARTS", rank: "8", isWildJoker: false, isPrintedJoker: false },
    { id: "2", suit: "HEARTS", rank: "8", isWildJoker: false, isPrintedJoker: false },
    { id: "3", suit: "SPADES", rank: "8", isWildJoker: false, isPrintedJoker: false },
  ];
  assert.strictEqual(Evaluator.isValidSet(duplicateSuit), false, "Duplicate suit must be rejected in set");

  // 9H, 9D, WildJoker -> Valid Set with Joker
  const setWithJoker = [
    { id: "1", suit: "HEARTS", rank: "9", isWildJoker: false, isPrintedJoker: false },
    { id: "2", suit: "DIAMONDS", rank: "9", isWildJoker: false, isPrintedJoker: false },
    { id: "3", suit: "SPADES", rank: "2", isWildJoker: true, isPrintedJoker: false },
  ];
  assert.strictEqual(Evaluator.isValidSet(setWithJoker), true);
});

test("Winning Declaration validation", () => {
  const pureSeq = [
    { id: "1", suit: "HEARTS", rank: "4", isWildJoker: false, isPrintedJoker: false },
    { id: "2", suit: "HEARTS", rank: "5", isWildJoker: false, isPrintedJoker: false },
    { id: "3", suit: "HEARTS", rank: "6", isWildJoker: false, isPrintedJoker: false },
  ];

  const impureSeq = [
    { id: "4", suit: "SPADES", rank: "8", isWildJoker: false, isPrintedJoker: false },
    { id: "5", suit: "JOKER", rank: "PRINTED_JOKER", isWildJoker: false, isPrintedJoker: true },
    { id: "6", suit: "SPADES", rank: "10", isWildJoker: false, isPrintedJoker: false },
    { id: "7", suit: "SPADES", rank: "J", isWildJoker: false, isPrintedJoker: false },
  ];

  const set1 = [
    { id: "8", suit: "DIAMONDS", rank: "K", isWildJoker: false, isPrintedJoker: false },
    { id: "9", suit: "CLUBS", rank: "K", isWildJoker: false, isPrintedJoker: false },
    { id: "10", suit: "SPADES", rank: "K", isWildJoker: false, isPrintedJoker: false },
  ];

  const set2 = [
    { id: "11", suit: "HEARTS", rank: "3", isWildJoker: false, isPrintedJoker: false },
    { id: "12", suit: "DIAMONDS", rank: "3", isWildJoker: false, isPrintedJoker: false },
    { id: "13", suit: "CLUBS", rank: "3", isWildJoker: false, isPrintedJoker: false },
  ];

  // 3 + 4 + 3 + 3 = 13 cards (1 pure, 1 impure, 2 sets) -> VALID!
  const validDecl = Evaluator.validateDeclaration([pureSeq, impureSeq, set1, set2]);
  assert.strictEqual(validDecl.isValid, true, "Declaration with 1 pure + 1 impure + 2 sets should be valid");

  // Declaration without pure sequence (2 impure sequences + 2 sets = 13 cards) -> INVALID
  const impureSeq3Card = [
    { id: "14", suit: "HEARTS", rank: "4", isWildJoker: false, isPrintedJoker: false },
    { id: "15", suit: "JOKER", rank: "PRINTED_JOKER", isWildJoker: false, isPrintedJoker: true },
    { id: "16", suit: "HEARTS", rank: "6", isWildJoker: false, isPrintedJoker: false },
  ];
  const invalidNoPure = Evaluator.validateDeclaration([impureSeq3Card, impureSeq, set1, set2]);
  assert.strictEqual(invalidNoPure.isValid, false);
  assert.match(invalidNoPure.reason, /Pure Sequence is mandatory/);

  // Declaration with 4 sets and 0 sequences (4 + 3 + 3 + 3 = 13 cards) -> INVALID
  const set4Card = [
    { id: "17", suit: "HEARTS", rank: "K", isWildJoker: false, isPrintedJoker: false },
    { id: "18", suit: "DIAMONDS", rank: "K", isWildJoker: false, isPrintedJoker: false },
    { id: "19", suit: "CLUBS", rank: "K", isWildJoker: false, isPrintedJoker: false },
    { id: "20", suit: "SPADES", rank: "K", isWildJoker: false, isPrintedJoker: false },
  ];
  const set3 = [
    { id: "21", suit: "HEARTS", rank: "7", isWildJoker: false, isPrintedJoker: false },
    { id: "22", suit: "DIAMONDS", rank: "7", isWildJoker: false, isPrintedJoker: false },
    { id: "23", suit: "CLUBS", rank: "7", isWildJoker: false, isPrintedJoker: false },
  ];
  const onlySets = Evaluator.validateDeclaration([set4Card, set1, set2, set3]);
  assert.strictEqual(onlySets.isValid, false);
});

test("Card Privacy Security: Public state contains ZERO other player card details", () => {
  const game = new Game("game-1", "room-1", "ABC123");
  game.addPlayer("player-1", "Alice", "", 1);
  game.addPlayer("player-2", "Bob", "", 2);
  game.setPlayerReady("player-1", true);
  game.setPlayerReady("player-2", true);

  game.startRound();

  const publicState = game.getPublicState();

  // 1. Check public players
  assert.strictEqual(publicState.players.length, 2);
  for (const player of publicState.players) {
    // Check that player object in public state has ONLY cardCount and NO hand or card array
    assert.strictEqual(player.hand, undefined, "Public player must never expose hand array");
    assert.strictEqual(player.cards, undefined, "Public player must never expose cards array");
    assert.strictEqual(player.cardCount, 13, "Public player only reveals card count");
  }

  // 2. Check secret hands on server
  const aliceCards = game.getPlayerCards("player-1");
  const bobCards = game.getPlayerCards("player-2");
  assert.strictEqual(aliceCards.length, 13);
  assert.strictEqual(bobCards.length, 13);

  // Verify Alice and Bob have different hands
  const aliceCardIds = aliceCards.map((c) => c.id);
  const bobCardIds = bobCards.map((c) => c.id);
  const overlap = aliceCardIds.filter((id) => bobCardIds.includes(id));
  assert.strictEqual(overlap.length, 0, "No cards should overlap between players");
});
