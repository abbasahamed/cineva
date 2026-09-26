# Codebase Structure

```
/
├── .planning/               # GSD planning directory
│   ├── codebase/           # Architecture, structure, tech stack & conventions docs
│   └── onboarding/         # Onboarding summary & status
├── apps/
│   ├── server/             # Express + Socket.IO server & Prisma backend
│   │   ├── prisma/         # Prisma schema and SQLite/Postgres database configuration
│   │   └── src/
│   │       ├── controllers/
│   │       ├── middleware/
│   │       ├── routes/     # REST routes (/api/rooms, /api/media)
│   │       ├── services/   # syncEngine, roomManager, mediaStorage
│   │       ├── sockets/    # WebSocket handlers & clock sync
│   │       └── __tests__/  # Backend test suite
│   └── web/                # React + Vite frontend SPA
│       └── src/
│           ├── components/ # UI components (VideoPlayer, ChatPanel, Navbar, etc.)
│           ├── hooks/      # useSyncWatch, useSocket, custom React hooks
│           ├── pages/      # Landing, CreateRoom, JoinRoom, WatchRoom
│           ├── services/   # REST API client & socket connection handlers
│           └── __tests__/  # Frontend test suite
├── docs/                   # Product documentation, API reference & manual testing guides
├── packages/
│   └── shared/             # Shared TypeScript types, schemas, and contracts
└── scratch/                # Working temporary scripts & debug artifacts
```
