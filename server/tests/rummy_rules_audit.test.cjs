/**
 * Comprehensive 13-Card Indian Rummy Rules Compliance Audit
 *
 * Tests both server/src/engine/{Evaluator,Game,Deck} AND client/src/lib/clientEvaluator.ts
 * side-by-side for 100% Indian Rummy rule compliance and client/server parity.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const { Evaluator } = require("../dist/engine/Evaluator");
const { Deck } = require("../dist/engine/Deck");
const { Game } = require("../dist/engine/Game");

// Load the real client/src/lib/clientEvaluator.ts via TypeScript transpilation
function loadClientEvaluator() {
  const clientEvalPath = path.resolve(
    __dirname,
    "../../client/src/lib/clientEvaluator.ts"
  );
  const source = fs.readFileSync(clientEvalPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const mod = { exports: {} };
  const sandbox = { module: mod, exports: mod.exports, require };
  vm.runInNewContext(transpiled, sandbox, { filename: clientEvalPath });
  return mod.exports.ClientEvaluator;
}

const ClientEvaluator = loadClientEvaluator();

// Deterministic card builders
let cardCounter = 1;
function c(suit, rank, opts = {}) {
  const isPrintedJoker = Boolean(opts.isPrintedJoker || rank === "PRINTED_JOKER");
  const isWildJoker = Boolean(!isPrintedJoker && opts.isWildJoker);
  return {
    id: opts.id || `C_${suit[0]}_${rank}_${cardCounter++}`,
    suit: isPrintedJoker ? "JOKER" : suit,
    rank: isPrintedJoker ? "PRINTED_JOKER" : rank,
    isWildJoker,
    isPrintedJoker,
    deckIndex: opts.deckIndex || 1,
  };
}

function pj(id) {
  return c("JOKER", "PRINTED_JOKER", { isPrintedJoker: true, id });
}

function wj(suit, rank, id) {
  return c(suit, rank, { isWildJoker: true, id });
}

// Helper asserting BOTH server Evaluator and client ClientEvaluator agree on evaluateMeld
function assertMeldBoth(label, cards, expectedType, expectedValid) {
  const sRes = Evaluator.evaluateMeld(cards);
  const cRes = ClientEvaluator.evaluateMeld(cards);
  assert.strictEqual(
    sRes.type,
    expectedType,
    `[Server] ${label}: expected type=${expectedType}, got ${sRes.type}`
  );
  assert.strictEqual(
    sRes.isValid,
    expectedValid,
    `[Server] ${label}: expected isValid=${expectedValid}, got ${sRes.isValid}`
  );
  assert.strictEqual(
    cRes.type,
    sRes.type,
    `[Parity] ${label}: client type=${cRes.type} !== server type=${sRes.type}`
  );
  assert.strictEqual(
    cRes.isValid,
    sRes.isValid,
    `[Parity] ${label}: client isValid=${cRes.isValid} !== server isValid=${sRes.isValid}`
  );
}

// Helper asserting BOTH server Evaluator and client ClientEvaluator agree on validateDeclaration
function assertDeclarationBoth(label, melds, expectedValid) {
  const sRes = Evaluator.validateDeclaration(melds);
  assert.strictEqual(
    sRes.isValid,
    expectedValid,
    `[Server] ${label}: expected isValid=${expectedValid}, got ${sRes.isValid} (reason=${sRes.reason})`
  );

  assert.strictEqual(
    typeof ClientEvaluator.validateDeclaration,
    "function",
    "ClientEvaluator must expose validateDeclaration() for client/server parity"
  );
  const cRes = ClientEvaluator.validateDeclaration(melds);
  assert.strictEqual(
    cRes.isValid,
    sRes.isValid,
    `[Parity] ${label}: client validateDeclaration=${cRes.isValid} !== server=${sRes.isValid}`
  );
}

// Helper asserting BOTH server Evaluator and client ClientEvaluator agree on calculatePlayerScore
function assertScoreBoth(label, melds, expectedPoints) {
  const sRes = Evaluator.calculatePlayerScore(melds);
  const cRes = ClientEvaluator.calculatePlayerScore(melds);
  assert.strictEqual(
    sRes.points,
    expectedPoints,
    `[Server] ${label}: expected ${expectedPoints} pts, got ${sRes.points}`
  );
  assert.strictEqual(
    cRes.points,
    sRes.points,
    `[Parity] ${label}: client score=${cRes.points} !== server score=${sRes.points}`
  );
}

// ===========================================================================
// 1. MANDATORY SEQUENCES (LIVES) ON DECLARATION
// ===========================================================================
test("AUDIT 1: Mandatory Sequences (Lives) on Declaration", () => {
  // 1a. Reject 13-card hand with 2 impure sequences + 2 sets (0 pure sequences)
  assertDeclarationBoth(
    "0 Pure Sequences (2 impure + 2 sets)",
    [
      [c("SPADES", "4"), pj(), c("SPADES", "6")], // impure (3)
      [c("HEARTS", "8"), wj("CLUBS", "2"), c("HEARTS", "10"), c("HEARTS", "J")], // impure (4)
      [c("DIAMONDS", "K"), c("CLUBS", "K"), c("SPADES", "K")], // set (3)
      [c("HEARTS", "9"), c("DIAMONDS", "9"), c("CLUBS", "9")], // set (3)
    ],
    false
  );

  // 1b. Reject 13-card hand with 1 pure sequence + 3 sets (only 1 sequence total)
  assertDeclarationBoth(
    "Only 1 Sequence Total (1 pure + 3 sets)",
    [
      [c("SPADES", "4"), c("SPADES", "5"), c("SPADES", "6"), c("SPADES", "7")], // pure (4)
      [c("DIAMONDS", "K"), c("CLUBS", "K"), c("SPADES", "K")], // set (3)
      [c("HEARTS", "9"), c("DIAMONDS", "9"), c("CLUBS", "9")], // set (3)
      [c("HEARTS", "3"), c("DIAMONDS", "3"), c("SPADES", "3")], // set (3)
    ],
    false
  );

  // 1c. Accept 2 Pure Sequences + 2 Sets (13 cards)
  assertDeclarationBoth(
    "2 Pure Sequences + 2 Sets",
    [
      [c("SPADES", "A"), c("SPADES", "2"), c("SPADES", "3")], // pure (3)
      [c("HEARTS", "Q"), c("HEARTS", "K"), c("HEARTS", "A")], // pure (3)
      [c("DIAMONDS", "8"), c("CLUBS", "8"), c("SPADES", "8"), c("HEARTS", "8")], // set (4)
      [c("DIAMONDS", "5"), c("CLUBS", "5"), c("SPADES", "5")], // set (3)
    ],
    true
  );

  // 1d. Accept 1 Pure + 1 Impure Sequence + 2 Sets (13 cards)
  assertDeclarationBoth(
    "1 Pure + 1 Impure Sequence + 2 Sets",
    [
      [c("HEARTS", "4"), c("HEARTS", "5"), c("HEARTS", "6")], // pure (3)
      [c("SPADES", "8"), pj(), c("SPADES", "10"), c("SPADES", "J")], // impure (4)
      [c("DIAMONDS", "K"), c("CLUBS", "K"), c("SPADES", "K")], // set (3)
      [c("HEARTS", "3"), c("DIAMONDS", "3"), c("CLUBS", "3")], // set (3)
    ],
    true
  );

  // 1e. Accept 4 Sequences (at least 1 Pure, 13 cards)
  assertDeclarationBoth(
    "4 Sequences (1 pure + 3 impure)",
    [
      [c("CLUBS", "2"), c("CLUBS", "3"), c("CLUBS", "4")], // pure (3)
      [c("SPADES", "5"), pj(), c("SPADES", "7")], // impure (3)
      [c("HEARTS", "9"), pj(), c("HEARTS", "J")], // impure (3)
      [c("DIAMONDS", "10"), c("DIAMONDS", "J"), wj("CLUBS", "7"), c("DIAMONDS", "K")], // impure (4)
    ],
    true
  );

  // 1f. Reject 12-card declaration
  assertDeclarationBoth(
    "Wrong Card Count: 12 cards",
    [
      [c("SPADES", "A"), c("SPADES", "2"), c("SPADES", "3")], // 3
      [c("HEARTS", "Q"), c("HEARTS", "K"), c("HEARTS", "A")], // 3
      [c("DIAMONDS", "8"), c("CLUBS", "8"), c("SPADES", "8")], // 3
      [c("DIAMONDS", "5"), c("CLUBS", "5"), c("SPADES", "5")], // 3
    ],
    false
  );

  // 1g. Reject 14-card declaration
  assertDeclarationBoth(
    "Wrong Card Count: 14 cards",
    [
      [c("SPADES", "A"), c("SPADES", "2"), c("SPADES", "3"), c("SPADES", "4")], // 4
      [c("HEARTS", "J"), c("HEARTS", "Q"), c("HEARTS", "K"), c("HEARTS", "A")], // 4
      [c("DIAMONDS", "8"), c("CLUBS", "8"), c("SPADES", "8")], // 3
      [c("DIAMONDS", "5"), c("CLUBS", "5"), c("SPADES", "5")], // 3
    ],
    false
  );
});

// ===========================================================================
// 2. PURE SEQUENCE (FIRST LIFE) EDGE CASES
// ===========================================================================
test("AUDIT 2: Pure Sequence (First Life) Edge Cases", () => {
  // Ace-low and Ace-high
  assertMeldBoth(
    "Ace-low Pure Sequence (A♠-2♠-3♠)",
    [c("SPADES", "A"), c("SPADES", "2"), c("SPADES", "3")],
    "PURE_SEQUENCE",
    true
  );
  assertMeldBoth(
    "Ace-high Pure Sequence (Q♥-K♥-A♥)",
    [c("HEARTS", "Q"), c("HEARTS", "K"), c("HEARTS", "A")],
    "PURE_SEQUENCE",
    true
  );

  // Wrap-around rejected
  assertMeldBoth(
    "Wrap-around rejected (K♣-A♣-2♣)",
    [c("CLUBS", "K"), c("CLUBS", "A"), c("CLUBS", "2")],
    "INVALID",
    false
  );

  // Mixed suits & duplicate ranks rejected
  assertMeldBoth(
    "Mixed suits rejected (4♠-5♥-6♠)",
    [c("SPADES", "4"), c("HEARTS", "5"), c("SPADES", "6")],
    "INVALID",
    false
  );
  assertMeldBoth(
    "Duplicate ranks rejected (4♠-4♠-5♠)",
    [c("SPADES", "4", { deckIndex: 1 }), c("SPADES", "4", { deckIndex: 2 }), c("SPADES", "5")],
    "INVALID",
    false
  );

  // Printed Joker rejected as Pure (classified as Impure instead)
  const pjSeq = [c("SPADES", "4"), c("SPADES", "5"), pj()];
  assert.strictEqual(Evaluator.isValidPureSequence(pjSeq), false);
  assert.strictEqual(ClientEvaluator.isValidPureSequence(pjSeq), false);
  assertMeldBoth("Printed Joker sequence is Impure, not Pure", pjSeq, "IMPURE_SEQUENCE", true);

  // Wild Joker in natural suit & consecutive rank IS a Pure Sequence
  const naturalWildPure = [c("HEARTS", "6"), wj("HEARTS", "7"), c("HEARTS", "8")];
  assert.strictEqual(Evaluator.isValidPureSequence(naturalWildPure), true);
  assert.strictEqual(ClientEvaluator.isValidPureSequence(naturalWildPure), true);
  assertMeldBoth(
    "Wild Joker in natural suit & rank (6♥-7♥(wild)-8♥) is PURE_SEQUENCE",
    naturalWildPure,
    "PURE_SEQUENCE",
    true
  );

  // Wild Joker of DIFFERENT suit substituting in rank gap is NOT Pure (must be Impure)
  const subWildImpure = [c("HEARTS", "6"), wj("SPADES", "7"), c("HEARTS", "8")];
  assert.strictEqual(Evaluator.isValidPureSequence(subWildImpure), false);
  assert.strictEqual(ClientEvaluator.isValidPureSequence(subWildImpure), false);
  assertMeldBoth(
    "Wild Joker of different suit (6♥-7♠(wild)-8♥) is IMPURE_SEQUENCE, not Pure",
    subWildImpure,
    "IMPURE_SEQUENCE",
    true
  );

  // 2-card sequence rejected
  assertMeldBoth(
    "2-card sequence rejected (5♠-6♠)",
    [c("SPADES", "5"), c("SPADES", "6")],
    "INVALID",
    false
  );
});

// ===========================================================================
// 3. IMPURE SEQUENCE (SECOND LIFE) EDGE CASES
// ===========================================================================
test("AUDIT 3: Impure Sequence (Second Life) Edge Cases", () => {
  // 1 or 2 jokers filling gaps / ends
  assertMeldBoth(
    "1 joker middle gap (5♠-JKR-7♠)",
    [c("SPADES", "5"), pj(), c("SPADES", "7")],
    "IMPURE_SEQUENCE",
    true
  );
  assertMeldBoth(
    "2 jokers double gap (9♦-JKR-JKR-Q♦)",
    [c("DIAMONDS", "9"), pj(), wj("CLUBS", "3"), c("DIAMONDS", "Q")],
    "IMPURE_SEQUENCE",
    true
  );
  assertMeldBoth(
    "High end joker (Q♣-K♣-JKR)",
    [c("CLUBS", "Q"), c("CLUBS", "K"), pj()],
    "IMPURE_SEQUENCE",
    true
  );
  assertMeldBoth(
    "Low end joker (A♥-2♥-JKR)",
    [c("HEARTS", "A"), c("HEARTS", "2"), pj()],
    "IMPURE_SEQUENCE",
    true
  );

  // Duplicate natural ranks rejected
  assertMeldBoth(
    "Duplicate natural ranks rejected (5♠-5♠-6♠-JKR)",
    [c("SPADES", "5", { deckIndex: 1 }), c("SPADES", "5", { deckIndex: 2 }), c("SPADES", "6"), pj()],
    "INVALID",
    false
  );

  // Mixed natural suits rejected
  assertMeldBoth(
    "Mixed natural suits rejected (5♠-6♥-JKR)",
    [c("SPADES", "5"), c("HEARTS", "6"), pj()],
    "INVALID",
    false
  );

  // Wrap-around with joker rejected (K♣-A♣-2♣-JKR and K♣-JKR-2♣)
  assertMeldBoth(
    "Wrap-around with joker rejected (K♣-A♣-2♣-JKR)",
    [c("CLUBS", "K"), c("CLUBS", "A"), c("CLUBS", "2"), pj()],
    "INVALID",
    false
  );
  assertMeldBoth(
    "Wrap-around gap with joker rejected (K♣-JKR-2♣)",
    [c("CLUBS", "K"), pj(), c("CLUBS", "2")],
    "INVALID",
    false
  );

  // 14-card overflow sequence (all 13 ranks A..K + 1 extra joker) MUST be rejected by BOTH server & client!
  const all13PlusJoker = [
    c("SPADES", "A"), c("SPADES", "2"), c("SPADES", "3"), c("SPADES", "4"),
    c("SPADES", "5"), c("SPADES", "6"), c("SPADES", "7"), c("SPADES", "8"),
    c("SPADES", "9"), c("SPADES", "10"), c("SPADES", "J"), c("SPADES", "Q"),
    c("SPADES", "K"), pj(),
  ];
  assertMeldBoth(
    "14-card sequence overflow (A..K + JKR) rejected on both server & client",
    all13PlusJoker,
    "INVALID",
    false
  );
});

// ===========================================================================
// 4. SETS (TRIALS) EDGE CASES (2-DECK TRAPS)
// ===========================================================================
test("AUDIT 4: Sets (Trials) Edge Cases & 2-Deck Traps", () => {
  // 3-card and 4-card sets of distinct suits
  assertMeldBoth(
    "3-card set distinct suits (8♥-8♣-8♠)",
    [c("HEARTS", "8"), c("CLUBS", "8"), c("SPADES", "8")],
    "SET",
    true
  );
  assertMeldBoth(
    "4-card set distinct suits (K♥-K♣-K♠-K♦)",
    [c("HEARTS", "K"), c("CLUBS", "K"), c("SPADES", "K"), c("DIAMONDS", "K")],
    "SET",
    true
  );

  // 2-Deck Duplicate Suit Traps rejected
  assertMeldBoth(
    "2-Deck duplicate suit trap (8♥-8♥-8♠) rejected",
    [c("HEARTS", "8", { deckIndex: 1 }), c("HEARTS", "8", { deckIndex: 2 }), c("SPADES", "8")],
    "INVALID",
    false
  );
  assertMeldBoth(
    "2-Deck duplicate suit + joker trap (8♥-8♥-JKR) rejected",
    [c("HEARTS", "8", { deckIndex: 1 }), c("HEARTS", "8", { deckIndex: 2 }), pj()],
    "INVALID",
    false
  );

  // 5-card set rejected
  assertMeldBoth(
    "5-card set (8♥-8♣-8♠-8♦-JKR) rejected",
    [c("HEARTS", "8"), c("CLUBS", "8"), c("SPADES", "8"), c("DIAMONDS", "8"), pj()],
    "INVALID",
    false
  );

  // Sets completed with jokers
  assertMeldBoth(
    "Set with 1 joker (8♥-8♣-JKR)",
    [c("HEARTS", "8"), c("CLUBS", "8"), pj()],
    "SET",
    true
  );

  // 8♥-JKR-JKR: valid both as Set (isValidSet=true) and as Impure Sequence (evaluateMeld -> valid)
  const oneCardTwoJokers = [c("HEARTS", "8"), pj(), wj("CLUBS", "4")];
  assert.strictEqual(Evaluator.isValidSet(oneCardTwoJokers), true);
  assert.strictEqual(ClientEvaluator.isValidSet(oneCardTwoJokers), true);
  const sEval = Evaluator.evaluateMeld(oneCardTwoJokers);
  const cEval = ClientEvaluator.evaluateMeld(oneCardTwoJokers);
  assert.strictEqual(sEval.isValid, true);
  assert.strictEqual(cEval.isValid, true);
  assert.strictEqual(cEval.type, sEval.type);
});

// ===========================================================================
// 5. OPPONENT SHOW-PHASE DEADWOOD SCORING RULES
// ===========================================================================
test("AUDIT 5: Opponent Show-Phase Deadwood Scoring Rules & Card Values", () => {
  // Card point values: A, K, Q, J, 10 = 10; 2-9 = face value; Printed & Wild Jokers = 0
  const pointChecks = [
    [c("SPADES", "A"), 10],
    [c("HEARTS", "K"), 10],
    [c("DIAMONDS", "Q"), 10],
    [c("CLUBS", "J"), 10],
    [c("SPADES", "10"), 10],
    [c("HEARTS", "9"), 9],
    [c("DIAMONDS", "5"), 5],
    [c("CLUBS", "2"), 2],
    [pj(), 0],
    [wj("SPADES", "A"), 0],
    [wj("HEARTS", "K"), 0],
    [wj("CLUBS", "7"), 0],
  ];
  for (const [card, expectedPts] of pointChecks) {
    assert.strictEqual(Evaluator.getCardPoints(card), expectedPts);
    assert.strictEqual(ClientEvaluator.getCardPoints(card), expectedPts);
  }

  // 5a. 0 Pure Sequences (low cards < 80): Impure seq & Sets STILL count as deadwood; Jokers = 0
  assertScoreBoth(
    "0 Pure Sequences: impure seq & sets count as deadwood, jokers = 0",
    [
      [c("SPADES", "2"), pj(), c("SPADES", "4")], // impure: 2 + 0 + 4 = 6
      [c("HEARTS", "3"), c("CLUBS", "3"), c("DIAMONDS", "3")], // set: 9
      [c("CLUBS", "5"), c("DIAMONDS", "6"), wj("SPADES", "K"), pj()], // ungrouped: 5 + 6 + 0 + 0 = 11
      [c("HEARTS", "2"), c("DIAMONDS", "2"), c("SPADES", "3")], // ungrouped: 7
    ],
    6 + 9 + 11 + 7 // = 33 pts
  );

  // 5b. 0 Pure Sequences (high cards > 80): Capped strictly at 80 pts
  assertScoreBoth(
    "0 Pure Sequences: high deadwood capped at 80 pts",
    [
      [c("SPADES", "10"), pj(), c("SPADES", "Q")], // 20
      [c("HEARTS", "K"), c("CLUBS", "K"), c("DIAMONDS", "K")], // 30
      [c("HEARTS", "A"), c("CLUBS", "A"), c("DIAMONDS", "A")], // 30
      [c("SPADES", "J"), c("HEARTS", "9"), c("CLUBS", "8"), c("DIAMONDS", "7")], // 34 -> total 114 -> cap 80
    ],
    80
  );

  // 5c. 1 Pure Sequence ONLY (no 2nd sequence): Only Pure Seq = 0 pts; Sets & ungrouped count
  assertScoreBoth(
    "1 Pure Sequence only: Pure Seq=0, Sets & ungrouped count",
    [
      [c("SPADES", "A"), c("SPADES", "2"), c("SPADES", "3")], // pure: 0 pts
      [c("HEARTS", "5"), c("CLUBS", "5"), c("DIAMONDS", "5")], // valid set, STILL counts: 15 pts
      [c("HEARTS", "K"), c("CLUBS", "K"), c("DIAMONDS", "K")], // valid set, STILL counts: 30 pts
      [c("CLUBS", "4"), c("DIAMONDS", "6"), pj(), wj("HEARTS", "Q")], // ungrouped: 4 + 6 + 0 + 0 = 10 pts
    ],
    15 + 30 + 10 // = 55 pts
  );

  // 5d. 1 Pure + 1 Impure Sequence + Set + Ungrouped: only ungrouped non-jokers count
  assertScoreBoth(
    "1 Pure + 1 Impure + Set + Ungrouped: only ungrouped non-jokers count",
    [
      [c("HEARTS", "4"), c("HEARTS", "5"), c("HEARTS", "6")], // pure: 0
      [c("SPADES", "8"), pj(), c("SPADES", "10")], // impure: 0
      [c("HEARTS", "Q"), c("CLUBS", "Q"), c("DIAMONDS", "Q")], // set: 0
      [c("CLUBS", "2"), c("DIAMONDS", "7"), wj("SPADES", "A"), c("HEARTS", "K")], // ungrouped: 2 + 7 + 0 + 10 = 19
    ],
    19
  );

  // 5e. 2 Pure Sequences + Set + Ungrouped: only ungrouped non-jokers count
  assertScoreBoth(
    "2 Pure Sequences + Set + Ungrouped: only ungrouped non-jokers count",
    [
      [c("HEARTS", "4"), c("HEARTS", "5"), c("HEARTS", "6")], // pure: 0
      [c("SPADES", "J"), c("SPADES", "Q"), c("SPADES", "K")], // pure: 0
      [c("HEARTS", "9"), c("CLUBS", "9"), c("DIAMONDS", "9")], // set: 0
      [c("CLUBS", "A"), c("DIAMONDS", "3"), pj(), c("HEARTS", "4")], // ungrouped: 10 + 3 + 0 + 4 = 17
    ],
    17
  );

  // 5f. 2 Pure Sequences + Huge Invalid Group -> capped at 80 pts
  assertScoreBoth(
    "Penalty cap at 80 even with 1 Pure Sequence only",
    [
      [c("SPADES", "2"), c("SPADES", "3"), c("SPADES", "4")], // pure: 0
      [c("HEARTS", "K"), c("CLUBS", "K"), c("DIAMONDS", "K")], // 30
      [c("HEARTS", "Q"), c("CLUBS", "Q"), c("DIAMONDS", "Q")], // 30
      [c("HEARTS", "A"), c("CLUBS", "A"), c("DIAMONDS", "A"), c("SPADES", "J")], // 40 -> total 100 -> cap 80
    ],
    80
  );
});

// ===========================================================================
// 6. DROP, TURN, WRONG DECLARATION, & PRINTED JOKER CUT EDGE CASES
// ===========================================================================
test("AUDIT 6a: First Drop (20 pts) vs Middle Drop (40 pts) & Drop Turn Restrictions", () => {
  const game = new Game("audit-drop", "room-audit", "AUD001", { roundCount: 1 });
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.addPlayer("p3", "Charlie", "", 3);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.setPlayerReady("p3", true);
  game.startRound();

  // p1 draws (now in DISCARD phase) -> dropping during DISCARD phase MUST throw
  game.drawCard("p1", "CLOSED");
  assert.throws(
    () => game.drop("p1"),
    /phase|DRAW/i,
    "Cannot drop during DISCARD phase"
  );
  const p1Card = game.getPlayerCards("p1")[0];
  game.discardCard("p1", p1Card.id);

  // p2 has NOT drawn yet -> First Drop = 20 pts
  const p2Drop = game.drop("p2");
  assert.strictEqual(p2Drop.penalty, 20, "First Drop before drawing must be 20 pts");

  // p3 draws & discards
  game.drawCard("p3", "CLOSED");
  const p3Card = game.getPlayerCards("p3")[0];
  game.discardCard("p3", p3Card.id);

  // Back to p1 (DRAW phase, hasDrawn=true) -> Middle Drop = 40 pts
  const p1Drop = game.drop("p1");
  assert.strictEqual(p1Drop.penalty, 40, "Middle Drop after drawing must be 40 pts");
  assert.strictEqual(p1Drop.publicState.roundScores["p2"].points, 20);
  assert.strictEqual(p1Drop.publicState.roundScores["p1"].points, 40);
  assert.strictEqual(p1Drop.publicState.roundScores["p3"].points, 0);
  game.stopTimer();
});

test("AUDIT 6b: Wrong Declaration Penalty (80 pts) enforced on invalid declaration", () => {
  const game = new Game("audit-wrong-decl", "room-audit", "AUD002", { roundCount: 1 });
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);
  game.startRound();

  game.drawCard("p1", "CLOSED");

  // Assign p1 a 14-card hand where the 13 meld cards have 0 pure sequences (2 impure + 2 sets)
  const meldsNoPure = [
    [c("SPADES", "4"), pj(), c("SPADES", "6")],
    [c("HEARTS", "8"), wj("CLUBS", "2"), c("HEARTS", "10"), c("HEARTS", "J")],
    [c("DIAMONDS", "K"), c("CLUBS", "K"), c("SPADES", "K")],
    [c("HEARTS", "9"), c("DIAMONDS", "9"), c("CLUBS", "9")],
  ];
  const finishCard = c("CLUBS", "5");
  game.getPlayer("p1").hand = [...meldsNoPure.flat(), finishCard];

  const result = game.declare("p1", meldsNoPure, finishCard.id);
  assert.strictEqual(result.isValid, false, "Declaration with 0 pure sequences must fail");
  assert.strictEqual(result.publicState.status, "GAME_OVER", "2-player wrong declaration ends round");
  assert.strictEqual(result.publicState.winnerId, "p2", "Opponent wins on wrong declaration");
  assert.strictEqual(result.publicState.roundScores["p1"].points, 80, "Wrong declaration penalty must be 80 pts");
  assert.strictEqual(result.publicState.roundScores["p2"].points, 0);
  game.stopTimer();
});

test("AUDIT 6c: Printed Joker Cut makes Aces of ALL suits Wild Jokers in dealt hands & closed-deck draws", () => {
  // 1. Direct Deck.markWildJokers verification
  const deck = new Deck();
  const cards = deck.getRemainingCards();
  const printedJokerCut = cards.find((card) => card.isPrintedJoker);
  const rest = cards.filter((card) => card.id !== printedJokerCut.id);

  const { cutCard, wildRank } = Deck.markWildJokers(printedJokerCut, rest);
  assert.strictEqual(wildRank, "A", "Printed Joker cut must set wildRank = 'A'");
  assert.strictEqual(cutCard.isPrintedJoker, true);
  assert.strictEqual(cutCard.isWildJoker, false);

  const aces = rest.filter((card) => card.rank === "A");
  assert.strictEqual(aces.length, 8, "2 decks contain 8 Aces (2 per suit)");
  assert.ok(
    aces.every((ace) => ace.isWildJoker === true && ace.isPrintedJoker === false),
    "Every Ace across all 4 suits must be marked isWildJoker = true"
  );
  const nonAces = rest.filter((card) => card.rank !== "A");
  assert.ok(
    nonAces.every((card) => card.isWildJoker === false),
    "No non-Ace card may be marked isWildJoker = true"
  );

  // 2. Game engine integration: force a Printed Joker cut and verify both dealt hands AND closed-deck draws mark Aces as Wild Jokers
  const game = new Game("audit-pj-cut", "room-audit", "AUD003", { roundCount: 1 });
  game.addPlayer("p1", "Alice", "", 1);
  game.addPlayer("p2", "Bob", "", 2);
  game.setPlayerReady("p1", true);
  game.setPlayerReady("p2", true);

  // Stub shuffle so the card drawn for wild joker cut (index after 26 dealt cards from end) is guaranteed Printed Joker
  const origShuffle = Deck.prototype.shuffle;
  Deck.prototype.shuffle = function () {
    const arr = this.getRemainingCards();
    const pjIdx = arr.findIndex((card) => card.isPrintedJoker);
    // deal() pops 26 cards from the end (indices 107..82), then cutCard pops index 81
    const targetCutIndex = arr.length - 27;
    const tmp = arr[targetCutIndex];
    arr[targetCutIndex] = arr[pjIdx];
    arr[pjIdx] = tmp;

    // Also place an Ace at targetCutIndex - 2 so p1 draws an Ace from Closed Deck (index targetCutIndex - 1 is initialDiscard)
    const aceIdx = arr.findIndex((card, i) => card.rank === "A" && i < targetCutIndex - 2);
    if (aceIdx !== -1) {
      const targetDrawIdx = targetCutIndex - 2;
      const tmp2 = arr[targetDrawIdx];
      arr[targetDrawIdx] = arr[aceIdx];
      arr[aceIdx] = tmp2;
    }
  };

  try {
    game.startRound();
  } finally {
    Deck.prototype.shuffle = origShuffle;
  }

  const pub = game.getPublicState();
  assert.strictEqual(pub.wildJoker.isPrintedJoker, true, "Cut card is Printed Joker");
  assert.strictEqual(pub.wildRank, "A", "Public state wildRank must be 'A'");

  // Verify every Ace in both players' dealt hands is marked isWildJoker=true
  for (const pid of ["p1", "p2"]) {
    for (const card of game.getPlayerCards(pid)) {
      if (card.rank === "A") {
        assert.strictEqual(card.isWildJoker, true, `Dealt Ace ${card.id} must be Wild Joker`);
      } else {
        assert.strictEqual(card.isWildJoker, false, `Non-Ace ${card.id} must NOT be Wild Joker`);
      }
    }
  }

  // Draw the positioned Ace from Closed Deck and verify it arrives marked isWildJoker=true
  const { drawnCard } = game.drawCard("p1", "CLOSED");
  assert.strictEqual(drawnCard.rank, "A", "Closed-deck draw returned positioned Ace");
  assert.strictEqual(drawnCard.isWildJoker, true, "Closed-deck drawn Ace must be marked isWildJoker=true");
  assert.strictEqual(Evaluator.getCardPoints(drawnCard), 0, "Wild Ace scores 0 deadwood points");
  assert.strictEqual(ClientEvaluator.getCardPoints(drawnCard), 0, "Client Wild Ace scores 0 deadwood points");
  game.stopTimer();
});

test("AUDIT 6d: Show-Phase Game Integration enforces 0-pure, 1-pure-only, and 2-sequence opponent deadwood scoring", () => {
  // Verify Game.submitMelds -> finalizeShowPhase produces exact Indian Rummy scores
  const game = new Game("audit-show-scoring", "room-audit", "AUD004", { roundCount: 1 });
  game.addPlayer("p1", "Winner", "", 1);
  game.addPlayer("p2", "NoPure", "", 2);
  game.addPlayer("p3", "OnePureOnly", "", 3);
  game.addPlayer("p4", "TwoSeqs", "", 4);
  for (const pid of ["p1", "p2", "p3", "p4"]) {
    game.setPlayerReady(pid, true);
  }
  game.startRound();
  game.drawCard("p1", "CLOSED");

  // p1 valid winning hand
  const p1Melds = [
    [c("HEARTS", "4"), c("HEARTS", "5"), c("HEARTS", "6")],
    [c("SPADES", "8"), pj(), c("SPADES", "10"), c("SPADES", "J")],
    [c("DIAMONDS", "K"), c("CLUBS", "K"), c("SPADES", "K")],
    [c("HEARTS", "3"), c("DIAMONDS", "3"), c("CLUBS", "3")],
  ];
  const p1Finish = c("CLUBS", "9");
  game.getPlayer("p1").hand = [...p1Melds.flat(), p1Finish];

  // p2: 0 pure sequences -> impure (2+0+4=6) + set (3+3+3=9) + ungrouped (5+6+0+0=11) + ungrouped (2+2+3=7) = 33 pts
  const p2Melds = [
    [c("SPADES", "2"), pj(), c("SPADES", "4")],
    [c("HEARTS", "3"), c("CLUBS", "3"), c("DIAMONDS", "3")],
    [c("CLUBS", "5"), c("DIAMONDS", "6"), wj("SPADES", "K"), pj()],
    [c("HEARTS", "2"), c("DIAMONDS", "2"), c("SPADES", "3")],
  ];
  game.getPlayer("p2").hand = p2Melds.flat();

  // p3: 1 pure sequence only -> pure (0) + set (15) + set (30) + ungrouped (4+6+0+0=10) = 55 pts
  const p3Melds = [
    [c("SPADES", "A"), c("SPADES", "2"), c("SPADES", "3")],
    [c("HEARTS", "5"), c("CLUBS", "5"), c("DIAMONDS", "5")],
    [c("HEARTS", "K"), c("CLUBS", "K"), c("DIAMONDS", "K")],
    [c("CLUBS", "4"), c("DIAMONDS", "6"), pj(), wj("HEARTS", "Q")],
  ];
  game.getPlayer("p3").hand = p3Melds.flat();

  // p4: 1 pure + 1 impure + 1 set + ungrouped (2+7+0+10=19) = 19 pts
  const p4Melds = [
    [c("HEARTS", "4"), c("HEARTS", "5"), c("HEARTS", "6")],
    [c("SPADES", "8"), pj(), c("SPADES", "10")],
    [c("HEARTS", "Q"), c("CLUBS", "Q"), c("DIAMONDS", "Q")],
    [c("CLUBS", "2"), c("DIAMONDS", "7"), wj("SPADES", "A"), c("HEARTS", "K")],
  ];
  game.getPlayer("p4").hand = p4Melds.flat();

  const decl = game.declare("p1", p1Melds, p1Finish.id);
  assert.strictEqual(decl.isValid, true);
  assert.strictEqual(decl.publicState.status, "SHOW");

  game.submitMelds("p2", p2Melds);
  game.submitMelds("p3", p3Melds);
  const finalSub = game.submitMelds("p4", p4Melds);

  assert.strictEqual(finalSub.allSubmitted, true);
  assert.strictEqual(finalSub.publicState.status, "GAME_OVER");
  assert.strictEqual(finalSub.publicState.roundScores["p1"].points, 0);
  assert.strictEqual(finalSub.publicState.roundScores["p2"].points, 33);
  assert.strictEqual(finalSub.publicState.roundScores["p3"].points, 55);
  assert.strictEqual(finalSub.publicState.roundScores["p4"].points, 19);
  game.stopTimer();
});

test("AUDIT 6e: Exhaustive Client vs Server Parity (Wild Ace pure/impure, 13-card vs 14-card sequences, malformed joker guard, & discard wild marking)", () => {
  // When Printed Joker is cut, Aces are Wild Jokers:
  // A♠(wild)-2♠-3♠ -> PURE_SEQUENCE (natural suit & consecutive rank)
  assertMeldBoth(
    "Wild Ace in natural Ace-low slot (A♠(wild)-2♠-3♠) is PURE_SEQUENCE",
    [wj("SPADES", "A"), c("SPADES", "2"), c("SPADES", "3")],
    "PURE_SEQUENCE",
    true
  );
  // Q♥-K♥-A♥(wild) -> PURE_SEQUENCE (natural suit & Ace-high consecutive rank)
  assertMeldBoth(
    "Wild Ace in natural Ace-high slot (Q♥-K♥-A♥(wild)) is PURE_SEQUENCE",
    [c("HEARTS", "Q"), c("HEARTS", "K"), wj("HEARTS", "A")],
    "PURE_SEQUENCE",
    true
  );
  // A♣(wild)-2♠-3♠ -> IMPURE_SEQUENCE (substituting outside its natural suit)
  assertMeldBoth(
    "Wild Ace of different suit (A♣(wild)-2♠-3♠) is IMPURE_SEQUENCE",
    [wj("CLUBS", "A"), c("SPADES", "2"), c("SPADES", "3")],
    "IMPURE_SEQUENCE",
    true
  );

  // Full 13-card single-suit pure sequence (A..K) is valid on BOTH server & client
  const full13Spades = [
    c("SPADES", "A"), c("SPADES", "2"), c("SPADES", "3"), c("SPADES", "4"),
    c("SPADES", "5"), c("SPADES", "6"), c("SPADES", "7"), c("SPADES", "8"),
    c("SPADES", "9"), c("SPADES", "10"), c("SPADES", "J"), c("SPADES", "Q"),
    c("SPADES", "K"),
  ];
  assertMeldBoth("13-card pure sequence (A♠..K♠) is PURE_SEQUENCE", full13Spades, "PURE_SEQUENCE", true);

  // 13-card impure sequence (A♠..Q♠ + JKR) is valid on BOTH server & client
  const impure13Spades = [...full13Spades.slice(0, 12), pj()];
  assertMeldBoth("13-card impure sequence (A♠..Q♠ + JKR) is IMPURE_SEQUENCE", impure13Spades, "IMPURE_SEQUENCE", true);

  // Defensive Printed Joker guard: even if isPrintedJoker flag is false on a PRINTED_JOKER card, Pure Sequence rejects it
  const malformedPJ = {
    id: "MALFORMED_PJ",
    suit: "JOKER",
    rank: "PRINTED_JOKER",
    isWildJoker: false,
    isPrintedJoker: false,
  };
  assert.strictEqual(Evaluator.isValidPureSequence([c("SPADES", "4"), malformedPJ, c("SPADES", "6")]), false);
  assert.strictEqual(ClientEvaluator.isValidPureSequence([c("SPADES", "4"), malformedPJ, c("SPADES", "6")]), false);
  assert.strictEqual(Evaluator.getCardPoints(malformedPJ), 0);
  assert.strictEqual(ClientEvaluator.getCardPoints(malformedPJ), 0);

  // Declaration with 13 cards split across 1 valid 13-card sequence only (1 sequence total) MUST be rejected on both
  assertDeclarationBoth("Single 13-card Pure Sequence fails 2-sequence rule", [full13Spades], false);

  // Empty meld group inside declaration MUST be rejected on both
  assertDeclarationBoth(
    "Empty group inside 13-card declaration rejected",
    [
      [c("HEARTS", "4"), c("HEARTS", "5"), c("HEARTS", "6")],
      [c("SPADES", "8"), pj(), c("SPADES", "10"), c("SPADES", "J")],
      [c("DIAMONDS", "K"), c("CLUBS", "K"), c("SPADES", "K")],
      [c("HEARTS", "3"), c("DIAMONDS", "3"), c("CLUBS", "3")],
      [],
    ],
    false
  );
});

