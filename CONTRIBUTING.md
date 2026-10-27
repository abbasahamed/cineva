# Contributing to Cineva

Thank you for your interest in contributing to **Cineva**! We welcome bug fixes, documentation improvements, performance optimizations, and feature enhancements.

Please read this guide before contributing to ensure a smooth and productive workflow.

---

## 🛠️ Project Architecture

Cineva is structured as an npm workspaces monorepo:

- **`apps/server`**: Node.js, Express, Socket.IO server, Prisma ORM, and FFmpeg/FFprobe media pipelines.
- **`apps/web`**: React 18, Vite 6, Tailwind CSS, Lucide icons, and HLS.js video player.
- **`packages/shared`**: Shared TypeScript types, Zod schemas, socket event definitions, and timing math.

---

## 🚀 Development Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **FFmpeg & FFprobe**: Included automatically via `@ffmpeg-installer` and `@ffprobe-installer`, or installed system-wide.

### Installation
1. Fork and clone the repository:
   ```bash
   git clone https://github.com/<your-username>/cineva.git
   cd cineva
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```
4. Initialize SQLite development database:
   ```bash
   npm run db:push --workspace=@cineva/server
   ```
5. Build the shared types package:
   ```bash
   npm run build --workspace=@cineva/shared
   ```
6. Start both frontend and backend in development mode:
   ```bash
   npm run dev
   ```
   - Web application: `http://localhost:5173`
   - Server API & WebSockets: `http://localhost:4000`

---

## 🧪 Testing & Quality Gates

Before submitting a pull request, verify that all automated checks pass:

```bash
# 1. Typecheck all workspaces
npm run typecheck

# 2. Run backend and frontend automated test suites
npm run test

# 3. Verify production compilation and bundle generation
npm run build
```

### Writing Tests
- Server tests use [Vitest](https://vitest.dev/) and Supertest in `apps/server/src/__tests__/`.
- Web frontend tests use Vitest, Testing Library, and jsdom in `apps/web/src/__tests__/`.
- When adding new functionality (routes, sockets, player controls), include corresponding tests.

---

## 🔒 Security & Privacy Guidelines

- **Never commit secrets**: Never commit `.env` files, production database connection strings, or personal access tokens.
- **Never commit media files**: User movies, personal media, and temporary transcoding segments must never be committed. All media should reside in gitignored `uploads/` or `temp/`.
- **Zero Cloud Storage**: Cineva uses local disk storage exclusively. Do not introduce AWS S3, Backblaze B2, or external cloud object storage dependencies.
- **Sanitize user inputs**: Validate all incoming parameters with Zod schemas and sanitize chat inputs against XSS.

---

## 📦 Pull Request Process

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes adhering to existing architectural patterns and clean code conventions.
3. Run tests and type checking:
   ```bash
   npm run typecheck && npm run test && npm run build
   ```
4. Write clear, descriptive commit messages.
5. Push to your fork and submit a pull request against the `main` branch.
6. Provide a concise summary of changes, motivation, and verification steps in your PR description.
