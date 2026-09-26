import { Router, Request, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { mediaStorage, S3MediaStorage } from '../services/mediaStorage.js';
import { roomManager } from '../services/roomManager.js';
import { mediaJobQueue } from '../services/media/mediaJobQueue.js';
import { CONFIG } from '../config.js';

const router = Router();

// Dedicated rate limiting for media uploads to prevent storage abuse
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 uploads per IP
  message: { error: 'Upload limit reached. Please wait before uploading more files.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Whitelist of valid video extensions and mime types
const ALLOWED_EXTENSIONS = new Set(['.mp4', '.webm', '.mkv', '.mov', '.ogv', '.ogg']);
const ALLOWED_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/x-matroska',
  'video/mkv',
  'video/matroska',
  'application/x-matroska',
  'application/mkv',
  'video/quicktime',
  'video/ogg',
  'video/x-m4v',
  'application/octet-stream', // sent when browser/OS lacks MKV registration
]);

function sanitizeFileName(rawName: string): string {
  const ext = path.extname(rawName).toLowerCase();
  const baseName = path.basename(rawName, ext);
  // Clean special characters and directory traversal markers
  const cleanBase = baseName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
  return `${cleanBase || 'video'}${ext}`;
}

import fs from 'fs';

// Temporary directory for streaming local uploads without buffering in RAM
const tempUploadDir = path.join(CONFIG.MEDIA_STORAGE_PATH, 'temp');
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `upload_${uniqueSuffix}${ext}`);
  },
});

// Multer disk storage with strict 5 GB file size limit and type inspection
const upload = multer({
  storage,
  limits: {
    fileSize: CONFIG.MAX_VIDEO_SIZE_BYTES, // 5 * 1024 * 1024 * 1024 (5,368,709,120 bytes)
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('Invalid video extension. Supported formats: MP4, WebM, MKV, MOV, OGG.'));
    }
    if (file.mimetype) {
      const mimeLower = file.mimetype.toLowerCase();
      if (!ALLOWED_MIME_TYPES.has(mimeLower) && !mimeLower.startsWith('video/')) {
        return cb(new Error('Invalid video MIME type.'));
      }
    }
    cb(null, true);
  },
});

