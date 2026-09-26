# System Architecture

## Overview
SyncWatch provides frame-accurate real-time video synchronization across multiple browser clients using a server-authoritative timeline model combined with NTP-style clock drift compensation.

## Core Components
1. **Clock Synchronization (NTP Protocol)**:
   - Client periodically pings the server to calculate Round-Trip Time (RTT) and latency-compensated server time offset.
2. **Server-Authoritative Timeline Engine (`syncEngine`)**:
   - The server maintains true playback state (`isPlaying`, `positionMs`, `lastUpdatedMs`, `playbackRate`).
   - Client position is calculated as: `currentPos = positionMs + (isCurrentlyPlaying ? (serverNow - lastUpdatedMs) * playbackRate : 0)`.
3. **Multi-tier Drift Compensation (`useSyncWatch`)**:
   - **$\Delta < 0.25\text{s}$**: Ignore small jitter.
   - **$0.25\text{s} \le \Delta < 1.0\text{s}$**: Adjust playback rate ($0.95\times$ or $1.05\times$) for gentle catch-up without abrupt jumps.
   - **$\Delta \ge 1.0\text{s}$**: Hard seek to exact authoritative position.
4. **Media Streaming (`mediaStorage`)**:
   - Supports HTTP 206 Partial Content range requests for local media and S3 compatibility.
5. **Real-Time Room & Chat Engine (`roomManager`)**:
   - Manages room lifecycle, presence, host permissions, and WebSocket chat messages.
