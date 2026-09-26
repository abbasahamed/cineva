import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { CONFIG } from '../config.js';

export interface SavedMediaResult {
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface SignedUploadResult {
  uploadUrl: string;
  storageKey: string;
  publicUrl: string;
}

/**
 * Universal MediaStorage abstraction interface for both
 * local filesystem storage (development) and object storage (production).
 */
export interface MediaStorage {
  saveFile(roomId: string, originalName: string, data: Buffer | string, mimeType: string, fileSize?: number): Promise<SavedMediaResult>;
  deleteFile(storageKey: string): Promise<void>;
  streamFile(storageKey: string, req: Request, res: Response): Promise<void> | void;
  getUrl(storageKey: string): string;
  ensureDemoMedia(): SavedMediaResult;
  getSignedUploadUrl?(roomId: string, originalName: string, mimeType: string): Promise<SignedUploadResult>;
}

/**
 * Local filesystem implementation of MediaStorage for local development.
 * Supports path traversal protection and HTTP 206 Partial Content byte-range streaming.
 */
export class LocalMediaStorage implements MediaStorage {
  private baseDir: string;

  constructor(baseDir: string = CONFIG.MEDIA_STORAGE_PATH) {
    this.baseDir = path.resolve(baseDir);
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getSafeFilePath(storageKey: string): string {
    const safeKey = path.normalize(storageKey).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(this.baseDir, safeKey);
    if (!fullPath.startsWith(this.baseDir)) {
      throw new Error('Access denied: Path traversal attempt detected');
    }
    return fullPath;
  }

  async saveFile(roomId: string, originalName: string, data: Buffer | string, mimeType: string, _fileSize?: number): Promise<SavedMediaResult> {
    const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const roomDir = path.join(this.baseDir, safeRoomId);
    if (!fs.existsSync(roomDir)) {
      fs.mkdirSync(roomDir, { recursive: true });
    }

    const sanitizedFilename = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = path.join(safeRoomId, `${Date.now()}_${sanitizedFilename}`);
    const filePath = this.getSafeFilePath(storageKey);

    let finalSize = 0;
    if (typeof data === 'string') {
      try {
        await fs.promises.rename(data, filePath);
      } catch {
        await fs.promises.copyFile(data, filePath);
        await fs.promises.unlink(data).catch(() => { });
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
      const filePath = this.getSafeFilePath(storageKey);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (err) {
      console.error(`Failed to delete local media file ${storageKey}:`, err);
    }
  }

  getUrl(storageKey: string): string {
    return `/media/${encodeURIComponent(storageKey)}`;
  }

  streamFile(storageKey: string, req: Request, res: Response): void {
    try {
      const filePath = this.getSafeFilePath(storageKey);

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Media file not found' });
        return;
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      const ext = path.extname(filePath).toLowerCase();
      let contentType = 'video/mp4';
      if (ext === '.webm') contentType = 'video/webm';
      else if (ext === '.mkv') contentType = 'video/x-matroska';
      else if (ext === '.mov') contentType = 'video/quicktime';
      else if (ext === '.ogg' || ext === '.ogv') contentType = 'video/ogg';

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize || start > end) {
          res.status(416).set({
            'Content-Range': `bytes */${fileSize}`,
          }).send('Requested Range Not Satisfiable');
          return;
        }

        const chunkSize = end - start + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        });

        fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
        });

        fs.createReadStream(filePath).pipe(res);
      }
    } catch (err) {
      console.error('Error streaming local media file:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream media file' });
      }
    }
  }

  ensureDemoMedia(): SavedMediaResult {
    const demoDir = path.join(this.baseDir, 'demo');
    if (!fs.existsSync(demoDir)) {
      fs.mkdirSync(demoDir, { recursive: true });
    }
    const storageKey = path.join('demo', 'sample_video.mp4');
    const demoPath = path.join(this.baseDir, storageKey);

    if (!fs.existsSync(demoPath)) {
      const dummySample = Buffer.from(
        'AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQAAAAhmcmVlAAAGpm1kYXQAAAAAAA...',
        'base64'
      );
      fs.writeFileSync(demoPath, dummySample);
    }

    const stat = fs.statSync(demoPath);
    return {
      storageKey,
      filename: 'sample_video.mp4',
      mimeType: 'video/mp4',
      size: stat.size,
      url: this.getUrl(storageKey),
    };
  }
}

