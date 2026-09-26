# SyncWatch Project Roadmap

## Phase 1: Core Foundation & Media Pipeline (Completed)
- [x] Frame-accurate server-authoritative playback synchronization engine (`syncEngine`)
- [x] NTP-style round-trip time (RTT) & clock drift calculation loop (`useSyncWatch`)
- [x] Multi-tier drift correction (ignore micro-drift, rate-adjust sub-second, hard seek >1s)
- [x] Monorepo setup with shared Zod validation contracts
- [x] Automatic media compatibility analysis, audio/video transcoding & HTTP 206 range streaming
- [x] Temporary file lifecycle management & disk safety protection
- [x] Real-time chat, room presence, host identity controls, and cinema watch room UI

## Phase 2: Playback Correctness & Advanced Media Pipeline
- [ ] **Multi-Client Buffer Awareness**: Server pauses authoritative timeline if guests are buffering
- [ ] **Subtitles & Audio Track Support**: Parse, stream, and render embedded VTT/SRT tracks and multi-language audio
- [ ] **HLS Adaptive Bitrate Streaming**: Transcode large 4K/1080p files into HLS manifests (.m3u8/.ts) to improve seeking performance and playback stability on low bandwidth

## Phase 3: Security, Reliability & Transcoding Isolation
- [ ] **Magic-Byte File Validation**: Inspect media headers on upload to prevent malicious payload uploads
- [ ] **Transcoding Process Isolation**: Run FFmpeg jobs in background worker child processes so encoding never blocks Express/Socket.IO event loop
- [ ] **Socket Authentication & CSRF Protection**: Enforce signed session tokens on WebSocket connection handshake

## Phase 4: Production Readiness & Horizontal Scalability
- [ ] **Redis Socket.IO Adapter & Distributed State**: Enable multi-node scaling across server instances
- [ ] **Comprehensive Health Probes**: `/health/live` and `/health/ready` endpoints with disk space, DB, and FFmpeg dependency checks
- [ ] **Prometheus Metrics & Operational Telemetry**: Export real-time metrics for drift statistics, room counts, and active transcoding jobs
