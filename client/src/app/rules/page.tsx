"use client";

import { ArrowLeft, Award, CheckCircle2, Flame, HelpCircle, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import React from "react";

export default function RulesPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950 via-zinc-950 to-black text-white p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 mb-6 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Game Dashboard</span>
        </Link>

        {/* Title */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">♠♥♦♣</span>
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
              Standard Tournament Regulations
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            13-Card Indian Rummy Rules
          </h1>
          <p className="text-sm text-zinc-400 mt-2">
            Indian Rummy is played with 2 standard decks of 52 cards plus printed jokers (108 cards total). Each player is dealt 13 cards.
          </p>
        </div>

        {/* Core Winning Condition */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-amber-500/20 border-2 border-amber-500/40 shadow-xl mb-8">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-base mb-2">
            <Award className="w-5 h-5" />
            <span>Winning Declaration Criteria</span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed mb-4">
            To make a valid declaration, a player must fulfill the following mandatory rules:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block font-bold">1. At Least Two Sequences</strong>
                <span className="text-zinc-400 text-[11px]">
                  You cannot win solely with sets. At least two sequences are strictly mandatory.
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block font-bold">2. Mandatory Pure Sequence</strong>
                <span className="text-zinc-400 text-[11px]">
                  At least one sequence must be pure (no jokers substituted).
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block font-bold">3. Valid Card Arrangements</strong>
                <span className="text-zinc-400 text-[11px]">
                  All remaining cards must be arranged in valid impure sequences or sets.
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block font-bold">4. Final Card Discard</strong>
                <span className="text-zinc-400 text-[11px]">
                  Exactly 1 card is discarded into the declare box, leaving 13 melded cards.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Combinations Breakdown */}
        <div className="space-y-6 mb-8">
          {/* Pure Sequence */}
          <div className="p-5 rounded-2xl bg-zinc-900/70 border border-zinc-800">
            <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>Pure Sequence (Pure Life)</span>
            </h3>
            <p className="text-xs text-zinc-400 mb-3">
              Three or more consecutive cards of the same suit formed without any joker substitute.
            </p>
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-white bg-zinc-950 p-3 rounded-xl border border-zinc-800">
              <span className="text-red-500">5♥</span>
              <span className="text-red-500">6♥</span>
              <span className="text-red-500">7♥</span>
              <span className="text-emerald-400 ml-4 font-sans text-[11px]">✓ Valid Pure Sequence</span>
            </div>
          </div>

          {/* Impure Sequence */}
          <div className="p-5 rounded-2xl bg-zinc-900/70 border border-zinc-800">
            <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-1 flex items-center gap-2">
              <Flame className="w-4 h-4" />
              <span>Impure Sequence</span>
            </h3>
            <p className="text-xs text-zinc-400 mb-3">
              Three or more consecutive cards of the same suit using one or more printed or wild jokers to fill gaps.
            </p>
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-white bg-zinc-950 p-3 rounded-xl border border-zinc-800">
              <span className="text-zinc-300">7♣</span>
              <span className="text-zinc-300">8♣</span>
              <span className="text-amber-400 bg-amber-500/20 px-1 rounded">★ JOKER</span>
              <span className="text-zinc-300">10♣</span>
              <span className="text-blue-400 ml-4 font-sans text-[11px]">✓ Valid Impure Sequence</span>
            </div>
          </div>

          {/* Set */}
          <div className="p-5 rounded-2xl bg-zinc-900/70 border border-zinc-800">
            <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider mb-1 flex items-center gap-2">
              <Award className="w-4 h-4" />
              <span>Set</span>
            </h3>
            <p className="text-xs text-zinc-400 mb-3">
              Three or four cards of the same rank with DIFFERENT suits. Cannot contain duplicate suits.
            </p>
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-white bg-zinc-950 p-3 rounded-xl border border-zinc-800">
              <span className="text-red-500">8♥</span>
              <span className="text-red-400">8♦</span>
              <span className="text-zinc-300">8♠</span>
              <span className="text-purple-400 ml-4 font-sans text-[11px]">✓ Valid Set</span>
            </div>
          </div>
        </div>

        {/* Scoring & Penalty Rules */}
        <div className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 mb-8">
          <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" />
            <span>Card Values & Drop Penalties</span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mb-6">
            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
              <div className="text-base font-bold text-amber-400">10 Points</div>
              <span className="text-[11px] text-zinc-400">Ace, King, Queen, Jack</span>
            </div>
            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
              <div className="text-base font-bold text-amber-400">Face Value</div>
              <span className="text-[11px] text-zinc-400">Cards 2 through 10</span>
            </div>
            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
              <div className="text-base font-bold text-emerald-400">0 Points</div>
              <span className="text-[11px] text-zinc-400">Printed & Wild Jokers</span>
            </div>
            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
              <div className="text-base font-bold text-red-400">80 Points</div>
              <span className="text-[11px] text-zinc-400">Maximum Penalty Cap</span>
            </div>
          </div>

          <div className="space-y-2 text-xs text-zinc-300">
            <div className="flex justify-between py-1.5 border-b border-zinc-800">
              <span>First Drop (Leaving before picking any card)</span>
              <strong className="text-red-400 font-mono">20 Points</strong>
            </div>
            <div className="flex justify-between py-1.5 border-b border-zinc-800">
              <span>Middle Drop (Leaving in subsequent turns)</span>
              <strong className="text-red-400 font-mono">40 Points</strong>
            </div>
            <div className="flex justify-between py-1.5 border-b border-zinc-800">
              <span>Wrong Declaration Penalty</span>
              <strong className="text-red-400 font-mono">80 Points</strong>
            </div>
            <div className="flex justify-between py-1.5">
              <span>Winner Score</span>
              <strong className="text-emerald-400 font-mono">0 Points</strong>
            </div>
          </div>
        </div>

        {/* Start Playing CTA */}
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-zinc-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 hover:scale-105 transition"
          >
            <span>Play Now</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
