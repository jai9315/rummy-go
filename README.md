# Indian Rummy Live — Real-Time Multiplayer Rummy & Video Conferencing

A full-stack, real-time multiplayer 13-card Indian Rummy web application built with **Node.js 22 (`node:sqlite`)**, **Express + Socket.IO**, **LiveKit WebRTC**, and **Next.js 16 (App Router)**.

---

## Key Features

- **Server-Authoritative Card Privacy & Rules Engine**
  - All deck shuffling (`crypto.randomInt` Fisher-Yates), dealing, turn validation, meld verification, and scoring run strictly on the server.
  - Public `GAME_STATE_UPDATE` broadcasts expose only `cardCount` per player and never leak private hand IDs or card faces.
  - Private hands are sent exclusively to each player's authenticated Socket.IO connection via `PRIVATE_HAND_UPDATE`.
  - Complete 13-card Indian Points Rummy rules: 2 decks (108 cards including 4 printed jokers), wild joker cut (including Printed Joker cut -> Ace wild rank), Pure/Impure Sequence and Set validation, Opponent **Show/Meld** submission phase with deadwood scoring (capped at 80 pts), multi-round cumulative scoring & final rankings, per-player First Drop (20 pts) / Middle Drop (40 pts), and server-authoritative turn/show timers with auto-timeout handling.
- **Private Tables, Live Presence & In-App Invites**
  - 6-character room codes, shareable invite links, QR codes, optional room passwords (`bcrypt`), configurable player limit (2–6), round count, turn timer (`15–120s`), and entry points.
  - Host controls (`KICK_PLAYER`, `LEAVE_ROOM` with automatic host transfer, `NEXT_ROUND`, `RETURN_TO_LOBBY`) and instant guest play.
  - Multi-tab Socket.IO online/offline presence surfaced in `/api/friends`, profile editing (`PATCH /api/auth/me`), and real-time in-app friend invitations (`INVITE_FRIEND` -> `ROOM_INVITE_RECEIVED` toast).
- **LiveKit WebRTC Video & Audio**
  - Server-side LiveKit JWT minting restricted to active room members.
  - Perimeter video tiles with compact fanned opponent card-backs, mute/camera toggles, active speaker highlights, and graceful audio-only / avatar fallback when media devices or LiveKit are unavailable.
- **Interactive Card Table UI**
  - Desktop HTML5 & mobile touch drag-and-drop card reordering within and across meld groups, Framer Motion transitions, `canvas-confetti` win celebrations, and Web Audio API sound cues with mute toggle.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Runtime & Database** | Node.js 22+ with built-in `node:sqlite` (`DatabaseSync`, foreign keys enforced, tables auto-initialized on boot) |
| **Backend** | Express 4, Socket.IO 4, TypeScript 5, JWT (`jsonwebtoken`), `bcryptjs` |
| **Video / Audio** | LiveKit (`livekit-server-sdk`, `livekit-client`, `@livekit/components-react`) |
| **Frontend** | Next.js 16 (App Router), React 18, TypeScript 5, Tailwind CSS 3, Framer Motion, Zustand, `canvas-confetti` |
| **Testing & CI** | Node built-in test runner (`node --test`), GitHub Actions (Node 22) |
| **Deployment** | Docker (Node 22 Alpine) & Docker Compose |

---

## Project Structure

