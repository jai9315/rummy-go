"use client";

import { usePathname } from "next/navigation";
import React, { useEffect } from "react";
import { useSocket } from "../../hooks/useSocket";
import { useAuthStore } from "../../store/useAuthStore";
import { useFriendsStore } from "../../store/useFriendsStore";
import { RoomInviteToast } from "./RoomInviteToast";

/**
 * Global social/presence wrapper mounted in RootLayout:
 * - Maintains a single passive Socket.IO presence connection on non-room pages
 *   (Home, Profile, Rules) while /room/[code] owns its room-scoped socket.
 * - Keeps useFriendsStore hydrated whenever authenticated.
 * - Renders the global floating RoomInviteToast across every route.
 */
export const GlobalSocialShell: React.FC = () => {
  const pathname = usePathname() || "";
  const isRoomRoute = pathname.startsWith("/room/");
  const { isAuthenticated, initAuth } = useAuthStore();
  const fetchFriends = useFriendsStore((s) => s.fetchFriends);
  const resetFriends = useFriendsStore((s) => s.reset);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    if (isAuthenticated) {
      void fetchFriends();
    } else {
      resetFriends();
    }
  }, [isAuthenticated, fetchFriends, resetFriends]);

  // Passive presence + invite socket when NOT on /room/[code]
  useSocket(undefined, {
    autoJoin: false,
    enabled: isAuthenticated && !isRoomRoute,
  });

  return <RoomInviteToast />;
};
