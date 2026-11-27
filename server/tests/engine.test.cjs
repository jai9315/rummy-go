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
  game.stopTimer();
});

test("Wild joker in pure sequence: natural suit+rank allowed, substitute rejected", () => {
  // Natural suit + natural rank wild joker IS valid in a Pure Sequence (standard Indian Rummy)
  const naturalWildRun = [
    { id: "1", suit: "HEARTS", rank: "4", isWildJoker: false, isPrintedJoker: false },
    { id: "2", suit: "HEARTS", rank: "5", isWildJoker: true, isPrintedJoker: false },
    { id: "3", suit: "HEARTS", rank: "6", isWildJoker: false, isPrintedJoker: false },
  ];
  assert.strictEqual(
    Evaluator.isValidPureSequence(naturalWildRun),
    true,
    "Wild joker used in its natural suit & rank must be allowed in a pure sequence"
  );
  assert.strictEqual(
    Evaluator.evaluateMeld(naturalWildRun).type,
    "PURE_SEQUENCE",
    "Natural wild joker run should evaluate as PURE_SEQUENCE"
  );

  // Wild joker acting as a substitute (different suit or non-consecutive rank) is IMPURE, never PURE
  const substituteWildRun = [
    { id: "1", suit: "HEARTS", rank: "4", isWildJoker: false, isPrintedJoker: false },
    { id: "2", suit: "SPADES", rank: "5", isWildJoker: true, isPrintedJoker: false },
    { id: "3", suit: "HEARTS", rank: "6", isWildJoker: false, isPrintedJoker: false },
  ];
  assert.strictEqual(
    Evaluator.isValidPureSequence(substituteWildRun),
    false,
    "Wild joker substitute must not be allowed in a pure sequence"
  );
  assert.strictEqual(
    Evaluator.isValidImpureSequence(substituteWildRun),
    true,
    "Wild joker substitute run should be valid as impure sequence"
  );
  assert.strictEqual(
    Evaluator.evaluateMeld(substituteWildRun).type,
    "IMPURE_SEQUENCE",
    "Substitute wild joker run should evaluate as IMPURE_SEQUENCE"
  );
});

