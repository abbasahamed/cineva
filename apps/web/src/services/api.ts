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

export async function createRoom(data: CreateRoomInput): Promise<CreateRoomResponse> {
  const res = await fetch(`${API_BASE}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to create room" }));
    throw new Error(err.error || "Failed to create room");
  }

  return res.json();
}

/**
 * Fetches the server's active public URL (Cloudflare tunnel) if one is live.
 * Used for invite links so we never share a localhost address when a tunnel
 * is active. Returns null when no tunnel is available.
 */
export async function getPublicUrl(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/system/public-url`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { publicUrl?: string | null };
    const url = typeof data.publicUrl === "string" ? data.publicUrl.trim() : "";
    return url ? url.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
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
  const res = await fetch(`${API_BASE}/rooms/demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to create demo room" }));
    throw new Error(err.error || "Failed to create demo room");
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
 * Uploads media using direct multipart chunking to Backblaze B2 (or local storage).
 * Uploads chunks with controlled concurrency without buffering the entire file in RAM.
 */
export async function uploadMedia(
  roomId: string,
  sessionId: string,
  file: File,
  title?: string,
  onProgress?: (percent: number, progressInfo?: UploadProgressInfo) => void
): Promise<{ id: string; title: string; filename: string; url: string; status?: string }> {
  // 1. Initialize multipart upload with backend
  const initRes = await fetch(`${API_BASE}/media/uploads/multipart/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roomId,
      sessionId,
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type || "video/mp4",
      title,
    }),
  });

  if (initRes.ok) {
    const { uploadId, partSize, totalParts, parts } = await initRes.json();

    if (uploadId && Array.isArray(parts) && parts.length > 0) {
      const completedParts: Array<{ partNumber: number; etag: string }> = [];
      const partProgress = new Map<number, number>();

      const reportProgress = () => {
        let totalUploaded = 0;
        for (const bytes of partProgress.values()) {
          totalUploaded += bytes;
        }
        totalUploaded = Math.min(totalUploaded, file.size);
        const percent = Math.min(99, Math.round((totalUploaded / file.size) * 100));
        if (onProgress) {
          onProgress(percent, {
            percent,
            uploadedBytes: totalUploaded,
            totalBytes: file.size,
          });
        }
      };

      // Upload a single part with automatic retry
      const uploadPartWithRetry = async (
        partItem: { partNumber: number; uploadUrl: string },
        maxRetries = 3
      ): Promise<void> => {
        const start = (partItem.partNumber - 1) * partSize;
        const end = Math.min(start + partSize, file.size);
        const chunkBlob = file.slice(start, end);

        let targetUrl = partItem.uploadUrl;
        if (!targetUrl.startsWith("http")) {
          targetUrl = RAW_API_URL ? `${RAW_API_URL.replace(/\/$/, "")}${targetUrl}` : targetUrl;
        }

        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const etag = await new Promise<string>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable) {
                  partProgress.set(partItem.partNumber, e.loaded);
                  reportProgress();
                }
              });

              xhr.addEventListener("load", () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  let rawEtag = xhr.getResponseHeader("ETag") || xhr.getResponseHeader("etag") || "";
                  if (!rawEtag) {
                    try {
                      const resJson = JSON.parse(xhr.responseText);
                      rawEtag = resJson.etag || "";
                    } catch {}
                  }
                  resolve(rawEtag);
                } else {
                  reject(new Error(`Part ${partItem.partNumber} failed with status ${xhr.status}`));
                }
              });

              xhr.addEventListener("error", () => reject(new Error(`Network error uploading part ${partItem.partNumber}`)));
              xhr.addEventListener("abort", () => reject(new Error(`Upload aborted for part ${partItem.partNumber}`)));

              xhr.open("PUT", targetUrl);
              xhr.send(chunkBlob);
            });

            partProgress.set(partItem.partNumber, chunkBlob.size);
            reportProgress();
            completedParts.push({ partNumber: partItem.partNumber, etag });
            return;
          } catch (err: any) {
            lastError = err;
            if (attempt < maxRetries) {
              await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
            }
          }
        }
        throw lastError || new Error(`Failed to upload part ${partItem.partNumber}`);
      };

      // Controlled concurrency: 3 simultaneous chunks
      const concurrency = 3;
      let currentIndex = 0;
      const worker = async () => {
        while (currentIndex < parts.length) {
          const idx = currentIndex++;
          await uploadPartWithRetry(parts[idx]);
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, parts.length) }, () => worker());
      await Promise.all(workers);

      // 3. Complete multipart upload with backend
      const completeRes = await fetch(`${API_BASE}/media/uploads/multipart/${encodeURIComponent(uploadId)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          parts: completedParts,
        }),
      });

      if (!completeRes.ok) {
        const errJson = await completeRes.json().catch(() => ({ error: "Failed to finalize upload" }));
        throw new Error(errJson.error || "Failed to finalize upload");
      }

      if (onProgress) {
        onProgress(100, {
          percent: 100,
          uploadedBytes: file.size,
          totalBytes: file.size,
        });
      }

      return await completeRes.json();
    }
  } else {
    const initErr = await initRes.json().catch(() => ({ error: "Upload rejected" }));
    throw new Error(initErr.error || `Upload initialization failed (${initRes.status})`);
  }

  // Fallback: Standard streaming multipart upload to server for small files or legacy servers
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
