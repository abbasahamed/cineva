import { CreateRoomInput, JoinRoomInput, RoomInfo, ParticipantInfo } from '@syncwatch/shared';

const RAW_API_URL = (import.meta.env.VITE_API_URL as string | undefined) || '';
const API_BASE = RAW_API_URL ? `${RAW_API_URL.replace(/\/$/, '')}/api` : '/api';

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

export async function createRoom(data: CreateRoomInput): Promise<CreateRoomResponse> {
  const res = await fetch(`${API_BASE}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create room' }));
    throw new Error(err.error || 'Failed to create room');
  }

  return res.json();
}

export async function createDemoRoom(displayName: string = 'Host'): Promise<CreateRoomResponse> {
  const res = await fetch(`${API_BASE}/rooms/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create demo room' }));
    throw new Error(err.error || 'Failed to create demo room');
  }

  return res.json();
}

export async function getRoomDetails(roomCode: string): Promise<RoomInfo> {
  const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(roomCode.toUpperCase())}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Room not found' }));
    throw new Error(err.error || 'Room not found');
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to join room' }));
    throw new Error(err.error || 'Failed to join room');
  }

  return res.json();
}

export async function uploadMedia(
  roomId: string,
  sessionId: string,
  file: File,
  title?: string,
  onProgress?: (percent: number) => void
): Promise<{ id: string; title: string; filename: string; url: string }> {
  // Try direct presigned S3/Object Storage upload first for maximum performance with large files
  try {
    const presignedRes = await fetch(`${API_BASE}/media/request-upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId,
        sessionId,
        filename: file.name,
        mimeType: file.type || 'video/mp4',
      }),
    });

    if (presignedRes.ok) {
      const { uploadUrl, storageKey } = await presignedRes.json();
      if (uploadUrl && storageKey) {
        // Direct PUT to S3 / R2 / MinIO bucket
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && onProgress) {
              const percent = Math.round((e.loaded / e.total) * 100);
              onProgress(percent);
            }
          });
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Direct upload failed with status ${xhr.status}`));
            }
          });
          xhr.addEventListener('error', () => reject(new Error('Network error during direct S3 upload')));
          xhr.addEventListener('abort', () => reject(new Error('Direct upload aborted')));

          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
          xhr.send(file);
        });

        // Record uploaded metadata on server
        const recordRes = await fetch(`${API_BASE}/media/record-direct-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId,
            sessionId,
            storageKey,
            filename: file.name,
            mimeType: file.type || 'video/mp4',
            size: file.size,
            title: title || file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
          }),
        });

        if (recordRes.ok) {
          return await recordRes.json();
        }
      }
    }
  } catch (err) {
    console.warn('Presigned upload unavailable or failed, falling back to local server upload:', err);
  }

  // Fallback: Standard streaming multipart upload to server
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('video', file);
    formData.append('roomId', roomId);
    formData.append('sessionId', sessionId);
    if (title) formData.append('title', title);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(res);
        } catch {
          reject(new Error('Invalid response from server'));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error || 'Upload failed'));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    xhr.open('POST', `${API_BASE}/media/upload`);
    xhr.send(formData);
  });
}
