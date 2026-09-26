# Tech Stack & Architecture Overview

## Monorepo & Workspaces
- **Monorepo Manager**: npm Workspaces
- **Orchestration**: `concurrently`
- **Language**: TypeScript (`^5.7.3`)

## Apps & Packages
1. **`apps/web`** (Frontend)
   - React + Vite
   - Tailwind CSS
   - Socket.IO Client (`socket.io-client`)
   - React Router DOM
   - Lucide React Icons

2. **`apps/server`** (Backend)
   - Node.js + Express
   - Socket.IO Server (`socket.io`)
   - Prisma ORM (SQLite for dev, Postgres-compatible)
   - Zod validation
   - HTTP 206 Partial Content Range Video Streaming

3. **`packages/shared`** (Shared Utilities & Types)
   - Shared Zod validation schemas
   - WebSocket event constants & payload interfaces
   - Common domain types (Room, User, MediaItem, PlaybackState)
