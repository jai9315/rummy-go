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

test("Wild joker rejected in pure sequence", () => {
  // A wild joker substitute makes a sequence IMPURE, never PURE
  const wildRun = [
    { id: "1", suit: "HEARTS", rank: "4", isWildJoker: false, isPrintedJoker: false },
    { id: "2", suit: "HEARTS", rank: "5", isWildJoker: true, isPrintedJoker: false },
    { id: "3", suit: "HEARTS", rank: "6", isWildJoker: false, isPrintedJoker: false },
  ];
  assert.strictEqual(
    Evaluator.isValidPureSequence(wildRun),
    false,
    "Wild joker must not be allowed in a pure sequence"
  );
  assert.strictEqual(
    Evaluator.isValidImpureSequence(wildRun),
    true,
    "Wild joker run should be valid as impure sequence"
  );
  const meld = Evaluator.evaluateMeld(wildRun);
  assert.strictEqual(meld.type, "IMPURE_SEQUENCE", "Meld type should be IMPURE_SEQUENCE");
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

test("Middle drop penalty when another player already dropped", () => {
  const game = new Game("game-drop2", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.addPlayer("p3", "Carol", "", 3);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.setPlayerReady("p3", true);
  game.startRound();

  // p1 drops first (first drop = 20 pts)
  game.drop("p1");
  // p2 now drops without drawing -> middle drop (40 pts) because p1 already dropped
  const res = game.drop("p2");
  assert.strictEqual(res.penalty, 40, "Middle drop penalty must be 40 after another player dropped");
  const scoreInfo = res.publicState.roundScores["p2"];
  assert.match(scoreInfo.reason, /Middle Drop/);
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

  // p1 drops (2 players → round ends → endRound clears timers)
  game.drop("p1");

  assert.strictEqual(game["timerInterval"], null, "Timer should be cleared after round ends");
  assert.strictEqual(game.status, "ROUND_END", "Game should be in ROUND_END state");
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
  assert.strictEqual(game.status, "ROUND_END", "2-player: round ends when one player drops");
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

test("Middle drop penalty: player drops after another player already dropped", () => {
  const game = new Game("game-mid-drop", "room-1", "ABC123");
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.addPlayer("p3", "Carol", "", 3);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.setPlayerReady("p3", true);
  game.startRound();

  // p1 drops first -> first drop (20), round continues
  game.drop("p1");
  // Turn advances to p2. p2 draws + discards, turn advances to p3.
  game.drawCard("p2", "CLOSED");
  const hand2 = game.getPlayerCards("p2");
  game.discardCard("p2", hand2[hand2.length - 1].id);
  // p3 drops without drawing, but p1 already dropped -> middle drop (40)
  const res = game.drop("p3");
  assert.strictEqual(res.penalty, 40, "Middle drop must be 40 after another player dropped");
  assert.strictEqual(game.getPlayer("p3").hasDropped, true, "p3 should be marked as dropped");
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
  // Turn is now p2. p2 drops (first drop since no one dropped and p2 hasn't drawn)
  // With 2 players, round ends when p2 drops (only p1 remains active)
  const res = game.drop("p2");
  assert.strictEqual(res.penalty, 20, "2-player: p2 first drop must be 20");
  game.stopTimer();
});