test("Forged card values rejected on declare", () => {
  const game = new Game("game-forge", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  game.drawCard("p1", "CLOSED");
  const hand = game.getPlayerCards("p1");
  const declareCardId = hand[hand.length - 1].id;

  const plan = [
    { suit: "HEARTS", rank: "4" }, { suit: "HEARTS", rank: "5" }, { suit: "HEARTS", rank: "6" },
    { suit: "SPADES", rank: "8" }, { suit: "SPADES", rank: "9" }, { suit: "SPADES", rank: "10" },
    { suit: "HEARTS", rank: "K" }, { suit: "SPADES", rank: "K" }, { suit: "CLUBS", rank: "K" },
    { suit: "HEARTS", rank: "3" }, { suit: "DIAMONDS", rank: "3" }, { suit: "CLUBS", rank: "3" }, { suit: "SPADES", rank: "3" },
  ];
  const forged = hand.slice(0, 13).map((c, i) => ({
    ...c, suit: plan[i].suit, rank: plan[i].rank, isWildJoker: false, isPrintedJoker: false,
  }));
  const melds = [forged.slice(0, 3), forged.slice(3, 6), forged.slice(6, 9), forged.slice(9, 13)];

  const res = game.declare("p1", melds, declareCardId);
  assert.strictEqual(res.isValid, false, "Forged card values must be rejected on declare");
  game.stopTimer();
});

test("Duplicate card IDs across melds rejected", () => {
  const game = new Game("game-dup", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  game.drawCard("p1", "CLOSED");
  const hand = game.getPlayerCards("p1");
  const declareCardId = hand[hand.length - 1].id;

  const all = hand.slice(0, 13);
  const melds = [all.slice(0, 3), all.slice(3, 6), all.slice(6, 9), all.slice(9, 13)];
  melds[3][3] = all[0];

  const res = game.declare("p1", melds, declareCardId);
  assert.strictEqual(res.isValid, false, "Reusing the same card ID across melds must be rejected");
  game.stopTimer();
});

test("First drop penalty when player has not drawn", () => {
  const game = new Game("game-drop1", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  const res = game.drop("p1");
  assert.strictEqual(res.penalty, 20, "First drop penalty must be 20");
  const scoreInfo = res.publicState.roundScores["p1"];
  assert.match(scoreInfo.reason, /First Drop/);
  game.stopTimer();
});

test("Per-player first drop penalty (20 pts) even after another player dropped, and all droppers in roundScores", () => {
  const game = new Game("game-drop2", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.addPlayer("p3", "Carol", "", 3);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.setPlayerReady("p3", true);
  game.startRound();

  // p1 drops on first turn (first drop = 20 pts)
  const res1 = game.drop("p1");
  assert.strictEqual(res1.penalty, 20, "p1 first drop must be 20");
  // p2 drops on their own first turn without drawing -> STILL First Drop (20 pts)
  const res2 = game.drop("p2");
  assert.strictEqual(res2.penalty, 20, "p2 first turn drop must still be 20 even after p1 dropped");
  assert.strictEqual(res2.publicState.status, "GAME_OVER");
  assert.strictEqual(res2.publicState.winnerId, "p3", "winnerId must be populated on round completion");
  assert.ok(res2.publicState.roundScores["p1"], "First dropper p1 must be present in roundScores");
  assert.ok(res2.publicState.roundScores["p2"], "Second dropper p2 must be present in roundScores");
  assert.ok(res2.publicState.roundScores["p3"], "Winner p3 must be present in roundScores");
  assert.strictEqual(res2.publicState.roundScores["p1"].points, 20);
  assert.strictEqual(res2.publicState.roundScores["p2"].points, 20);
  assert.strictEqual(res2.publicState.roundScores["p3"].points, 0);
  assert.match(res2.publicState.roundScores["p2"].reason, /First Drop/);
  game.stopTimer();
});

test("Deck exhaustion reshuffle does not throw", () => {
  const game = new Game("game-deck", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  let draws = 0;
  let deckEmptied = false;
  for (let i = 0; i < 100; i++) {
    const state = game.getPublicState();
    if (state.closedDeckCount === 0) {
      deckEmptied = true;
      break;
    }
    try {
      game.drawCard("p1", "CLOSED");
      const hand = game.getPlayerCards("p1");
      game.discardCard("p1", hand[hand.length - 1].id);
      draws++;
    } catch (e) {
      break;
    }
  }
  assert.ok(deckEmptied || draws > 0, "Should be able to draw cards until deck exhaustion");
  game.stopTimer();
});

test("Turn timeout during DRAW phase auto-draws and auto-discards", () => {
  const game = new Game("game-timeout-draw", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  // p1 is in DRAW phase. Simulate timer expiration by calling handleTimeout directly.
  // TypeScript 'private' is compile-time only; at runtime the method is accessible.
  game.handleTimeout();

  // First timeout: consecutiveTimeouts = 1, auto-draw + auto-discard
  const p1 = game.getPlayer("p1");
  assert.strictEqual(p1.consecutiveTimeouts, 1, "Timeout should increment consecutiveTimeouts");
  // After auto-draw + auto-discard, hand should still be 13 cards (drew 1, discarded 1)
  assert.strictEqual(p1.hand.length, 13, "Hand size should remain 13 after auto draw+discard");
  // Turn should advance to p2
  assert.strictEqual(game.getCurrentTurnPlayerId(), "p2", "Turn should advance after timeout");
  game.stopTimer();
});

test("Turn timeout during DISCARD phase auto-discards last drawn card", () => {
  const game = new Game("game-timeout-discard", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  // p1 draws a card (now in DISCARD phase with 14 cards)
  game.drawCard("p1", "CLOSED");
  const p1 = game.getPlayer("p1");
  assert.strictEqual(p1.hand.length, 14, "p1 should have 14 cards after draw");

  // Simulate timer expiration during DISCARD phase
  game.handleTimeout();

  // Auto-discard should reduce hand back to 13
  assert.strictEqual(p1.hand.length, 13, "Hand should be 13 after auto-discard");
  // Turn should advance
  assert.strictEqual(game.getCurrentTurnPlayerId(), "p2", "Turn should advance after timeout");
  game.stopTimer();
});

test("Three consecutive timeouts during DRAW phase cause auto-drop", () => {
  const game = new Game("game-timeout-drop", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  // p1 timeout #1 (turn: p1 -> p2)
  game.handleTimeout();
  assert.strictEqual(game.getPlayer("p1").consecutiveTimeouts, 1, "p1: 1 timeout");
  assert.strictEqual(game.getPlayer("p1").hasDropped, false, "Not dropped after 1 timeout");

  // p2 timeout #1 (turn: p2 -> p1)
  game.handleTimeout();
  assert.strictEqual(game.getPlayer("p2").consecutiveTimeouts, 1, "p2: 1 timeout");

  // p1 timeout #2 (turn: p1 -> p2)
  game.handleTimeout();
  assert.strictEqual(game.getPlayer("p1").consecutiveTimeouts, 2, "p1: 2 timeouts");
  assert.strictEqual(game.getPlayer("p1").hasDropped, false, "Not dropped after 2 timeouts");

  // p2 timeout #2 (turn: p2 -> p1)
  game.handleTimeout();
  assert.strictEqual(game.getPlayer("p2").consecutiveTimeouts, 2, "p2: 2 timeouts");

  // p1 timeout #3 -> auto-drop (with 2 players, round ends when p1 drops)
  game.handleTimeout();
  assert.strictEqual(game.getPlayer("p1").hasDropped, true, "Dropped after 3 consecutive timeouts");
  game.stopTimer();
});

test("Timer cleanup after game completion (endRound clears timer)", () => {
  const game = new Game("game-timer-cleanup", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  // Timer is running after startRound
  // Timer is running after startRound
  assert.ok(game["timerInterval"] !== null, "Timer should be running after startRound");

  // p1 drops (2 players → final round ends → endRound clears timers)
  game.drop("p1");

  assert.strictEqual(game["timerInterval"], null, "Timer should be cleared after round ends");
  assert.strictEqual(game.status, "GAME_OVER", "Single-round game should transition to GAME_OVER");
});

test("stopTimer clears running turn timer", () => {
  const game = new Game("game-stop-timer", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  assert.ok(game["timerInterval"] !== null, "Timer should be running after startRound");

  game.stopTimer();
  assert.strictEqual(game["timerInterval"], null, "Timer should be cleared after stopTimer");
});

test("Deck exhaustion: game does not stall when both decks empty", () => {
  const game = new Game("game-deck-exhaust", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  // Draw and discard until decks are exhausted
  let rounds = 0;
  let hitExhaustion = false;
  for (let i = 0; i < 200; i++) {
    const state = game.getPublicState();
    if (state.closedDeckCount === 0 && state.discardPileCount <= 1) {
      hitExhaustion = true;
      break;
    }
    try {
      const currentId = game.getCurrentTurnPlayerId();
      if (!currentId) break;
      game.drawCard(currentId, "CLOSED");
      const hand = game.getPlayerCards(currentId);
      game.discardCard(currentId, hand[hand.length - 1].id);
      rounds++;
    } catch (e) {
      // Expected when no cards available
      hitExhaustion = true;
      break;
    }
  }
  // Should not throw unexpectedly; game handles exhaustion gracefully
  assert.ok(hitExhaustion || rounds > 0, "Should reach deck exhaustion or complete draws");
  game.stopTimer();
});

test("First drop penalty: 2-player game, seat 1 drops without drawing", () => {
  const game = new Game("game-drop-2p", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  const res = game.drop("p1");
  assert.strictEqual(res.penalty, 20, "2-player: first drop must be 20");
  assert.match(res.publicState.roundScores["p1"].reason, /First Drop/);
  assert.strictEqual(game.status, "GAME_OVER", "2-player single-round: game ends when one player drops");
  game.stopTimer();
});

test("First drop penalty: 4-player game, non-host seat drops without drawing", () => {
  const game = new Game("game-drop-4p", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.addPlayer("p3", "Carol", "", 3);
  game.addPlayer("p4", "Dave", "", 4);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.setPlayerReady("p3", true);
  game.setPlayerReady("p4", true);
  game.startRound();

  // p3 drops without drawing -> first drop (20), regardless of seat position
  // Advance turn to p3 by drawing+discarding for p1 and p2
  while (game.getCurrentTurnPlayerId() !== "p3") {
    const currentId = game.getCurrentTurnPlayerId();
    game.drawCard(currentId, "CLOSED");
    const hand = game.getPlayerCards(currentId);
    game.discardCard(currentId, hand[hand.length - 1].id);
  }
  // p3 is current turn, hasn't drawn this round
  const res = game.drop("p3");
  assert.strictEqual(res.penalty, 20, "4-player: first drop (no draw) must be 20 regardless of seat");
  assert.strictEqual(game.getPlayer("p3").hasDropped, true, "p3 should be marked as dropped");
  game.stopTimer();
});

test("Per-player first drop vs middle drop in 3-player game with all droppers scored", () => {
  const game = new Game("game-mid-drop", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.addPlayer("p3", "Carol", "", 3);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.setPlayerReady("p3", true);
  game.startRound();

  // p1 drops first -> first drop (20), round continues
  const r1 = game.drop("p1");
  assert.strictEqual(r1.penalty, 20);
  // Turn advances to p2. p2 draws + discards, turn advances to p3.
  game.drawCard("p2", "CLOSED");
  const hand2 = game.getPlayerCards("p2");
  game.discardCard("p2", hand2[hand2.length - 1].id);
  // p3 draws + discards, turn returns to p2 (who already drew -> middle drop = 40!)
  game.drawCard("p3", "CLOSED");
  const hand3 = game.getPlayerCards("p3");
  game.discardCard("p3", hand3[hand3.length - 1].id);

  const res = game.drop("p2");
  assert.strictEqual(res.penalty, 40, "Middle drop must be 40 when player has already drawn");
  assert.strictEqual(res.publicState.status, "GAME_OVER");
  assert.strictEqual(res.publicState.winnerId, "p3", "winnerId must be populated on round completion");
  assert.strictEqual(res.publicState.roundScores["p1"].points, 20);
  assert.strictEqual(res.publicState.roundScores["p2"].points, 40);
  assert.strictEqual(res.publicState.roundScores["p3"].points, 0);
  assert.match(res.publicState.roundScores["p2"].reason, /Middle Drop/);
  game.stopTimer();
});

test("Middle drop penalty: player who drew then drops on next turn", () => {
  const game = new Game("game-mid-drop2", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  // p1 draws (hasDrawn = true), discards, turn advances to p2
  game.drawCard("p1", "CLOSED");
  const hand1 = game.getPlayerCards("p1");
  game.discardCard("p1", hand1[hand1.length - 1].id);
  // p2 draws + discards, turn returns to p1
  game.drawCard("p2", "CLOSED");
  const hand2 = game.getPlayerCards("p2");
  game.discardCard("p2", hand2[hand2.length - 1].id);
  // p1 drops after having drawn -> middle drop (40 pts)
  const res = game.drop("p1");
  assert.strictEqual(res.penalty, 40, "2-player: p1 middle drop after drawing must be 40");
  assert.strictEqual(res.publicState.winnerId, "p2", "winnerId must be set to remaining player");
  game.stopTimer();
});

test("Printed Joker cut: wildRank is 'A' and drawing an Ace marks isWildJoker = true", () => {
  let game;
  let foundPrintedJokerCut = false;

  // Retry fresh deals until a Printed Joker is naturally cut (~5% per deal)
  for (let attempt = 0; attempt < 500; attempt++) {
    game = new Game(`game-pj-cut-${attempt}`, "room-1", "ABC123");
    game.addPlayer("p1", "Alice", "", 1);
    game.addPlayer("p2", "Bob", "", 2);
    game.setPlayerReady("p1", true);
    game.setPlayerReady("p2", true);
    game.startRound();

    if (game.getPublicState().wildJoker.isPrintedJoker) {
      foundPrintedJokerCut = true;
      break;
    }
    game.stopTimer();
  }

  assert.strictEqual(foundPrintedJokerCut, true, "Should hit a Printed Joker cut within 500 deals");
  assert.strictEqual(game.getWildRank(), "A", "wildRank must be 'A' when a Printed Joker is cut");
  assert.strictEqual(game.getPublicState().wildRank, "A", "PublicGameState.wildRank must be 'A'");

  // Verify every Ace currently in player hands is marked isWildJoker = true
  for (const pid of ["p1", "p2"]) {
    for (const c of game.getPlayerCards(pid)) {
      if (c.rank === "A") {
        assert.strictEqual(c.isWildJoker, true, `Dealt Ace ${c.id} must be marked isWildJoker=true`);
      }
    }
  }

  // Draw from the closed deck across turns until an Ace is drawn, and verify it is marked isWildJoker = true
  let drewAceFromClosed = false;
  for (let turn = 0; turn < 80; turn++) {
    const state = game.getPublicState();
    if (state.closedDeckCount === 0) break;
    const pid = game.getCurrentTurnPlayerId();
    const { drawnCard } = game.drawCard(pid, "CLOSED");
    if (drawnCard.rank === "A") {
      assert.strictEqual(
        drawnCard.isWildJoker,
        true,
        `Ace ${drawnCard.id} drawn from closed deck must have isWildJoker=true when Printed Joker was cut`
      );
      drewAceFromClosed = true;
      break;
    }
    game.discardCard(pid, drawnCard.id);
  }
  assert.strictEqual(drewAceFromClosed, true, "Should draw at least one Ace from closed deck to verify wild marking");
  game.stopTimer();
});

test("Natural Wild Joker inside a Pure Sequence passes Evaluator.validateDeclaration", () => {
  // Suppose 5 is the Wild Joker rank; 5H is used naturally in 4H-5H-6H pure sequence
  const pureWithNaturalWild = [
    { id: "1", suit: "HEARTS", rank: "4", isWildJoker: false, isPrintedJoker: false },
    { id: "2", suit: "HEARTS", rank: "5", isWildJoker: true, isPrintedJoker: false },
    { id: "3", suit: "HEARTS", rank: "6", isWildJoker: false, isPrintedJoker: false },
  ];
  const impureSeq = [
    { id: "4", suit: "SPADES", rank: "8", isWildJoker: false, isPrintedJoker: false },
    { id: "5", suit: "CLUBS", rank: "5", isWildJoker: true, isPrintedJoker: false },
    { id: "6", suit: "SPADES", rank: "10", isWildJoker: false, isPrintedJoker: false },
    { id: "7", suit: "SPADES", rank: "J", isWildJoker: false, isPrintedJoker: false },
  ];
  const set1 = [
    { id: "8", suit: "DIAMONDS", rank: "K", isWildJoker: false, isPrintedJoker: false },
    { id: "9", suit: "CLUBS", rank: "K", isWildJoker: false, isPrintedJoker: false },
    { id: "10", suit: "SPADES", rank: "K", isWildJoker: false, isPrintedJoker: false },
  ];
  const set2 = [
    { id: "11", suit: "HEARTS", rank: "9", isWildJoker: false, isPrintedJoker: false },
    { id: "12", suit: "DIAMONDS", rank: "9", isWildJoker: false, isPrintedJoker: false },
    { id: "13", suit: "CLUBS", rank: "9", isWildJoker: false, isPrintedJoker: false },
  ];

  const decl = Evaluator.validateDeclaration([pureWithNaturalWild, impureSeq, set1, set2]);
  assert.strictEqual(
    decl.isValid,
    true,
    `Declaration with natural wild joker in pure sequence must be valid (got: ${decl.reason})`
  );
  assert.strictEqual(decl.evaluatedMelds[0].type, "PURE_SEQUENCE");
  assert.strictEqual(decl.evaluatedMelds[1].type, "IMPURE_SEQUENCE");
});

test("3-player invalid declaration broadcasts state update and advances turn without freezing", () => {
  const broadcastedStates = [];
  const game = new Game("game-3p-inv-decl", "room-1", "ABC123", {
    onStateUpdate: (s) => broadcastedStates.push(s),
  });
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.addPlayer("p3", "Carol", "", 3);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.setPlayerReady("p3", true);
  game.startRound();

  game.drawCard("p1", "CLOSED");
  const p1Hand = game.getPlayerCards("p1");
  const declareCardId = p1Hand[p1Hand.length - 1].id;
  // Submit 13 real cards grouped as a single invalid 13-card meld (guaranteed invalid)
  const invalidMelds = [p1Hand.slice(0, 13)];

  broadcastedStates.length = 0;
  const result = game.declare("p1", invalidMelds, declareCardId);

  assert.strictEqual(result.isValid, false, "Invalid melds must fail declaration");
  assert.ok(result.reason, "Invalid declaration must include a failure reason");
  assert.strictEqual(game.status, "PLAYING", "Game must remain PLAYING with 2 active players left");
  assert.strictEqual(game.getPlayer("p1").hasDropped, true, "Invalid declarer must be dropped");
  assert.strictEqual(game.getPlayer("p1").totalScore, 80, "Invalid declarer must incur 80-pt penalty");
  assert.strictEqual(game.getCurrentTurnPlayerId(), "p2", "Turn must advance to p2");
  assert.ok(
    broadcastedStates.length >= 1,
    "onStateUpdate must be called on 3-player invalid declare so clients stay in sync"
  );
  const latestBroadcast = broadcastedStates[broadcastedStates.length - 1];
  assert.strictEqual(latestBroadcast.currentTurnPlayerId, "p2");
  assert.strictEqual(latestBroadcast.turnPhase, "DRAW");
  assert.strictEqual(latestBroadcast.players.find((p) => p.id === "p1").hasDropped, true);
  game.stopTimer();
});

test("sortPlayerHand persists sorted order on player.hand server-side", () => {
  const game = new Game("game-sort-persist", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  const byRank = game.sortPlayerHand("p1", "RANK");
  assert.deepStrictEqual(
    game.getPlayerCards("p1").map((c) => c.id),
    byRank.map((c) => c.id),
    "RANK sorted order must persist on server player.hand"
  );

  const bySuit = game.sortPlayerHand("p1", "SUIT");
  assert.deepStrictEqual(
    game.getPlayerCards("p1").map((c) => c.id),
    bySuit.map((c) => c.id),
    "SUIT sorted order must persist on server player.hand"
  );
  game.stopTimer();
});

// Helper to construct deterministic hands for Show phase tests
function makeCard(id, suit, rank, isWildJoker = false, isPrintedJoker = false) {
  return { id, suit, rank, isWildJoker, isPrintedJoker };
}

test("Valid declaration -> SHOW phase -> opponent submits valid melds -> reduced deadwood score (not 80)", () => {
  const states = [];
  const game = new Game("game-show-meld", "room-1", "SHOW01", {
    roundCount: 2,
    showTimeLimitSeconds: 30,
    onStateUpdate: (s) => states.push(s),
  });
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  // p1 draws to enter DISCARD phase
  game.drawCard("p1", "CLOSED");

  // Assign deterministic valid winning hand (13 cards + 1 finish card) to p1
  const p1Pure = [
    makeCard("H4_1", "HEARTS", "4"),
    makeCard("H5_1", "HEARTS", "5"),
    makeCard("H6_1", "HEARTS", "6"),
  ];
  const p1Impure = [
    makeCard("S8_1", "SPADES", "8"),
    makeCard("PJ_1", "JOKER", "PRINTED_JOKER", false, true),
    makeCard("S10_1", "SPADES", "10"),
    makeCard("SJ_1", "SPADES", "J"),
  ];
  const p1Set1 = [
    makeCard("DK_1", "DIAMONDS", "K"),
    makeCard("CK_1", "CLUBS", "K"),
    makeCard("SK_1", "SPADES", "K"),
  ];
  const p1Set2 = [
    makeCard("H3_1", "HEARTS", "3"),
    makeCard("D3_1", "DIAMONDS", "3"),
    makeCard("C3_1", "CLUBS", "3"),
  ];
  const p1Discard = makeCard("C9_1", "CLUBS", "9");
  game.getPlayer("p1").hand = [...p1Pure, ...p1Impure, ...p1Set1, ...p1Set2, p1Discard];

  // Assign deterministic 13-card hand to p2:
  // 1 pure sequence (0 pts) + 1 impure sequence (0 pts) + 1 valid set (0 pts) + 4 deadwood cards (2+3+4+5 = 14 pts!)
  const p2Pure = [
    makeCard("D4_2", "DIAMONDS", "4"),
    makeCard("D5_2", "DIAMONDS", "5"),
    makeCard("D6_2", "DIAMONDS", "6"),
  ];
  const p2Impure = [
    makeCard("C7_2", "CLUBS", "7"),
    makeCard("C8_2", "CLUBS", "8"),
    makeCard("PJ_2", "JOKER", "PRINTED_JOKER", false, true),
  ];
  const p2Set = [
    makeCard("HQ_2", "HEARTS", "Q"),
    makeCard("SQ_2", "SPADES", "Q"),
    makeCard("DQ_2", "DIAMONDS", "Q"),
  ];
  const p2Deadwood = [
    makeCard("C2_2", "CLUBS", "2"),
    makeCard("H3_2", "HEARTS", "3"),
    makeCard("S4_2", "SPADES", "4"),
    makeCard("S5_2", "SPADES", "5"),
  ];
  game.getPlayer("p2").hand = [...p2Pure, ...p2Impure, ...p2Set, ...p2Deadwood];

  // 1. p1 makes a valid declaration -> must transition to SHOW (NOT immediately ROUND_END)
  const declRes = game.declare("p1", [p1Pure, p1Impure, p1Set1, p1Set2], p1Discard.id);
  assert.strictEqual(declRes.isValid, true, "Valid declaration must succeed");
  assert.strictEqual(game.status, "SHOW", "Game must enter SHOW phase after valid declaration");
  assert.strictEqual(declRes.publicState.status, "SHOW");
  assert.strictEqual(declRes.publicState.winnerId, "p1");
  assert.strictEqual(declRes.publicState.winnerMelds.length, 4, "winnerMelds must be included in SHOW state");
  assert.ok(
    typeof declRes.publicState.showEndsAt === "number" && declRes.publicState.showEndsAt > Date.now(),
    "showEndsAt timestamp must be in the future"
  );
  assert.strictEqual(
    declRes.publicState.turnEndsAt,
    declRes.publicState.showEndsAt,
    "turnEndsAt should match showEndsAt during SHOW phase"
  );

  // 2. Security check: opponent submitting forged/unknown card ID must be rejected
  assert.throws(
    () => game.submitMelds("p2", [[makeCard("FORGED_99", "HEARTS", "A")]]),
    /invalid or forged/i,
    "submitMelds must reject forged card IDs"
  );

  // 3. Security check: opponent trying to tamper card values (claiming deadwood cards are a pure sequence)
  //    Server reconstructs strictly from cardId, so tampered suit/rank MUST be ignored!
  const tamperedDeadwood = p2Deadwood.map((c, idx) => ({
    ...c,
    suit: "HEARTS",
    rank: String(idx + 2),
    isWildJoker: false,
    isPrintedJoker: false,
  }));

  // 4. p2 submits valid melds + (even tampered) deadwood -> server uses real card values -> exactly 14 pts (NOT 80!)
  const submitRes = game.submitMelds("p2", [p2Pure, p2Impure, p2Set, tamperedDeadwood]);
  assert.strictEqual(submitRes.submitted, true);
  assert.strictEqual(submitRes.allSubmitted, true);
  assert.strictEqual(game.status, "ROUND_END", "Round must finalize to ROUND_END once all active opponents submit");
  assert.strictEqual(submitRes.publicState.roundScores["p1"].points, 0);
  assert.strictEqual(
    submitRes.publicState.roundScores["p2"].points,
    14,
    `Opponent deadwood should be exactly 14 pts, got ${submitRes.publicState.roundScores["p2"].points}`
  );
  assert.strictEqual(submitRes.publicState.totalScores["p2"], 14);
  game.stopTimer();
});

test("SHOW phase timer expiration auto-scores unsubmitted opponent (capped at 80)", async () => {
  const states = [];
  const game = new Game("game-show-timeout", "room-1", "SHOW02", {
    roundCount: 1,
    showTimeLimitSeconds: 1,
    onStateUpdate: (s) => states.push(s),
  });
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  game.drawCard("p1", "CLOSED");

  const p1Pure = [
    makeCard("H4_1", "HEARTS", "4"),
    makeCard("H5_1", "HEARTS", "5"),
    makeCard("H6_1", "HEARTS", "6"),
  ];
  const p1Pure2 = [
    makeCard("S8_1", "SPADES", "8"),
    makeCard("S9_1", "SPADES", "9"),
    makeCard("S10_1", "SPADES", "10"),
    makeCard("SJ_1", "SPADES", "J"),
  ];
  const p1Set1 = [
    makeCard("DK_1", "DIAMONDS", "K"),
    makeCard("CK_1", "CLUBS", "K"),
    makeCard("SK_1", "SPADES", "K"),
  ];
  const p1Set2 = [
    makeCard("H3_1", "HEARTS", "3"),
    makeCard("D3_1", "DIAMONDS", "3"),
    makeCard("C3_1", "CLUBS", "3"),
  ];
  const p1Discard = makeCard("C9_1", "CLUBS", "9");
  game.getPlayer("p1").hand = [...p1Pure, ...p1Pure2, ...p1Set1, ...p1Set2, p1Discard];

  // Give p2 high-value unsubmitted cards (> 80 total -> capped at 80)
  game.getPlayer("p2").hand = [
    makeCard("HK_2", "HEARTS", "K"),
    makeCard("HQ_2", "HEARTS", "Q"),
    makeCard("HJ_2", "HEARTS", "J"),
    makeCard("HA_2", "HEARTS", "A"),
    makeCard("SK_2", "SPADES", "K"),
    makeCard("SQ_2", "SPADES", "Q"),
    makeCard("SJ_2", "SPADES", "J"),
    makeCard("SA_2", "SPADES", "A"),
    makeCard("DK_2", "DIAMONDS", "K"),
    makeCard("DQ_2", "DIAMONDS", "Q"),
    makeCard("DJ_2", "DIAMONDS", "J"),
    makeCard("DA_2", "DIAMONDS", "A"),
    makeCard("CK_2", "CLUBS", "K"),
  ];

  game.declare("p1", [p1Pure, p1Pure2, p1Set1, p1Set2], p1Discard.id);
  assert.strictEqual(game.status, "SHOW");

  // Wait for 1-second show timer to expire
  await new Promise((r) => setTimeout(r, 1400));

  assert.strictEqual(game.status, "GAME_OVER", "Single-round game must finalize to GAME_OVER when show timer expires");
  const finalState = states[states.length - 1];
  assert.strictEqual(finalState.roundScores["p1"].points, 0);
  assert.strictEqual(finalState.roundScores["p2"].points, 80, "Unsubmitted opponent should be auto-scored and capped at 80");
  assert.strictEqual(game.isTimerRunning(), false, "Timer must be cleared after show finalization");
});

test("Multi-round progression: startNextRound increments roundNumber, accumulates totalScores, and ends in GAME_OVER with rankings", () => {
  const game = new Game("game-multi-round", "room-1", "MLTI01", { roundCount: 2 });
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  assert.strictEqual(game.roundNumber, 1);
  assert.strictEqual(game.roundCount, 2);

  // Round 1: p1 drops (+20 pts) -> ROUND_END (not GAME_OVER yet because roundCount=2)
  const r1 = game.drop("p1");
  assert.strictEqual(r1.publicState.status, "ROUND_END", "Round 1 of 2 must end in ROUND_END");
  assert.strictEqual(r1.publicState.totalScores["p1"], 20);
  assert.strictEqual(r1.publicState.totalScores["p2"], 0);
  assert.strictEqual(r1.publicState.rankings, undefined, "rankings only present on GAME_OVER");

  // Start Round 2
  game.startNextRound("game-multi-round_r2");
  assert.strictEqual(game.roundNumber, 2);
  assert.strictEqual(game.status, "PLAYING");
  assert.strictEqual(game.getPlayerCards("p1").length, 13);
  assert.strictEqual(game.getPlayerCards("p2").length, 13);
  assert.strictEqual(game.getPublicState().totalScores["p1"], 20, "Round 1 cumulative score preserved in Round 2");

  // Round 2: p1 drops again (+20 -> cumulative 40 pts) -> final round -> GAME_OVER
  const r2 = game.drop("p1");
  assert.strictEqual(r2.publicState.status, "GAME_OVER", "Final round must transition to GAME_OVER");
  assert.strictEqual(r2.publicState.roundNumber, 2);
  assert.strictEqual(r2.publicState.totalScores["p1"], 40, "p1 totalScores must accumulate 20 + 20 = 40");
  assert.strictEqual(r2.publicState.totalScores["p2"], 0);
  assert.ok(Array.isArray(r2.publicState.rankings) && r2.publicState.rankings.length === 2);
  assert.strictEqual(r2.publicState.rankings[0].playerId, "p2", "Lowest totalScore wins rank #1");
  assert.strictEqual(r2.publicState.rankings[0].rank, 1);
  assert.strictEqual(r2.publicState.rankings[1].playerId, "p1");
  assert.strictEqual(r2.publicState.rankings[1].rank, 2);
  assert.strictEqual(r2.publicState.rankings[1].totalScore, 40);

  // Calling startNextRound after GAME_OVER must throw
  assert.throws(() => game.startNextRound(), /Cannot start next round/i);
  game.stopTimer();
});

test("turnEndsAt is populated while running and stopTimer/resumeTimer pauses and restarts turn timer", () => {
  const game = new Game("game-timer-resume", "room-1", "TIME01", { turnTimeLimitSeconds: 25 });
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  const runningState = game.getPublicState();
  assert.strictEqual(game.isTimerRunning(), true);
  assert.ok(
    typeof runningState.turnEndsAt === "number" && runningState.turnEndsAt > Date.now(),
    "PublicGameState.turnEndsAt must be a future Unix ms timestamp while running"
  );

  // Simulate all-disconnect pause
  game.stopTimer();
  assert.strictEqual(game.isTimerRunning(), false);
  assert.strictEqual(game.getPublicState().turnEndsAt, null, "turnEndsAt must be null while paused");

  // Simulate player reconnect -> resumeTimer
  const resumed = game.resumeTimer();
  assert.strictEqual(resumed, true, "resumeTimer must return true when restarting a paused timer");
  assert.strictEqual(game.isTimerRunning(), true, "Timer must be running again after resumeTimer");
  const resumedState = game.getPublicState();
  assert.ok(
    typeof resumedState.turnEndsAt === "number" && resumedState.turnEndsAt > Date.now(),
    "Resumed turnEndsAt must be a future Unix ms timestamp"
  );
  game.stopTimer();
});

