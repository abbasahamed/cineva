import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import { CONFIG } from "../config.js";

export interface SavedMediaResult {
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
}

/**
 * Local filesystem implementation of MediaStorage.
 * Handles local media storage, safe filename sanitization, path traversal
 * protection, and HTTP 206 Partial Content byte-range streaming for all video playback.
 */
export class LocalMediaStorage {
  private baseDir: string;

  constructor(baseDir: string = CONFIG.MEDIA_STORAGE_PATH) {
    this.baseDir = path.resolve(baseDir);
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getSafeFilePath(storageKey: string): string {
    const safeKey = path.normalize(storageKey).replace(/^(\.\.[\/\\])+/, "");
    const fullPath = path.resolve(this.baseDir, safeKey);
    if (!fullPath.startsWith(this.baseDir + path.sep) && fullPath !== this.baseDir) {
      throw new Error("Access denied: Path traversal attempt detected");
    }
    return fullPath;
  }

  async saveFile(roomId: string, originalName: string, data: Buffer | string, mimeType: string, _fileSize?: number): Promise<SavedMediaResult> {
    const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const roomDir = path.join(this.baseDir, safeRoomId);
    if (!fs.existsSync(roomDir)) {
      fs.mkdirSync(roomDir, { recursive: true });
    }

    const sanitizedFilename = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = path.join(safeRoomId, `${Date.now()}_${sanitizedFilename}`);
    const filePath = this.getSafeFilePath(storageKey);

    let finalSize = 0;
    if (typeof data === "string") {
      try {
        await fs.promises.rename(data, filePath);
      } catch {
        await fs.promises.copyFile(data, filePath);
        await fs.promises.unlink(data).catch(() => {});
      }
      const stat = await fs.promises.stat(filePath);
      finalSize = stat.size;
    } else {
      await fs.promises.writeFile(filePath, data);
      finalSize = data.length;
    }

    return {
      storageKey,
      filename: originalName,
      mimeType,
      size: finalSize,
      url: this.getUrl(storageKey),
    };
  }

  async deleteFile(storageKey: string): Promise<void> {
    try {
      if (storageKey.startsWith("demo/") || storageKey.startsWith("fixtures/")) {
        return;
      }
      const filePath = this.getSafeFilePath(storageKey);
      if (fs.existsSync(filePath)) {
        const stat = await fs.promises.stat(filePath);
        if (stat.isDirectory()) {
          await fs.promises.rm(filePath, { recursive: true, force: true });
        } else {
          await fs.promises.unlink(filePath);
        }
      }
    } catch (err) {
      console.error(`Failed to delete local media file ${storageKey}:`, err);
    }
  }

  getUrl(storageKey: string): string {
    return `/media/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
  }

  getLocalPath(storageKey: string): string | null {
    try {
      return this.getSafeFilePath(storageKey);
    } catch {
      return null;
    }
  }

  async streamFile(storageKey: string, req: Request, res: Response): Promise<void> {
    try {
      const filePath = this.getSafeFilePath(storageKey);

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "Media file not found" });
        return;
      }

      const stat = await fs.promises.stat(filePath);
      const fileSize = stat.size;
      const mtime = stat.mtime;
      const etag = `W/"${fileSize.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;
      const lastModified = mtime.toUTCString();
      const range = req.headers.range;

      const ext = path.extname(filePath).toLowerCase();
      const baseName = path.basename(filePath).toLowerCase();
      let contentType = "video/mp4";
      let cacheControl = "no-cache";

      if (ext === ".m3u8") {
        contentType = "application/vnd.apple.mpegurl";
        cacheControl = "no-cache, no-store, must-revalidate";
      } else if (ext === ".m4s" || baseName.startsWith("init_")) {
        contentType = "video/mp4";
        cacheControl = "public, max-age=31536000, immutable";
      } else if (ext === ".vtt") {
        contentType = "text/vtt; charset=utf-8";
        cacheControl = "public, max-age=3600";
      } else if (ext === ".webm") {
        contentType = "video/webm";
      } else if (ext === ".mkv") {
        contentType = "video/x-matroska";
      } else if (ext === ".mov") {
        contentType = "video/quicktime";
      } else if (ext === ".ogg" || ext === ".ogv") {
        contentType = "video/ogg";
      }

      const origin = (req.headers.origin as string) || "*";
      const corsHeaders: Record<string, string> = {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Type, Accept, Origin",
        "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges, ETag, Last-Modified",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Connection": "keep-alive",
      };

      if (req.method === "OPTIONS") {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }

      // Handle conditional GET (304 Not Modified)
      if (req.headers["if-none-match"] === etag || req.headers["if-modified-since"] === lastModified) {
        res.writeHead(304, {
          ...corsHeaders,
          "ETag": etag,
          "Last-Modified": lastModified,
          "Cache-Control": cacheControl,
        });
        res.end();
        return;
      }

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize || start > end) {
          res.status(416).set({
            ...corsHeaders,
            "Content-Range": `bytes */${fileSize}`,
          }).send("Requested Range Not Satisfiable");
          return;
        }

        const chunkSize = end - start + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
          ...corsHeaders,
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": contentType,
          "Cache-Control": cacheControl,
          "ETag": etag,
          "Last-Modified": lastModified,
        });

        fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          ...corsHeaders,
          "Content-Length": fileSize,
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
          "Cache-Control": cacheControl,
          "ETag": etag,
          "Last-Modified": lastModified,
        });

        fs.createReadStream(filePath).pipe(res);
      }
    } catch (err) {
      console.error("Error streaming local media file:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to stream media file" });
      }
    }
  }

  ensureDemoMedia(): SavedMediaResult {
    const demoDir = path.join(this.baseDir, "demo");
    if (!fs.existsSync(demoDir)) {
      fs.mkdirSync(demoDir, { recursive: true });
    }
    const storageKey = path.join("demo", "sample_video.mp4");
    const demoPath = path.join(this.baseDir, storageKey);

    if (!fs.existsSync(demoPath) || fs.statSync(demoPath).size < 200) {
      const dummyHeader = Buffer.from(
        "AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQAAAAhmcmVlAAAGpm1kYXQAAAAAAA",
        "base64"
      );
      const dummySample = Buffer.concat([dummyHeader, Buffer.alloc(2048)]);
      fs.writeFileSync(demoPath, dummySample);
    }

    const stat = fs.statSync(demoPath);
    return {
      storageKey,
      filename: "sample_video.mp4",
      mimeType: "video/mp4",
      size: stat.size,
      url: this.getUrl(storageKey),
    };
  }
}

// Type alias so any existing MediaStorage annotations continue to type-check
export type MediaStorage = LocalMediaStorage;

export const mediaStorage = new LocalMediaStorage();
