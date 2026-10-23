# Project Requirements

## Core Functional Requirements
- [x] **Real-time Video Synchronization**: Keep playback in sync within sub-second thresholds.
- [x] **Clock Synchronization**: NTP-style latency and offset estimation.
- [x] **Room Lifecycle**: Create, join, leave, and manage room permissions.
- [x] **Media Streaming**: Range-based chunked streaming for local video uploads.
- [x] **Presence & Chat**: Real-time room participant badges and chat.

## Technical Requirements
- Monorepo structure using npm workspaces (`@cineva/web`, `@cineva/server`, `@cineva/shared`).
- Unit and integration tests for sync calculation, drift thresholds, and room management.
- Type-safe communication using Zod schemas and shared event contracts.
