import { useCallback, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { getSocketServerUrl } from "../lib/serverUrl";
import { soundEffects } from "../lib/soundEffects";
import { useAuthStore } from "../store/useAuthStore";
import { useGameStore } from "../store/useGameStore";
import {
  Card,
  LobbyPlayer,
  PublicGameState,
  RoomInvite,
  TableChatMessage,
  TableReaction,
} from "../types";

export interface UseSocketOptions {
  autoJoin?: boolean;
  password?: string;
}

export function useSocket(roomCode?: string, options?: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoJoin = options?.autoJoin ?? true;
  const autoJoinRef = useRef<boolean>(autoJoin);
  const passwordRef = useRef<string | undefined>(options?.password);
  const joinedRoomRef = useRef<string | null>(null);

  autoJoinRef.current = autoJoin;
  if (options?.password !== undefined) {
    passwordRef.current = options.password;
  }

  const token = useAuthStore((s) => s.token);
  const {
    setGameState,
    setPrivateHand,
    setLobbyPlayers,
    setError,
    setKickedMessage,
    setPendingInvite,
    addChatMessage,
    clearChatBubble,
    addReaction,
    removeReaction,
    returnToLobby: resetToLobbyStore,
  } = useGameStore();

  useEffect(() => {
    if (!token) return;

    const socket = io(getSocketServerUrl(), {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;
    joinedRoomRef.current = null;

    socket.on("connect", () => {
      if (roomCode && autoJoinRef.current) {
        const normalized = roomCode.toUpperCase();
        joinedRoomRef.current = normalized;
        socket.emit("JOIN_ROOM", {
          roomCode: normalized,
          password: passwordRef.current,
        });
      }
    });

    socket.on("GAME_STATE_UPDATE", (state: PublicGameState) => {
      setGameState(state);
    });

    socket.on(
      "PRIVATE_HAND_UPDATE",
      (data: { cards: Card[]; sortedBy?: "SUIT" | "RANK" }) => {
        setPrivateHand(data.cards, { applyOrder: Boolean(data.sortedBy) });
      }
    );

    socket.on("ROOM_PLAYERS_UPDATE", (data: { players: LobbyPlayer[] }) => {
      setLobbyPlayers(data.players);
    });

    socket.on("RETURNED_TO_LOBBY", () => {
      resetToLobbyStore();
    });

    socket.on("KICKED", (data: { message?: string }) => {
      const msg = data?.message || "You were kicked from the room by the host";
      setKickedMessage(msg);
      setError(msg);
      setLobbyPlayers([]);
      resetToLobbyStore();
    });

    socket.on("ROOM_INVITE_RECEIVED", (invite: RoomInvite) => {
      setPendingInvite({
        roomCode: invite.roomCode,
        roomName: invite.roomName,
        fromUsername: invite.fromUsername,
        fromUserId: invite.fromUserId,
        timestamp: invite.timestamp ?? Date.now(),
      });
      soundEffects.playInviteChime(useGameStore.getState().isMuted);
    });

    socket.on("CHAT_MESSAGE", (msg: TableChatMessage) => {
      addChatMessage(msg);
      setTimeout(() => {
        clearChatBubble(msg.playerId, msg.id);
      }, 4500);
    });

    socket.on("SEND_REACTION", (reaction: TableReaction) => {
      addReaction(reaction);
      setTimeout(() => {
        removeReaction(reaction.id);
      }, 2300);
    });

    socket.on("ERROR", (err: { message: string }) => {
      setError(err.message);
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
      errorTimerRef.current = setTimeout(() => {
        setError(null);
      }, 6000);
    });

    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
      socket.disconnect();
      socketRef.current = null;
      joinedRoomRef.current = null;
    };
  }, [
    token,
    roomCode,
    setGameState,
    setPrivateHand,
    setLobbyPlayers,
    setError,
    setKickedMessage,
    setPendingInvite,
    addChatMessage,
    clearChatBubble,
    addReaction,
    removeReaction,
    resetToLobbyStore,
  ]);

  // If autoJoin flips from false -> true after socket already connected (e.g. room metadata loaded), emit JOIN_ROOM
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected || !roomCode || !autoJoin) return;
    const normalized = roomCode.toUpperCase();
    if (joinedRoomRef.current !== normalized) {
      joinedRoomRef.current = normalized;
      socket.emit("JOIN_ROOM", {
        roomCode: normalized,
        password: passwordRef.current,
      });
    }
  }, [roomCode, autoJoin]);

  const joinRoom = useCallback(
    (password?: string) => {
      if (!roomCode) return;
      if (password !== undefined) {
        passwordRef.current = password;
      }
      const socket = socketRef.current;
      if (socket && socket.connected) {
        const normalized = roomCode.toUpperCase();
        joinedRoomRef.current = normalized;
        socket.emit("JOIN_ROOM", {
          roomCode: normalized,
          password: passwordRef.current,
        });
      }
    },
    [roomCode]
  );

  const leaveRoom = useCallback(() => {
    joinedRoomRef.current = null;
    socketRef.current?.emit("LEAVE_ROOM");
  }, []);

  const kickPlayer = useCallback((targetUserId: string) => {
    socketRef.current?.emit("KICK_PLAYER", { targetUserId });
  }, []);

  const toggleReady = useCallback(() => {
    socketRef.current?.emit("TOGGLE_READY");
  }, []);

  const startGame = useCallback(() => {
    socketRef.current?.emit("START_GAME");
  }, []);

  const nextRound = useCallback(() => {
    socketRef.current?.emit("NEXT_ROUND");
  }, []);

  const restartMatch = useCallback(() => {
    socketRef.current?.emit("RESTART_MATCH");
  }, []);

  const returnToLobby = useCallback(() => {
    socketRef.current?.emit("RETURN_TO_LOBBY");
    useGameStore.getState().returnToLobby();
  }, []);

  const drawCard = useCallback((source: "CLOSED" | "DISCARD") => {
    socketRef.current?.emit("DRAW_CARD", { source });
  }, []);

  const discardCard = useCallback((cardId: string) => {
    socketRef.current?.emit("DISCARD_CARD", { cardId });
    useGameStore.getState().clearSelection();
  }, []);

  const declareGame = useCallback((melds: Card[][], declareCardId: string) => {
    socketRef.current?.emit("DECLARE", { melds, declareCardId });
  }, []);

  const submitMelds = useCallback((melds: Card[][]) => {
    socketRef.current?.emit("SUBMIT_MELDS", { melds });
  }, []);

  const dropGame = useCallback(() => {
    socketRef.current?.emit("DROP");
  }, []);

  const sortHand = useCallback((by: "SUIT" | "RANK") => {
    socketRef.current?.emit("SORT_HAND", { by });
  }, []);

  const inviteFriend = useCallback((friendId: string, targetRoomCode: string) => {
    socketRef.current?.emit("INVITE_FRIEND", {
      friendId,
      roomCode: targetRoomCode,
    });
  }, []);

  const sendChatMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    socketRef.current?.emit("CHAT_MESSAGE", { text: trimmed });
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    if (!emoji) return;
    socketRef.current?.emit("SEND_REACTION", { emoji });
  }, []);

  return {
    socket: socketRef.current,
    joinRoom,
    leaveRoom,
    kickPlayer,
    toggleReady,
    startGame,
    nextRound,
    restartMatch,
    returnToLobby,
    drawCard,
    discardCard,
    declareGame,
    submitMelds,
    dropGame,
    sortHand,
    inviteFriend,
    sendChatMessage,
    sendReaction,
  };
}
