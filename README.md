# Real-Time Multiplayer Indian Rummy with Private Cards & Live Video Calling

A production-quality, real-time multiplayer 13-card Indian Rummy web application featuring private rooms, one-click invitation links & QR codes, live WebRTC video/audio conferencing powered by LiveKit, and strict server-authoritative card privacy.

---

## 🌟 Key Features

1. **Strict Private Card Security**:
   - Zero-trust architecture: The server owns the full deck, shuffling, player hands, draw/discard piles, and validation.
   - Opponents and spectators *never* receive other players' card identities, ranks, or suits.
   - Public broadcasts (`GAME_STATE_UPDATE`) expose only card counts (13).
   - Secret hand updates (`PRIVATE_HAND_UPDATE`) are sent exclusively to the individual authenticated player's WebSocket.
   - Cryptographic random shuffling via Node.js `crypto.randomInt` (Fisher-Yates).

2. **Integrated WebRTC Video/Audio Calling**:
   - Real-time video tiles around the card table powered by LiveKit.
   - Microphone mute/unmute, camera toggle, active speaker detection, and audio-only fallback.
   - Server-side LiveKit JWT token generation (API secrets are never exposed to the frontend).
   - Video continues seamlessly across card draws, discards, and declarations.

3. **13-Card Indian Rummy Rules Engine**:
   - 2-deck Indian Rummy configuration (108 cards: two 52-card decks + 4 jokers).
   - Wild Joker cut mechanism: cut card defines wild jokers across all suits.
   - Pure sequence, impure sequence, and set validation.
   - Winning requirement: At least 2 sequences required, at least 1 must be a Pure Sequence.
   - Official Points Rummy scoring: Ace/K/Q/J = 10 pts, Pip cards = face value, Jokers = 0 pts.
   - Drop penalties: First drop = 20 pts, Middle drop = 40 pts, Invalid declaration = 80 pts (penalty cap: 80).

4. **Private Rooms & Easy Connections**:
   - 6-character room codes (e.g., `AB12CD`).
   - One-click invite URLs and mobile-scannable QR codes.
   - Instant guest play: Friends clicking an invite link can enter a display name and join in seconds without registration.
   - Full room lobby with seat assignments (2–6 players), ready toggles, and host controls.

5. **Disconnection & Reconnection Resilience**:
   - Automatic reconnect detection.
   - Private cards and game turn state restored only to the authenticated returning player.
   - Turn countdown timer with grace periods and auto-timeout handling.

---

## 🏗️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Framer Motion, Zustand |
| **Real-Time Communication** | Socket.IO Client & Server |
| **Video Conferencing** | LiveKit WebRTC (`livekit-client`, `@livekit/components-react`, `livekit-server-sdk`) |
| **Backend** | Node.js, Express.js, TypeScript |
| **Database & ORM** | PostgreSQL / SQLite via Prisma ORM |
| **Authentication** | JWT (JSON Web Tokens), bcryptjs, Guest Sessions |
| **Deployment** | Docker, Docker Compose |

---

## 📁 Project Structure

