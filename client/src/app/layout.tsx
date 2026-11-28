import type { Metadata } from "next";
import { GlobalSocialShell } from "../components/friends/GlobalSocialShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Indian Rummy Live | Real-Time Multiplayer with Video Calling",
  description:
    "Play 13-card Indian Rummy in private tables with friends featuring live WebRTC video calling and strict private card security.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-white min-h-[100dvh] antialiased">
        <GlobalSocialShell />
        {children}
      </body>
    </html>
  );
}
