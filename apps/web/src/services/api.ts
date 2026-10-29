import { CreateRoomInput, JoinRoomInput, RoomInfo, ParticipantInfo } from "@cineva/shared";

const RAW_API_URL = (import.meta.env.VITE_API_URL as string | undefined) || "";
const API_BASE = RAW_API_URL ? `${RAW_API_URL.replace(/\/$/, "")}/api` : "/api";

export interface CreateRoomResponse {
  room: RoomInfo;
  hostSessionId: string;
  hostParticipantId: string;
}

export interface JoinRoomResponse {
  room: RoomInfo;
  participant: ParticipantInfo;
  sessionId: string;
  isNew: boolean;
}

export interface UploadProgressInfo {
  percent: number;
  uploadedBytes: number;
  totalBytes: number;
}

export async function createRoom(data: CreateRoomInput, retries = 1): Promise<CreateRoomResponse> {
  let res: Response | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      res = await fetch(`${API_BASE}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      // If server responded with a normal HTTP status, stop retrying
      if (res.ok || (res.status !== 502 && res.status !== 503 && res.status !== 504)) {
        break;
      }
    } catch {
      // Network fetch failure
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  if (!res) {
    throw new Error(
      "Cannot connect to server. Ensure the backend is running on port 4000 (run 'npm run dev')."
    );
  }

  if (!res.ok) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error("Backend server is offline. Please make sure 'npm run dev' is running.");
    }
    let errMsg = "Failed to create room";
    try {
      const err = await res.json();
      errMsg = err.error || err.message || errMsg;
    } catch {
      const text = await res.text().catch(() => "");
      if (text.includes("ECONNREFUSED")) {
        errMsg = "Backend server is offline. Please make sure 'npm run dev' is running.";
      } else if (text) {
        errMsg = text;
      }
    }
    throw new Error(errMsg);
  }

  return res.json();
}

/**
 * Attaches synthetic demo/sample media to an existing room in development.
 */
export async function attachSampleMedia(roomCode: string): Promise<any> {
  const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(roomCode)}/sample-media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error("Failed to attach sample media to room");
  }
  return res.json();
}

export interface PublicUrlInfo {
  publicUrl: string | null;
  lanUrl: string | null;
  tunnelError: string | null;
  tunnelActive: boolean;
}

/**
 * Fetches the server's network diagnostic information:
 * - Active public tunnel URL (Cloudflare or SSH HTTPS fallback)
 * - Local Wi-Fi LAN address for local network access
 * - Real-time tunnel status and error
 */
export async function getNetworkSystemInfo(): Promise<PublicUrlInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/system/public-url`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PublicUrlInfo;
    return {
      publicUrl: data.publicUrl ? data.publicUrl.trim().replace(/\/+$/, "") : null,
      lanUrl: data.lanUrl ? data.lanUrl.trim().replace(/\/+$/, "") : null,
      tunnelError: data.tunnelError || null,
      tunnelActive: Boolean(data.tunnelActive),
    };
  } catch {
    return null;
  }
}

/**
 * Fetches the server's active public URL (Cloudflare tunnel) if one is live.
 * Used for invite links so we never share a localhost address when a tunnel
 * is active. Returns null when no tunnel is available.
 */
export async function getPublicUrl(): Promise<string | null> {
  const info = await getNetworkSystemInfo();
  return info?.publicUrl || null;
}

/**
 * Normal cancellation or upload failure: issues a standard JSON POST request.
 */
export async function abortRoom(roomId: string, sessionId: string): Promise<void> {
  try {
    const url = `${API_BASE}/rooms/${encodeURIComponent(roomId)}/abort`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, sessionId }),
    });
  } catch (err) {
    console.warn("Failed to abort room:", err);
  }
}

/**
 * Dedicated unload beacon: issues a single CORS-simple application/x-www-form-urlencoded
 * request to the Railway API without requiring an OPTIONS preflight.
 */
export function sendAbortBeacon(roomId: string, sessionId: string): void {
  try {
    const url = `${API_BASE}/rooms/${encodeURIComponent(roomId)}/abort`;
    const formData = new URLSearchParams();
    formData.append("roomId", roomId);
    formData.append("sessionId", sessionId);
    const blob = new Blob([formData.toString()], { type: "application/x-www-form-urlencoded" });

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(url, blob);
      return;
    }

    if (typeof fetch === "function") {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
        keepalive: true,
        mode: "cors",
      }).catch(() => {});
    }
  } catch (err) {
    console.warn("Failed to dispatch abort beacon:", err);
  }
}

export async function createDemoRoom(displayName: string = "Host"): Promise<CreateRoomResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/rooms/demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
  } catch {
    throw new Error(
      "Cannot connect to server. Ensure the backend is running on port 4000 (run 'npm run dev')."
    );
  }

  if (!res.ok) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error("Backend server is offline. Please make sure 'npm run dev' is running.");
    }
    const err = await res.json().catch(() => ({ error: "Failed to create demo room" }));
    throw new Error(err.error || "Failed to create demo room");
  }

  return res.json();
}

export interface RoomCheckResult {
  exists: boolean;
  joinable: boolean;
  status: 'active' | 'ended' | 'expired';
  isFull: boolean;
}

/**
 * Privacy-safe room lookup: checks whether a room exists and is joinable
 * without leaking host identity, room title, or media details.
 */
export async function checkRoom(roomCode: string): Promise<RoomCheckResult> {
  const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(roomCode.toUpperCase())}?check=true`);

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Room not found");
    }
    const err = await res.json().catch(() => ({ error: "Failed to check room" }));
    throw new Error(err.error || "Failed to check room");
  }

  return res.json();
}

export async function getRoomDetails(roomCode: string): Promise<RoomInfo> {
  const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(roomCode.toUpperCase())}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Room not found" }));
    throw new Error(err.error || "Room not found");
  }

  return res.json();
}

export async function joinRoom(roomCode: string, displayName: string, sessionId?: string): Promise<JoinRoomResponse> {
  const payload: JoinRoomInput = {
    roomCode: roomCode.toUpperCase(),
    displayName,
    sessionId,
  };

  const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(roomCode.toUpperCase())}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to join room" }));
    throw new Error(err.error || "Failed to join room");
  }

  return res.json();
}

/**
 * Uploads media file directly to the local CINEVA server.
 * Streams the file with real-time progress events without buffering the entire file in RAM.
 */
export async function uploadMedia(
  roomId: string,
  sessionId: string,
  file: File,
  title?: string,
  onProgress?: (percent: number, progressInfo?: UploadProgressInfo) => void
): Promise<{ id: string; title: string; filename: string; url: string; status?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("video", file);
    formData.append("roomId", roomId);
    formData.append("sessionId", sessionId);
    if (title) formData.append("title", title);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent, {
          percent,
          uploadedBytes: e.loaded,
          totalBytes: e.total,
        });
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(res);
        } catch {
          reject(new Error("Invalid response from server"));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error || "Upload failed"));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

    xhr.open("POST", `${API_BASE}/media/upload`);
    xhr.send(formData);
  });
}
