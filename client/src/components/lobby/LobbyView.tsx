"use client";

import {
  AlertCircle,
  Check,
  Copy,
  Lock,
  LogOut,
  Play,
  QrCode,
  Send,
  Share2,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import Image from "next/image";
import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/useAuthStore";
import { useGameStore } from "../../store/useGameStore";
import { FriendItem, RoomInfo } from "../../types";

interface LobbyViewProps {
  roomCode: string;
  roomData: RoomInfo | null;
  roomError?: string | null;
  onToggleReady: () => void;
  onStartGame: () => void;
  onKickPlayer: (targetUserId: string) => void;
  onInviteFriend: (friendId: string, roomCode: string) => void;
  onLeaveRoom: () => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  roomCode,
  roomData,
  roomError,
  onToggleReady,
  onStartGame,
  onKickPlayer,
  onInviteFriend,
  onLeaveRoom,
}) => {
  const user = useAuthStore((s) => s.user);
  const lobbyPlayers = useGameStore((s) => s.lobbyPlayers);
  const socketError = useGameStore((s) => s.error);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showInviteFriends, setShowInviteFriends] = useState(false);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [invitedFriendIds, setInvitedFriendIds] = useState<Record<string, boolean>>({});

  const loadFriends = useCallback(() => {
    setLoadingFriends(true);
    api
      .getFriends()
      .then((res) => setFriends(res.friends ?? []))
      .catch(() => {})
      .finally(() => setLoadingFriends(false));
  }, []);

  useEffect(() => {
    if (showInviteFriends) {
      loadFriends();
    }
  }, [showInviteFriends, loadFriends]);

  const handleSendInvite = (friendId: string) => {
    onInviteFriend(friendId, roomCode);
    setInvitedFriendIds((prev) => ({ ...prev, [friendId]: true }));
    setTimeout(() => {
      setInvitedFriendIds((prev) => {
        const next = { ...prev };
        delete next[friendId];
        return next;
      });
    }, 5000);
  };

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${roomCode}`
      : `http://localhost:3000/room/${roomCode}`;

  const currentPlayer = lobbyPlayers.find((p) => p.userId === user?.id);
  const isHost = Boolean(currentPlayer?.isHost);
  const canStart =
    isHost &&
    lobbyPlayers.length >= 2 &&
    lobbyPlayers.every((p) => p.isReady);

  const displayedError = roomError || socketError;

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
      {/* Visible Error Banner for both roomError and socket/gameStore error */}
      {displayedError && (
        <div
          role="alert"
          className="w-full mb-5 p-3.5 rounded-2xl bg-red-600/20 border border-red-500/50 text-red-200 text-xs font-semibold flex items-center justify-center gap-2 shadow-lg"
        >
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{displayedError}</span>
        </div>
      )}

      {/* Lobby Header */}
      <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900/80 backdrop-blur-md border border-amber-500/30 shadow-2xl mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Private Table Lobby
            </span>
            <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
              Points Rummy
            </span>
            {roomData?.hasPassword && (
              <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Protected</span>
              </span>
            )}
          </div>
          <h1 className="text-2xl font-black text-white tracking-wide">
            {roomData?.roomName || `${roomCode} Rummy Table`}
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            13 Cards Indian Rummy • {roomData?.roundCount || 1}{" "}
            {(roomData?.roundCount || 1) === 1 ? "Round" : "Rounds"} •{" "}
            {roomData?.turnTimeLimitSeconds ?? 30}s Turn •{" "}
            {roomData?.entryPoints ?? 80} pts • 2-{roomData?.maxPlayers || 6} Players
          </p>
        </div>

        {/* Room Code & Invite Quick Pill */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
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
              {copiedCode ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowInviteFriends((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition ${
              showInviteFriends
                ? "bg-amber-500 text-zinc-950 border-amber-400 shadow"
                : "bg-zinc-800 hover:bg-zinc-700 text-amber-300 border-amber-500/40"
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite Friends</span>
          </button>

          <button
            onClick={() => copyToClipboard(inviteUrl, "link")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition"
          >
            {copiedLink ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Share2 className="w-4 h-4 text-amber-400" />
            )}
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

          <button
            onClick={onLeaveRoom}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-red-950 text-xs font-semibold text-zinc-300 hover:text-red-300 border border-zinc-700 hover:border-red-500/40 transition"
            title="Leave Room"
          >
            <LogOut className="w-4 h-4" />
            <span>Leave</span>
          </button>
        </div>
      </div>

      {/* Invite Online Friends Picker */}
      {showInviteFriends && (
        <div className="w-full mb-6 p-4 rounded-2xl bg-zinc-900/90 border border-amber-500/40 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                Invite Online Friends
              </h3>
              <p className="text-[11px] text-zinc-400">
                Send an instant in-app invite straight to your online friends.
              </p>
            </div>
            <button
              type="button"
              onClick={loadFriends}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-200 border border-zinc-700 transition"
            >
              {loadingFriends ? "Loading..." : "Refresh"}
            </button>
          </div>

          {friends.length === 0 ? (
            <p className="text-xs text-zinc-500 py-3 text-center">
              No friends yet. Add friends from your Profile page or share the room code above!
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
              {[...friends]
                .sort((a, b) => Number(b.isOnline) - Number(a.isOnline))
                .map((f) => {
                  const friendUser = f.friendUser;
                  if (!friendUser) return null;
                  const alreadyInRoom = lobbyPlayers.some(
                    (p) => p.userId === friendUser.id
                  );
                  const alreadyInvited = Boolean(invitedFriendIds[friendUser.id]);

                  return (
                    <div
                      key={f.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-zinc-800"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            f.isOnline
                              ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                              : "bg-zinc-600"
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {friendUser.username}
                          </div>
                          <span
                            className={`text-[10px] ${
                              f.isOnline ? "text-emerald-400" : "text-zinc-500"
                            }`}
                          >
                            {alreadyInRoom
                              ? "Already at table"
                              : f.isOnline
                              ? "Online"
                              : "Offline"}
                          </span>
                        </div>
                      </div>

                      {alreadyInRoom ? (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                          Seated
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={!f.isOnline || alreadyInvited}
                          onClick={() => handleSendInvite(friendUser.id)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
                            alreadyInvited
                              ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40"
                              : f.isOnline
                              ? "bg-amber-500 hover:bg-amber-400 text-zinc-950"
                              : "bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed"
                          }`}
                        >
                          {alreadyInvited ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Invited</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3 h-3" />
                              <span>Invite</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

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
            <span>
              Seats ({lobbyPlayers.length} / {roomData?.maxPlayers || 6})
            </span>
          </span>
        </div>

        {/* Seats Grid */}
        <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6 my-auto">
          {Array.from({ length: roomData?.maxPlayers || 6 }).map((_, idx) => {
            const seatNum = idx + 1;
            const player = lobbyPlayers.find((p) => p.seatNumber === seatNum);
            const canKick = isHost && player && player.userId !== user?.id;

            return (
              <div
                key={seatNum}
                className={`relative flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${
                  player
                    ? "bg-zinc-950/80 border-amber-500/50 shadow-xl"
                    : "bg-emerald-950/40 border-dashed border-emerald-700/40"
                }`}
              >
                {player ? (
                  <>
                    {canKick && (
                      <button
                        type="button"
                        onClick={() => onKickPlayer(player.userId)}
                        className="absolute top-2 right-2 p-1 rounded-lg bg-zinc-900 hover:bg-red-950 text-zinc-400 hover:text-red-400 border border-zinc-800 hover:border-red-500/40 transition"
                        title={`Kick ${player.username}`}
                        aria-label={`Kick ${player.username}`}
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-amber-400 shadow-md mb-2">
                      <Image
                        src={
                          player.profileImage ||
                          `https://api.dicebear.com/7.x/bottts/svg?seed=${player.username}`
                        }
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
            disabled={!currentPlayer}
            className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 ${
              !currentPlayer
                ? "bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed"
                : currentPlayer.isReady
                ? "bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-emerald-500/40"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30"
            }`}
          >
            <Check className="w-4 h-4" />
            <span>
              {currentPlayer?.isReady ? "Ready (Click to unready)" : "Mark Ready"}
            </span>
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
