import { mediaStorage } from "../mediaStorage.js";
import { logger } from "../../utils/logger.js";

export interface ActiveMultipartUpload {
  uploadId: string;
  roomId: string;
  sessionId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
  title?: string;
  partSize: number;
  totalParts: number;
  createdAt: number;
}

export class MultipartUploadManager {
  private activeUploads = new Map<string, ActiveMultipartUpload>();

  registerUpload(upload: ActiveMultipartUpload): void {
    this.activeUploads.set(upload.uploadId, upload);
  }

  getUpload(uploadId: string): ActiveMultipartUpload | undefined {
    return this.activeUploads.get(uploadId);
  }

  deleteUpload(uploadId: string): void {
    this.activeUploads.delete(uploadId);
  }

  getUploadsForRoom(roomId: string): ActiveMultipartUpload[] {
    const results: ActiveMultipartUpload[] = [];
    for (const upload of this.activeUploads.values()) {
      if (upload.roomId === roomId) {
        results.push(upload);
      }
    }
    return results;
  }

  async abortUploadsForRoom(roomId: string): Promise<void> {
    const roomUploads = this.getUploadsForRoom(roomId);
    for (const upload of roomUploads) {
      try {
        await mediaStorage.abortMultipartUpload(upload.storageKey, upload.uploadId);
        logger.info("[MultipartManager] Aborted multipart upload for room", {
          roomId,
          uploadId: upload.uploadId,
          storageKey: upload.storageKey,
        });
      } catch (err: any) {
        logger.warn("[MultipartManager] Error aborting multipart upload for room", {
          roomId,
          uploadId: upload.uploadId,
          error: err.message,
        });
      } finally {
        this.activeUploads.delete(upload.uploadId);
      }
    }
  }

  // Periodic cleanup of stale uploads older than 24 hours
  cleanupStaleUploads(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    for (const [uploadId, upload] of this.activeUploads.entries()) {
      if (now - upload.createdAt > maxAgeMs) {
        mediaStorage.abortMultipartUpload(upload.storageKey, uploadId).catch(() => {});
        this.activeUploads.delete(uploadId);
      }
    }
  }
}

export const multipartManager = new MultipartUploadManager();