/**
 * Production S3 / Object Storage implementation of MediaStorage.
 * Compatible with AWS S3, Cloudflare R2, MinIO, Wasabi, or DigitalOcean Spaces.
 */
export class S3MediaStorage implements MediaStorage {
  private client: S3Client;
  private bucket: string;
  private publicBaseUrl?: string;

  constructor() {
    this.bucket = CONFIG.S3.BUCKET;
    this.publicBaseUrl = CONFIG.S3.PUBLIC_BASE_URL || undefined;

    this.client = new S3Client({
      region: CONFIG.S3.REGION,
      endpoint: CONFIG.S3.ENDPOINT,
      forcePathStyle: CONFIG.S3.FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: CONFIG.S3.ACCESS_KEY_ID,
        secretAccessKey: CONFIG.S3.SECRET_ACCESS_KEY,
      },
    });
  }

  private sanitizeKey(roomId: string, originalName: string): string {
    const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedFilename = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `media/${safeRoomId}/${Date.now()}_${sanitizedFilename}`;
  }

  async saveFile(roomId: string, originalName: string, data: Buffer | string, mimeType: string, _fileSize?: number): Promise<SavedMediaResult> {
    const storageKey = this.sanitizeKey(roomId, originalName);

    let body: Buffer | fs.ReadStream;
    let finalSize: number;

    if (typeof data === 'string') {
      body = fs.createReadStream(data);
      const stat = await fs.promises.stat(data);
      finalSize = stat.size;
    } else {
      body = data;
      finalSize = data.length;
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: body,
        ContentType: mimeType,
        ContentLength: finalSize,
      })
    );

    if (typeof data === 'string') {
      await fs.promises.unlink(data).catch(() => { });
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
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        })
      );
    } catch (err) {
      console.error(`Failed to delete S3 object ${storageKey}:`, err);
    }
  }

  getUrl(storageKey: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/$/, '')}/${storageKey}`;
    }
    // Proxied streaming route to keep bucket private and support range requests
    return `/media/${encodeURIComponent(storageKey)}`;
  }

  async streamFile(storageKey: string, req: Request, res: Response): Promise<void> {
    try {
      const range = req.headers.range;

      // Fetch metadata to know object size and content type
      const head = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        })
      );

      const fileSize = head.ContentLength || 0;
      const contentType = head.ContentType || 'video/mp4';

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize || start > end) {
          res.status(416).set({
            'Content-Range': `bytes */${fileSize}`,
          }).send('Requested Range Not Satisfiable');
          return;
        }

        const command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
          Range: `bytes=${start}-${end}`,
        });

        const s3Response = await this.client.send(command);
        const chunkSize = end - start + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        });

        if (s3Response.Body instanceof Readable) {
          s3Response.Body.pipe(res);
        }
      } else {
        const command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
        });

        const s3Response = await this.client.send(command);

        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600',
        });

        if (s3Response.Body instanceof Readable) {
          s3Response.Body.pipe(res);
        }
      }
    } catch (err: any) {
      console.error(`S3 streaming error for ${storageKey}:`, err);
      if (!res.headersSent) {
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
          res.status(404).json({ error: 'Media file not found in storage' });
        } else {
          res.status(500).json({ error: 'Storage streaming error' });
        }
      }
    }
  }

  async getSignedUploadUrl(roomId: string, originalName: string, mimeType: string): Promise<SignedUploadResult> {
    const storageKey = this.sanitizeKey(roomId, originalName);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 900 }); // 15 mins

    return {
      uploadUrl,
      storageKey,
      publicUrl: this.getUrl(storageKey),
    };
  }

  ensureDemoMedia(): SavedMediaResult {
    const storageKey = 'media/demo/sample_video.mp4';
    return {
      storageKey,
      filename: 'sample_video.mp4',
      mimeType: 'video/mp4',
      size: 1048576,
      url: this.getUrl(storageKey),
    };
  }
}

/**
 * Factory function that instantiates the active MediaStorage driver.
 */
export function createMediaStorage(): MediaStorage {
  if (CONFIG.STORAGE_DRIVER === 's3' && CONFIG.S3.BUCKET) {
    return new S3MediaStorage();
  }
  return new LocalMediaStorage();
}

export const mediaStorage: MediaStorage = createMediaStorage();