```text
.
├── client/                          # Next.js 16 App Router frontend
│   ├── next.config.mjs              # Remote image patterns (DiceBear SVG) & env
│   └── src/
│       ├── app/                     # /, /login, /profile, /rules, /room/[code]
│       ├── components/
│       │   ├── game/                # Card, CardHand, MeldGroup, DeckPiles, DeclareModal, Table
│       │   ├── lobby/               # LobbyView, InviteToast
│       │   └── video/               # VideoOverlay, VideoTile, VideoErrorBoundary
│       ├── hooks/                   # useSocket
│       ├── lib/                     # api.ts, clientEvaluator.ts, soundEffects.ts
│       ├── store/                   # useAuthStore, useGameStore, useVideoStore
│       └── types/                   # Shared client TypeScript types
├── server/                          # Express + Socket.IO backend
│   ├── src/
│   │   ├── config.ts                # Strict env validation & typed config
│   │   ├── db/prisma.ts             # Strictly-typed node:sqlite data access layer
│   │   ├── engine/                  # Deck.ts, Evaluator.ts, Game.ts, types.ts
│   │   ├── routes/                  # auth.ts, rooms.ts, friends.ts, livekit.ts
│   │   ├── socket/                  # authMiddleware.ts, roomManager.ts
│   │   └── index.ts                 # HTTP + Socket.IO entrypoint
│   └── tests/
│       ├── engine.test.cjs          # Game engine unit tests
│       ├── privacy_multiplayer.test.cjs # Real RoomManager + Socket.IO privacy & anti-cheat tests
│       ├── phase1_security.test.cjs # Auth, DB, CORS, LiveKit authz & socket guard tests
│       ├── dbErrors.test.cjs        # DB write-failure resilience tests
│       ├── phase3_e2e.test.cjs      # Full HTTP + Socket.IO E2E multiplayer suite
│       └── run_e2e.cjs              # Self-contained E2E server runner
├── prisma/schema.prisma             # Reference schema matching node:sqlite tables
├── .github/workflows/ci.yml         # Node 22 CI workflow
├── Dockerfile.server
├── Dockerfile.client
├── docker-compose.yml
└── .env.example
```

---

## Prerequisites & Local Setup

1. **Node.js 22+** is required (for built-in `node:sqlite`).
2. **Install dependencies:**
   ```bash
   npm ci
   ```
3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set real values for the required secrets before starting the server. No external database server or Prisma client generation step is required—SQLite tables are created automatically on startup.

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `4000` | Backend Express / Socket.IO port |
| `NODE_ENV` | No | `development` | Runtime mode (`development`, `production`, `test`) |
| `DATABASE_URL` | No | `./prisma/dev.db` | SQLite file path (`file:...` prefix supported; Docker uses `file:/app/data/rummy.db`) |
| `CLIENT_URL` | No | `http://localhost:3000` | Comma-separated CORS allowlist; first URL is used for room invite links |
| `NEXT_PUBLIC_SERVER_URL` | Build-time (client) | `http://localhost:4000` | Backend URL baked into the Next.js frontend bundle |
| `JWT_SECRET` | **Yes** | — | Secret key used to sign/verify auth JWTs (server exits on boot if unset) |
| `LIVEKIT_API_KEY` | **Yes** | — | LiveKit API key for room video/audio token generation |
| `LIVEKIT_API_SECRET` | **Yes** | — | LiveKit API secret |
| `LIVEKIT_URL` | **Yes** | — | LiveKit WebSocket URL (`wss://...` or `ws://...`) |

### Running Locally

**Development (server on `:4000`, client on `:3000`):**
```bash
npm run dev
# Or separately:
npm run dev:server
npm run dev:client
```

**Production build & start:**
```bash
npm run build
npm run start:server
npm run start:client
```

---

## Automated Testing & Typechecks

```bash
# Typecheck server and client
npx tsc -p server/tsconfig.json --noEmit
cd client && ../node_modules/.bin/tsc --noEmit

# Build backend & Next.js production bundle
npm run build

# Unit, real RoomManager privacy/anti-cheat, security, & DB resilience tests
# (automatically builds server first)
npm test

# Full end-to-end HTTP + Socket.IO multiplayer suite
# (automatically builds server, runs against an isolated temp SQLite DB, and stops server cleanly)
npm run test:e2e
```

---

## Docker Deployment

1. Copy `.env.example` to `.env` and populate `JWT_SECRET`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`, `CLIENT_URL`, and `NEXT_PUBLIC_SERVER_URL`.
2. Build and start both containers:
   ```bash
   docker compose up --build -d
   ```
- Backend server (`node:22-alpine`): `http://localhost:4000` (persists SQLite at `/app/data/rummy.db` via named volume `rummy_data`)
- Next.js frontend (`node:22-alpine`): `http://localhost:3000` (`NEXT_PUBLIC_SERVER_URL` is injected at build time via Docker build arg)
