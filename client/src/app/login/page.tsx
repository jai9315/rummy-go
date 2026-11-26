"use client";

import { ArrowRight, Sparkles, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { Suspense, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  const { setUserSession } = useAuthStore();
  const [tab, setTab] = useState<"login" | "register" | "guest">("guest");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.guestLogin({ displayName });
      setUserSession(res.user, res.token);
      router.push(redirect);
    } catch (err: any) {
      setError(err.message || "Guest login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login({ login: username, password });
      setUserSession(res.user, res.token);
      router.push(redirect);
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.register({ username, email, password });
      setUserSession(res.user, res.token);
      router.push(redirect);
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-3xl bg-zinc-900/80 backdrop-blur-xl border border-amber-500/30 shadow-2xl p-6 sm:p-8">
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">♠</span>
          <span className="text-2xl text-red-500">♥</span>
          <span className="text-2xl text-red-500">♦</span>
          <span className="text-2xl">♣</span>
        </div>
        <h1 className="text-2xl font-black text-white tracking-wide">INDIAN RUMMY LIVE</h1>
        <p className="text-xs text-zinc-400 mt-1">
          Real-time multiplayer with private cards & video calling
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1 rounded-xl mb-6 border border-zinc-800">
        <button
          onClick={() => { setTab("guest"); setError(null); }}
          className={`py-2 rounded-lg text-xs font-bold transition ${
            tab === "guest"
              ? "bg-amber-500 text-zinc-950 shadow"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Guest (Quick)
        </button>
        <button
          onClick={() => { setTab("login"); setError(null); }}
          className={`py-2 rounded-lg text-xs font-bold transition ${
            tab === "login"
              ? "bg-amber-500 text-zinc-950 shadow"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Log In
        </button>
        <button
          onClick={() => { setTab("register"); setError(null); }}
          className={`py-2 rounded-lg text-xs font-bold transition ${
            tab === "register"
              ? "bg-amber-500 text-zinc-950 shadow"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Sign Up
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-600/20 border border-red-500/50 text-red-300 text-xs font-semibold text-center">
          {error}
        </div>
      )}

      {/* Tab 1: Guest Play */}
      {tab === "guest" && (
        <form onSubmit={handleGuestSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
              Display Name (Optional)
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. CardMaster"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={15}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400"
              />
              <UserIcon className="w-4 h-4 text-zinc-500 absolute right-3.5 top-3" />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              Enter as guest to play immediately without an email or password.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 text-zinc-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>{loading ? "Joining..." : "Play Now as Guest"}</span>
          </button>
        </form>
      )}

      {/* Tab 2: Login */}
      {tab === "login" && (
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
              Username or Email
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
          >
            <span>{loading ? "Logging In..." : "Log In"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* Tab 3: Register */}
      {tab === "register" && (
        <form onSubmit={handleRegisterSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <input
              type="text"
              required
              minLength={3}
              maxLength={20}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
              Password (min 6 characters)
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
          >
            <span>{loading ? "Creating Account..." : "Create Account"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      )}

      <div className="mt-6 text-center">
        <Link href="/rules" className="text-xs text-amber-400/80 hover:text-amber-300 underline">
          Learn 13-Card Indian Rummy Rules & Scoring
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950 via-zinc-950 to-black">
      <Suspense fallback={<div className="text-amber-400 font-bold">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
