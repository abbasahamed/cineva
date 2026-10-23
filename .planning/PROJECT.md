# Project Overview: Cineva

## Project Goal
Provide a production-grade, real-time synchronized video watch party platform with sub-second clock drift correction and server-authoritative timeline control.

## Core Features
- Frame-accurate video synchronization
- Real-time room chat and participant presence
- Host permission controls & instant demo rooms
- HTTP 206 partial content media streaming

## Tech Stack
- **Frontend**: React + Vite, Tailwind CSS, Socket.IO Client, Lucide React
- **Backend**: Node.js, Express, Socket.IO, Prisma ORM (SQLite / PostgreSQL)
- **Shared**: Monorepo package with Zod validation schemas and event contracts