// POST /api/media/upload (Standard multipart upload)
router.post('/upload', uploadLimiter, (req, res, next) => {
  upload.single('video')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Video exceeds the 5GB upload limit' });
      }
      return res.status(400).json({ error: err.message || 'File upload error' });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  const uploadedPath = req.file?.path;
  try {
    const roomId = req.body.roomId;
    const sessionId = req.body.sessionId;
    const customTitle = req.body.title;

    if (!roomId || !sessionId) {
      if (uploadedPath) await fs.promises.unlink(uploadedPath).catch(() => {});
      res.status(400).json({ error: 'Missing roomId or sessionId' });
      return;
    }

    const isHost = await roomManager.isHost(roomId, sessionId);
    if (!isHost) {
      if (uploadedPath) await fs.promises.unlink(uploadedPath).catch(() => {});
      res.status(403).json({ error: 'Only the host is authorized to upload media' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No video file provided' });
      return;
    }

    const safeName = sanitizeFileName(req.file.originalname);
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    let rawMime = (req.file.mimetype || '').toLowerCase();
    let mimeType = rawMime;

    if (fileExt === '.mkv') {
      mimeType = 'video/x-matroska';
    } else if (!mimeType || mimeType === 'application/octet-stream') {
      if (fileExt === '.mp4') mimeType = 'video/mp4';
      else if (fileExt === '.webm') mimeType = 'video/webm';
      else if (fileExt === '.mov') mimeType = 'video/quicktime';
      else if (fileExt === '.ogg' || fileExt === '.ogv') mimeType = 'video/ogg';
      else mimeType = 'video/mp4';
    }

    const title = customTitle || safeName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

    // Enqueue background processing (Analysis -> Compatibility Check -> Remux/Transcode -> Ready notification)
    await mediaJobQueue.enqueueMediaProcessing(
      roomId,
      req.file.path,
      safeName,
      title
    ).catch((err: any) => {
      console.error('Failed to enqueue media job:', err);
    });

    res.status(201).json({
      status: 'processing',
      message: 'Video uploaded successfully and is being prepared for playback.',
      roomId,
      filename: safeName,
    });
  } catch (err: any) {
    if (uploadedPath) await fs.promises.unlink(uploadedPath).catch(() => {});
    console.error('Media upload error:', err.message);
    res.status(err.status || 500).json({
      error: CONFIG.NODE_ENV === 'production' ? 'Failed to upload video' : (err.message || 'Failed to upload video'),
    });
  }
});

// POST /api/media/request-upload-url (Direct S3 / Object Storage signed upload URL)
router.post('/request-upload-url', uploadLimiter, async (req: Request, res: Response) => {
  try {
    const { roomId, sessionId, filename, mimeType } = req.body;

    if (!roomId || !sessionId || !filename) {
      res.status(400).json({ error: 'roomId, sessionId, and filename are required' });
      return;
    }

    const isHost = await roomManager.isHost(roomId, sessionId);
    if (!isHost) {
      res.status(403).json({ error: 'Only the host is authorized to request upload authorization' });
      return;
    }

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      res.status(400).json({ error: 'Unsupported file extension' });
      return;
    }

    if (mediaStorage instanceof S3MediaStorage && mediaStorage.getSignedUploadUrl) {
      const safeName = sanitizeFileName(filename);
      const effectiveMime = ext === '.mkv' ? 'video/x-matroska' : (mimeType || 'video/mp4');
      const signedData = await mediaStorage.getSignedUploadUrl(roomId, safeName, effectiveMime);
      res.json({
        uploadUrl: signedData.uploadUrl,
        storageKey: signedData.storageKey,
        publicUrl: signedData.publicUrl,
        method: 'PUT',
      });
    } else {
      // Local storage doesn't use signed PUT URLs, notify client to use /api/media/upload
      res.status(501).json({
        error: 'Direct S3 pre-signed upload is only available when STORAGE_DRIVER=s3 is configured.',
        fallbackEndpoint: '/api/media/upload',
      });
    }
  } catch (err: any) {
    console.error('Request upload URL error:', err.message);
    res.status(500).json({ error: 'Failed to generate upload authorization' });
  }
});

// POST /api/media/record-direct-upload (Record metadata after direct S3 upload completes)
router.post('/record-direct-upload', async (req: Request, res: Response) => {
  try {
    const { roomId, sessionId, storageKey, filename, mimeType, size, title, duration } = req.body;

    if (!roomId || !sessionId || !storageKey || !filename) {
      res.status(400).json({ error: 'Missing required media metadata parameters' });
      return;
    }

    const isHost = await roomManager.isHost(roomId, sessionId);
    if (!isHost) {
      res.status(403).json({ error: 'Only the host is authorized to attach media' });
      return;
    }

    const ext = path.extname(filename).toLowerCase();
    const effectiveMime = ext === '.mkv' ? 'video/x-matroska' : (mimeType || 'video/mp4');
    const safeTitle = title || sanitizeFileName(filename).replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

    const mediaRecord = await roomManager.attachMedia(roomId, {
      title: safeTitle,
      filename: sanitizeFileName(filename),
      mimeType: effectiveMime,
      size: (typeof size === 'number' || typeof size === 'string' || typeof size === 'bigint') ? size : 0,
      storageKey,
      duration: typeof duration === 'number' ? duration : undefined,
    });

    res.status(201).json({
      id: mediaRecord.id,
      title: mediaRecord.title,
      filename: mediaRecord.filename,
      mimeType: mediaRecord.mimeType,
      size: mediaRecord.size.toString(),
      url: mediaStorage.getUrl(mediaRecord.storageKey),
    });
  } catch (err: any) {
    console.error('Record direct upload error:', err.message);
    res.status(500).json({ error: 'Failed to record direct upload metadata' });
  }
});

export default router;
