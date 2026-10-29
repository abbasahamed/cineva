# Cineva — Live Deployment Verification Checklist

Use this checklist during your live multi-device production testing.

---

## 📋 Core Functionality Checklist

- [ ] **Landing Page**: Opens with correct dark cinema theme, headline, and responsive navbar.
- [ ] **Create Room**: Host can create a room with custom title or demo video; 6-character room code generated.
- [ ] **Share Modal**: Displays 1-click URL copying, code copying, and native Web Share integration.
- [ ] **Room Join**: Guest can join via share link (`/join/:roomCode`) or code input; automatically joins channel.
- [ ] **Participant Presence**: Avatars, display names, host badges, and online presence indicators update live.
- [ ] **Video Upload**: Host can upload authorized video files (MP4, WebM, MKV, MOV up to 5 GB); file metadata attaches to room.
- [ ] **Video Playback**: HTML5 video streams smoothly via HTTP 206 partial content byte-range requests.
- [ ] **Play Synchronization**: Host presses play; all connected participants begin playback within $<100\text{ms}$.
- [ ] **Pause Synchronization**: Host presses pause; all connected participants freeze on the identical frame.
- [ ] **Seek Synchronization**: Host scrubs timeline forward/backward; all participants converge to new playhead.
- [ ] **Rapid Seeking**: Host rapidly seeks multiple times; all clients resolve to final authoritative position.
- [ ] **Playback Speed Sync**: Host modifies playback speed ($0.75\times$, $1.0\times$, $1.25\times$, $1.5\times$); guests adapt rate.
- [ ] **Late Joiner Catch-up**: Guest joins while video is playing; automatically seeks to elapsed position in $<50\text{ms}$.
- [ ] **Network Reconnection**: Client briefly disconnects (airplane mode toggle); auto-reconnects and restores state.
- [ ] **Real-Time Chat**: Text messages send with timestamps and user badges; XSS payloads are sanitized.
- [ ] **Chat Rate Limiting**: Sending $>5$ messages within 3 seconds prompts rate limit warning without crashing.
- [ ] **Autoplay Audio UX**: Browser autoplay blocks unmuted audio $\to$ displays *"You're synchronized. Click to enable audio"* without breaking timeline sync.
- [ ] **Mobile Interface**: At widths $<768\text{px}$, video fills width and participants/chat collapse into bottom tabs.
- [ ] **Fullscreen & PiP**: Fullscreen toggle (`F`) and Picture-in-Picture operate smoothly.
- [ ] **Host Control Permissions**: Guests cannot play/pause/seek unless host toggles "Allow Guest Controls" in Settings.
- [ ] **Host Moderation**: Host can kick participants or end room; room termination redirects guests with modal message.
- [ ] **Invalid Inputs Handled**: Non-existent room codes show clear *"Room not found"* message with *"Return to Home"* button.
- [ ] **Upload Validation**: Executables, non-video extensions, and files exceeding 5 GB are rejected with clear error messages.
- [ ] **Production HTTPS / WSS**: Green padlock on browser; WebSocket connects securely over `wss://`.

---

## 🌐 Mobile and Tunnel Network Testing Protocol

When sharing a room with external or mobile devices, use the appropriate link based on network topology:

### 1. Same Local Wi-Fi Network (LAN)
* **Target scenario**: Phone and host computer are on the same Wi-Fi router.
* **Link format**: `http://<LAN_IP>:4000/room/<CODE>` (e.g. `http://192.168.0.103:4000/room/ABC123`).
* **Why**: Direct Wi-Fi access completely bypasses public DNS, ISP filtering, and tunnel overhead.
* **How to get it**: In Cineva, open the Share modal or room page and click **"Copy Local Wi-Fi Link"**.
* **Verification**: Open Chrome/Safari on the phone, paste the link. The room and video should load immediately.

### 2. Remote Cellular / External Network (Public Tunnel)
* **Target scenario**: Phone is using cellular data (LTE/5G) or connected to a remote Wi-Fi network outside the host home.
* **Link format**: `https://<random-subdomain>.trycloudflare.com/room/<CODE>` (e.g. `https://forum-weight-twice-increases.trycloudflare.com/room/ABC123`).
* **How to get it**: In Cineva, click **"Copy Link"** (Direct Invite Link Remote).
* **Important Tunnel Lifecycle Rules**:
  1. **Ephemeral hostnames**: Cloudflare Quick Tunnels allocate dynamic subdomains. Every time `cloudflared` restarts or is stopped, the previous subdomain expires immediately. Anyone opening an expired subdomain gets `DNS_PROBE_FINISHED_NXDOMAIN` or `HTTP 530`.
  2. **Tunnel rotation banner**: If the tunnel restarts while you are in a room, Cineva automatically detects the new tunnel URL and displays a warning banner (`⚠️ Tunnel refreshed. Copy the updated link below...`). Old invitation links cannot be reused once rotated.
  3. **Local router DNS restrictions**: Some home routers (e.g., standard ISP routers) reject DNS resolution for dynamic tunneling domains like `*.trycloudflare.com` with `REFUSED` response code. On cellular networks (or devices with standard public DNS like Cloudflare `1.1.1.1` or Google `8.8.8.8`), `trycloudflare.com` resolves normally. If a phone on local Wi-Fi experiences DNS errors with `trycloudflare.com`, use the **Same Wi-Fi Link (Direct LAN)**.

---

## ⏱️ Live Synchronization Measurement Table

Record actual measured playhead variance between Host and Guest devices during live testing:

| Test Scenario | Test Duration / Action | Expected Max Drift | Measured Variance (ms) | Pass / Fail |
| :--- | :--- | :--- | :--- | :---: |
| **Normal Playback** | 10 seconds playing | $< 50\text{ms}$ | | [ ] |
| **Normal Playback** | 30 seconds playing | $< 50\text{ms}$ | | [ ] |
| **Normal Playback** | 60 seconds playing | $< 50\text{ms}$ | | [ ] |
| **Pause Alignment** | Host triggers pause | $0\text{ms}$ (identical frame) | | [ ] |
| **Seek Convergence** | Host jumps +30s | $< 100\text{ms}$ convergence | | [ ] |
| **Late Arrival** | Join during active playback | $< 100\text{ms}$ convergence | | [ ] |
| **Network Hiccup** | Reconnect after 5s offline | $< 100\text{ms}$ convergence | | [ ] |

---

## 📝 Incident & Bug Notes

| Timestamp | Device / Browser | Network Type | Observed Issue | Resolution / Action Taken |
| :--- | :--- | :--- | :--- | :--- |
| | | | | |
