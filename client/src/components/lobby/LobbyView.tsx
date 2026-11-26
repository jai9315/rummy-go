"use client";

import { Check, Copy, Play, QrCode, Share2, Users } from "lucide-react";
import Image from "next/image";
import React, { useState } from "react";
import { useAuthStore } from "../../store/useAuthStore";
import { useGameStore } from "../../store/useGameStore";

interface LobbyViewProps {
  roomCode: string;
  roomData: any;
  onToggleReady: () => void;
  onStartGame: () => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  roomCode,
  roomData,
  onToggleReady,
  onStartGame,
}) => {
  const user = useAuthStore((s) => s.user);
  const lobbyPlayers = useGameStore((s) => s.lobbyPlayers);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${roomCode}`
      : `http://localhost:3000/room/${roomCode}`;

  const currentPlayer = lobbyPlayers.find((p) => p.userId === user?.id);
  const isHost = currentPlayer?.isHost;
  const canStart =
    isHost &&
    lobbyPlayers.length >= 2 &&
    lobbyPlayers.every((p) => p.isReady);

  const copyToClipboard = (text: string, type: "link" | "code") => {
    navigator.clipboard.writeText(text);
    if (type === "link") {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(
      `Join my Indian Rummy table with live video call! Room Code: ${roomCode}\nLink: ${inviteUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center p-4 sm:p-8">
      {/* Lobby Header */}
      <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900/80 backdrop-blur-md border border-amber-500/30 shadow-2xl mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Private Table Lobby
            </span>
            <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
              Points Rummy
            </span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-wide">
            {roomData?.roomName || `${roomCode} Rummy Table`}
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            13 Cards Indian Rummy • 80 Points Cap • 2-6 Players
          </p>
        </div>

        {/* Room Code & Invite Quick Pill */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
            <span className="text-xs text-zinc-400 font-medium">Code:</span>
            <strong className="text-amber-400 font-mono tracking-widest text-sm font-black">
              {roomCode}
            </strong>
            <button
              onClick={() => copyToClipboard(roomCode, "code")}
              className="text-zinc-400 hover:text-white transition p-1"
              title="Copy Room Code"
            >
              {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <button
            onClick={() => copyToClipboard(inviteUrl, "link")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-amber-400" />}
            <span>{copiedLink ? "Copied" : "Copy Link"}</span>
          </button>

          <button
            onClick={shareWhatsApp}
            className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-md shadow-emerald-600/20"
            title="Share on WhatsApp"
          >
            <Share2 className="w-4 h-4" />
          </button>

          {roomData?.qrCode && (
            <button
              onClick={() => setShowQR(!showQR)}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-zinc-700 transition"
              title="Scan QR Code"
            >
              <QrCode className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* QR Code Modal Overlay */}
      {showQR && roomData?.qrCode && (
        <div className="mb-6 p-4 rounded-2xl bg-zinc-950 border border-amber-500/40 flex flex-col items-center">
          <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-2">
            Scan to Join on Mobile
          </h3>
          <div className="p-3 bg-white rounded-xl shadow-lg">
            <img src={roomData.qrCode} alt="Room QR Code" className="w-44 h-44" />
          </div>
          <button
            onClick={() => setShowQR(false)}
            className="text-xs text-zinc-400 hover:text-white mt-3 underline"
          >
            Hide QR Code
          </button>
        </div>
      )}

      {/* 6-Seat Virtual Lobby Table */}
      <div className="w-full relative min-h-[360px] rounded-3xl bg-felt-pattern border-4 border-amber-600/40 shadow-2xl p-6 flex flex-col items-center justify-between">
        <div className="text-center mb-4">
          <span className="text-xs font-bold text-emerald-300/80 uppercase tracking-widest flex items-center justify-center gap-1.5">
            <Users className="w-4 h-4 text-amber-400" />
            <span>Seats ({lobbyPlayers.length} / {roomData?.maxPlayers || 6})</span>
          </span>
        </div>

        {/* Seats Grid */}
        <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6 my-auto">
          {Array.from({ length: roomData?.maxPlayers || 6 }).map((_, idx) => {
            const seatNum = idx + 1;
            const player = lobbyPlayers.find((p) => p.seatNumber === seatNum);

            return (
              <div
                key={seatNum}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${
                  player
                    ? "bg-zinc-950/80 border-amber-500/50 shadow-xl"
                    : "bg-emerald-950/40 border-dashed border-emerald-700/40"
                }`}
              >
                {player ? (
                  <>
                    <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-amber-400 shadow-md mb-2">
                      <Image
                        src={player.profileImage || `https://api.dicebear.com/7.x/bottts/svg?seed=${player.username}`}
                        alt={player.username}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-white truncate max-w-[100px]">
                        {player.username}
                      </span>
                      {player.isHost && (
                        <span className="bg-amber-500 text-zinc-950 text-[9px] font-black px-1 rounded">
                          HOST
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-bold mt-1.5 px-2 py-0.5 rounded-full ${
                        player.isReady
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                      }`}
                    >
                      {player.isReady ? "Ready ✓" : "Waiting"}
                    </span>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-4 text-emerald-300/40">
                    <span className="text-xs font-semibold">Seat {seatNum}</span>
                    <span className="text-[10px]">Empty</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Lobby Action Controls */}
        <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-3 mt-6 pt-4 border-t border-emerald-800/40">
          {/* Player Toggle Ready */}
          <button
            onClick={onToggleReady}
            className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 ${
              currentPlayer?.isReady
                ? "bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-emerald-500/40"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30"
            }`}
          >
            <Check className="w-4 h-4" />
            <span>{currentPlayer?.isReady ? "Ready (Click to unready)" : "Mark Ready"}</span>
          </button>

          {/* Host Start Game Button */}
          {isHost && (
            <button
              onClick={onStartGame}
              disabled={!canStart}
              className={`w-full sm:w-auto px-8 py-2.5 rounded-xl font-extrabold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 ${
                canStart
                  ? "bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 text-zinc-950 shadow-xl shadow-amber-500/30 animate-pulse"
                  : "bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed"
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Game</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