```
d:\rummy\
├── client/                               # Next.js 14 Frontend Application
│   ├── src/
│   │   ├── app/                          # Next.js App Router Pages
│   │   │   ├── layout.tsx                # Dark casino theme layout
│   │   │   ├── page.tsx                  # Home dashboard & Quick Play
│   │   │   ├── login/page.tsx            # Guest / Login / Sign Up tabs
│   │   │   ├── room/[code]/page.tsx      # Main game table & lobby
│   │   │   ├── rules/page.tsx            # Interactive rules guide
│   │   │   └── profile/page.tsx          # Match stats & friends
│   │   ├── components/
│   │   │   ├── game/
│   │   │   │   ├── Card.tsx              # Interactive playing card (SVG/CSS)
│   │   │   │   ├── CardHand.tsx          # 13-card hand with grouping & drag
│   │   │   │   ├── MeldGroup.tsx         # Pure/Impure/Set visual melds
│   │   │   │   ├── DeckPiles.tsx         # Closed deck, discard pile & wild joker
│   │   │   │   ├── Table.tsx             # Virtual felt table & round scores
│   │   │   │   └── DeclareModal.tsx      # Melds submission & validation
│   │   │   ├── video/
│   │   │   │   ├── VideoOverlay.tsx      # LiveKit participant grid & controls
│   │   │   │   └── VideoTile.tsx         # Camera tile with turn & mic indicator
│   │   │   └── lobby/
│   │   │       └── LobbyView.tsx         # 6-seat waiting lobby & invite modal
│   │   ├── store/                        # Zustand stores (Game, Auth, Video)
│   │   ├── hooks/                        # useSocket, useLiveKit
│   │   ├── lib/                          # api.ts, clientEvaluator.ts
│   │   └── types/                        # Client TypeScript interfaces
├── server/                               # Backend Server & Game Engine
│   ├── src/
│   │   ├── engine/                       # Server-Authoritative Game Engine
│   │   │   ├── Deck.ts                   # 108-card deck & CSRNG shuffle
│   │   │   ├── Evaluator.ts              # Sequence, Set & Declaration validator
│   │   │   ├── Game.ts                   # Turn loop, timers, drops, and scoring
│   │   │   └── types.ts                  # Engine data models
│   │   ├── socket/
│   │   │   ├── authMiddleware.ts         # Handshake JWT authentication
│   │   │   └── roomManager.ts            # Room lifecycle, lobby, and sync
│   │   ├── routes/
│   │   │   ├── auth.ts                   # Register, login, guest, profile
│   │   │   ├── rooms.ts                  # Room creation & QR code generation
│   │   │   ├── livekit.ts                # Server-side LiveKit JWT token generator
│   │   │   └── friends.ts                # Friends, search, and history
│   │   ├── db/
│   │   │   └── prisma.ts                 # Prisma client instance
│   │   └── index.ts                      # Express & HTTP server entry
│   └── tests/
│       ├── engine.test.cjs               # Unit tests (deck, melds, scoring)
│       └── privacy_multiplayer.test.cjs  # Penetration tests for card leakage
├── prisma/
│   └── schema.prisma                     # Database schema definition
├── docker-compose.yml                    # Multi-container orchestration
├── Dockerfile.server
├── Dockerfile.client
└── package.json
```

---

## 🔒 Security Model & Verification

1. **Card Privacy**:
   - Cards are stored in memory in `player.hand` on the server.
   - When broadcasting `GAME_STATE_UPDATE` to `room_${code}`, player objects contain only:
     ```json
     {
       "id": "p1",
       "username": "Player 1",
       "seatNumber": 1,
       "cardCount": 13,
       "isCurrentTurn": true
     }
     ```
   - Only the individual player's socket receives:
     ```json
     {
       "type": "PRIVATE_HAND_UPDATE",
       "playerId": "p1",
       "cards": [ ... 13 cards ... ]
     }
     ```
2. **Move Validation**:
   - Player can draw only on their turn during `DRAW` phase.
   - Player can discard only during `DISCARD` phase and *only a card currently in their server hand*.
   - Declarations are calculated strictly on the server by `Evaluator.validateDeclaration()`.

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 18+ installed

### 2. Install Dependencies
```bash
npm install
```

### 3. Database Setup
```bash
npx prisma generate
npx prisma db push
```

### 4. Running the Application

**Development Mode (Server on port 4000, Client on port 3000):**
```bash
# Terminal 1: Start Backend Server
npm run dev:server

# Terminal 2: Start Next.js Frontend
npm run dev:client
```
Then visit [http://localhost:3000](http://localhost:3000) in your browser.

**Production Build:**
```bash
npm run build
npm run start:server
npm run start:client
```

---

## 🧪 Automated Testing

Run the automated test suite covering game physics, CSRNG shuffle, validation, and privacy penetration:

```bash
npm test
```

Test Results:
- `Deck initialization & shuffle`: Verified 108 cards & CSRNG shuffle.
- `Card Dealing & Wild Joker cut`: Verified 13 cards dealt & wild joker assignment.
- `Pure Sequence validation`: Verified natural consecutive runs (including Ace low and Ace high).
- `Impure Sequence validation`: Verified joker substitutions.
- `Set validation`: Verified same rank, different suits, and duplicate suit rejection.
- `Winning Declaration validation`: Verified 2 sequences (1 pure mandatory) + sets.
- `Multiplayer Socket Security & Card Privacy Penetration Test`: Verified zero card leakage across simultaneous players over WebSocket connections.

---

## 🐳 Docker Deployment

To launch the complete application with Docker Compose:

```bash
docker-compose up --build
```
- Client: `http://localhost:3000`
- Server: `http://localhost:4000`
