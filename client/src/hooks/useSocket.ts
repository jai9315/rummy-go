import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "../store/useAuthStore";
import { useGameStore } from "../store/useGameStore";
import { Card } from "../types";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";

export function useSocket(roomCode?: string) {
  const socketRef = useRef<Socket | null>(null);
  const token = useAuthStore((s) => s.token);
  const { setGameState, setPrivateHand, setLobbyPlayers, setError } = useGameStore();

  useEffect(() => {
    if (!token) return;

    const socket = io(SERVER_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      if (roomCode) {
        socket.emit("JOIN_ROOM", { roomCode: roomCode.toUpperCase() });
      }
    });

    socket.on("GAME_STATE_UPDATE", (state) => {
      setGameState(state);
    });

    socket.on("PRIVATE_HAND_UPDATE", (data: { cards: Card[] }) => {
      setPrivateHand(data.cards);
    });

    socket.on("ROOM_PLAYERS_UPDATE", (data) => {
      setLobbyPlayers(data.players);
    });

    socket.on("ERROR", (err: { message: string }) => {
      setError(err.message);
      setTimeout(() => setError(null), 4000);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, roomCode, setGameState, setPrivateHand, setLobbyPlayers, setError]);

  const toggleReady = () => {
    socketRef.current?.emit("TOGGLE_READY");
  };

  const startGame = () => {
    socketRef.current?.emit("START_GAME");
  };

  const drawCard = (source: "CLOSED" | "DISCARD") => {
    socketRef.current?.emit("DRAW_CARD", { source });
  };

  const discardCard = (cardId: string) => {
    socketRef.current?.emit("DISCARD_CARD", { cardId });
  };

  const declareGame = (melds: Card[][], declareCardId: string) => {
    socketRef.current?.emit("DECLARE", { melds, declareCardId });
  };

  const dropGame = () => {
    socketRef.current?.emit("DROP");
  };

  const sortHand = (by: "SUIT" | "RANK") => {
    socketRef.current?.emit("SORT_HAND", { by });
  };

  return {
    socket: socketRef.current,
    toggleReady,
    startGame,
    drawCard,
    discardCard,
    declareGame,
    dropGame,
    sortHand,
  };
}
