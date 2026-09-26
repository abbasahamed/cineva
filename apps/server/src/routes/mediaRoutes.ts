import fs from "fs";
import express, { Request, Response } from "express";
import multer from "multer";
import path from "path";
import rateLimit from "express-rate-limit";
import { roomManager } from "../services/roomManager.js";
import { mediaStorage, S3MediaStorage } from "../services/mediaStorage.js";
import { mediaJobQueue } from "../services/media/mediaJobQueue.js";
import { multipartManager } from "../services/media/multipartManager.js";
import { CONFIG } from "../config.js";

const router = express.Router();

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many upload attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const ALLOWED_EXTENSIONS = new Set([".mp4", ".webm", ".mkv", ".mov", ".ogg", ".ogv"]);
const ALLOWED_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/x-matroska",
  "video/quicktime",
  "video/ogg",
  "application/x-matroska",
  "application/octet-stream",
  "video/mkv",
]);

function sanitizeFileName(rawName: string): string {
  const ext = path.extname(rawName).toLowerCase();
  const baseName = path.basename(rawName, ext);
  const cleanBase = baseName.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 80);
  return `${cleanBase || "video"}${ext}`;
}

// Temporary directory for streaming local uploads without buffering in RAM
const tempUploadDir = path.join(CONFIG.MEDIA_STORAGE_PATH, "temp");
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
      return cb(new Error("Invalid video extension. Supported formats: MP4, WebM, MKV, MOV, OGG."));
    }
    if (file.mimetype) {
      const mimeLower = file.mimetype.toLowerCase();
      if (!ALLOWED_MIME_TYPES.has(mimeLower) && !mimeLower.startsWith("video/")) {
        return cb(new Error("Invalid video MIME type."));
      }
    }
    cb(null, true);
  },
});

// ==============================================================================
// 1. DIRECT MULTIPART UPLOAD ENDPOINTS (Backblaze B2 & Local Development)
// ==============================================================================

/**
 * POST /api/media/uploads/multipart/init
 * Initializes a direct multipart upload.
 * Validates room, host authorization, file size, extension, and MIME type.
 * Generates presigned B2 upload URLs for each chunk (or local endpoints in dev).
 */
router.post("/uploads/multipart/init", uploadLimiter, async (req: Request, res: Response) => {
  try {
    const { roomId, sessionId, filename, fileSize, mimeType, title } = req.body;

    if (!roomId || !sessionId || !filename) {
      res.status(400).json({ error: "Missing roomId, sessionId, or filename" });
      return;
    }

    const numSize = typeof fileSize === "number" ? fileSize : parseInt(fileSize, 10);
    if (isNaN(numSize) || numSize <= 0) {
      res.status(400).json({ error: "Invalid file size" });
      return;
    }

    if (numSize > CONFIG.MAX_VIDEO_SIZE_BYTES) {
      res.status(400).json({ error: "Video exceeds the 5GB upload limit" });
      return;
    }

    const isHost = await roomManager.isHost(roomId, sessionId);
    if (!isHost) {
      res.status(403).json({ error: "Only the host is authorized to upload media" });
      return;
    }

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      res.status(400).json({ error: "Invalid video extension. Supported formats: MP4, WebM, MKV, MOV, OGG." });
      return;
    }

    let effectiveMime = (mimeType || "").toLowerCase();
    if (ext === ".mkv") {
      effectiveMime = "video/x-matroska";
    } else if (!effectiveMime || effectiveMime === "application/octet-stream") {
      if (ext === ".mp4") effectiveMime = "video/mp4";
      else if (ext === ".webm") effectiveMime = "video/webm";
      else if (ext === ".mov") effectiveMime = "video/quicktime";
      else if (ext === ".ogg" || ext === ".ogv") effectiveMime = "video/ogg";
      else effectiveMime = "video/mp4";
    }

    const safeName = sanitizeFileName(filename);
    const safeTitle = title || safeName.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");

    // Standard chunk size: 50 MB (compatible with B2 5MB minimum)
    const partSize = 50 * 1024 * 1024;
    const initData = await mediaStorage.initMultipartUpload(
      roomId,
      safeName,
      effectiveMime,
      numSize,
      partSize
    );

    multipartManager.registerUpload({
      uploadId: initData.uploadId,
      roomId,
      sessionId,
      storageKey: initData.storageKey,
      filename: safeName,
      mimeType: effectiveMime,
      size: numSize,
      title: safeTitle,
      partSize: initData.partSize,
      totalParts: initData.totalParts,
      createdAt: Date.now(),
    });

    res.status(201).json({
      uploadId: initData.uploadId,
      storageKey: initData.storageKey,
      partSize: initData.partSize,
      totalParts: initData.totalParts,
      parts: initData.parts,
    });
  } catch (err: any) {
    console.error("Multipart init error:", err);
    const errMessage = (err.message || "").replace(/[A-Za-z0-9_-]{24,}/g, "[REDACTED]");
    const safeError = CONFIG.NODE_ENV === "production"
      ? (err.name ? `Upload init failed (${err.name}): ${errMessage.substring(0, 120)}` : "Failed to initialize upload")
      : err.message;
    res.status(500).json({
      error: safeError,
    });
  }
});

/**
 * GET /api/media/uploads/multipart/:uploadId/parts
 * Resumability: returns the list of parts already received by storage.
 */
router.get("/uploads/multipart/:uploadId/parts", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.uploadId as string;
    const sessionId = (req.query.sessionId as string) || req.headers["x-session-id"];

    const upload = multipartManager.getUpload(uploadId);
    if (!upload) {
      res.status(404).json({ error: "Upload session not found or expired" });
      return;
    }

    if (sessionId && upload.sessionId !== sessionId) {
      res.status(403).json({ error: "Unauthorized access to upload session" });
      return;
    }

    const uploadedParts = await mediaStorage.listUploadedParts(upload.storageKey, uploadId);
    res.json({ uploadId, uploadedParts });
  } catch (err: any) {
    console.error("Multipart list parts error:", err.message);
    res.status(500).json({ error: "Failed to query uploaded parts" });
  }
});

/**
 * POST /api/media/uploads/multipart/:uploadId/part-url
 * Generates or refreshes a presigned upload URL for a specific part number.
 */
router.post("/uploads/multipart/:uploadId/part-url", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.uploadId as string;
    const { sessionId, partNumber } = req.body;

    const upload = multipartManager.getUpload(uploadId);
    if (!upload) {
      res.status(404).json({ error: "Upload session not found or expired" });
      return;
    }

    if (!sessionId || upload.sessionId !== sessionId) {
      res.status(403).json({ error: "Unauthorized access to upload session" });
      return;
    }

    const partNum = parseInt(partNumber, 10);
    if (isNaN(partNum) || partNum <= 0) {
      res.status(400).json({ error: "Invalid part number" });
      return;
    }

    const uploadUrl = await mediaStorage.getMultipartPartUrl(upload.storageKey, uploadId, partNum);
    res.json({ uploadUrl, partNumber: partNum });
  } catch (err: any) {
    console.error("Multipart part-url error:", err.message);
    res.status(500).json({ error: "Failed to generate part upload authorization" });
  }
});

/**
 * PUT /api/media/uploads/multipart/:uploadId/part/:partNumber
 * Streaming chunk upload handler for local development (LocalMediaStorage).
 */
router.put("/uploads/multipart/:uploadId/part/:partNumber", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.uploadId as string;
    const partNumber = req.params.partNumber as string;
    const partNum = parseInt(partNumber, 10);

    const upload = multipartManager.getUpload(uploadId);
    if (!upload) {
      res.status(404).json({ error: "Upload session not found or expired" });
      return;
    }

    if (!mediaStorage.savePart) {
      res.status(501).json({ error: "Direct chunk upload not supported by current storage driver" });
      return;
    }

    const result = await mediaStorage.savePart(uploadId, partNum, req);
    res.setHeader("ETag", result.etag);
    res.json({ etag: result.etag, partNumber: partNum });
  } catch (err: any) {
    console.error("Local part upload error:", err.message);
    res.status(500).json({ error: "Failed to store chunk" });
  }
});

/**
 * POST /api/media/uploads/multipart/:uploadId/complete
 * Completes the multipart upload with B2 / S3 storage.
 * Enqueues the background media processing pipeline without passing the file through Railway HTTP.
 */
router.post("/uploads/multipart/:uploadId/complete", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.uploadId as string;
    const { sessionId, parts } = req.body;

    const upload = multipartManager.getUpload(uploadId);
    if (!upload) {
      res.status(404).json({ error: "Upload session not found or expired" });
      return;
    }

    if (!sessionId || upload.sessionId !== sessionId) {
      res.status(403).json({ error: "Unauthorized access to upload session" });
      return;
    }

    if (!Array.isArray(parts) || parts.length === 0) {
      res.status(400).json({ error: "Missing or invalid parts array" });
      return;
    }

    // Complete upload in storage driver
    const saved = await mediaStorage.completeMultipartUpload(
      upload.storageKey,
      uploadId,
      parts,
      upload.mimeType
    );

    // Remove from active tracking map
    multipartManager.deleteUpload(uploadId);

    // Enqueue background processing pipeline (Analysis -> FFprobe -> Compatibility -> FFmpeg -> B2 playback)
    await mediaJobQueue.enqueueMediaProcessing(
      upload.roomId,
      { storageKey: saved.storageKey, size: upload.size },
      upload.filename,
      upload.title
    );

    res.json({
      status: "processing",
      message: "Video uploaded successfully and is being prepared for playback.",
      roomId: upload.roomId,
      filename: upload.filename,
      storageKey: saved.storageKey,
    });
  } catch (err: any) {
    console.error("Multipart complete error:", err.message);
    res.status(500).json({
      error: CONFIG.NODE_ENV === "production" ? "Failed to complete upload" : err.message,
    });
  }
});

/**
 * POST /api/media/uploads/multipart/:uploadId/abort
 * Aborts an active multipart upload and releases storage resources.
 */
router.post("/uploads/multipart/:uploadId/abort", async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.uploadId as string;
    const { sessionId } = req.body;

    const upload = multipartManager.getUpload(uploadId);
    if (!upload) {
      res.status(404).json({ error: "Upload session not found" });
      return;
    }

    if (!sessionId || upload.sessionId !== sessionId) {
      res.status(403).json({ error: "Unauthorized access to upload session" });
      return;
    }

    await mediaStorage.abortMultipartUpload(upload.storageKey, uploadId);
    multipartManager.deleteUpload(uploadId);

    res.json({ status: "aborted", uploadId });
  } catch (err: any) {
    console.error("Multipart abort error:", err.message);
    res.status(500).json({ error: "Failed to abort upload" });
  }
});

// ==============================================================================
// 2. LEGACY / FALLBACK SINGLE-REQUEST UPLOAD ENDPOINTS
// ==============================================================================

// POST /api/media/upload (Standard single multipart form upload fallback for small files/tests)
router.post("/upload", uploadLimiter, (req, res, next) => {
  upload.single("video")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "Video exceeds the 5GB upload limit" });
      }
      return res.status(400).json({ error: err.message || "File upload error" });
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
      res.status(400).json({ error: "Missing roomId or sessionId" });
      return;
    }

    const isHost = await roomManager.isHost(roomId, sessionId);
    if (!isHost) {
      if (uploadedPath) await fs.promises.unlink(uploadedPath).catch(() => {});
      res.status(403).json({ error: "Only the host is authorized to upload media" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No video file provided" });
      return;
    }

    const safeName = sanitizeFileName(req.file.originalname);
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    let rawMime = (req.file.mimetype || "").toLowerCase();
    let mimeType = rawMime;

    if (fileExt === ".mkv") {
      mimeType = "video/x-matroska";
    } else if (!mimeType || mimeType === "application/octet-stream") {
      if (fileExt === ".mp4") mimeType = "video/mp4";
      else if (fileExt === ".webm") mimeType = "video/webm";
      else if (fileExt === ".mov") mimeType = "video/quicktime";
      else if (fileExt === ".ogg" || fileExt === ".ogv") mimeType = "video/ogg";
      else mimeType = "video/mp4";
    }

    const title = customTitle || safeName.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");

    // Enqueue background processing
    await mediaJobQueue.enqueueMediaProcessing(
      roomId,
      req.file.path,
      safeName,
      title
    ).catch((err: any) => {
      console.error("Failed to enqueue media job:", err);
    });

    res.status(201).json({
      status: "processing",
      message: "Video uploaded successfully and is being prepared for playback.",
      roomId,
      filename: safeName,
    });
  } catch (err: any) {
    if (uploadedPath) await fs.promises.unlink(uploadedPath).catch(() => {});
    console.error("Media upload error:", err.message);
    res.status(err.status || 500).json({
      error: CONFIG.NODE_ENV === "production" ? "Failed to upload video" : (err.message || "Failed to upload video"),
    });
  }
});

// POST /api/media/request-upload-url (Single PUT signed upload URL fallback)
router.post("/request-upload-url", uploadLimiter, async (req: Request, res: Response) => {
  try {
    const { roomId, sessionId, filename, mimeType } = req.body;

    if (!roomId || !sessionId || !filename) {
      res.status(400).json({ error: "roomId, sessionId, and filename are required" });
      return;
    }

    const isHost = await roomManager.isHost(roomId, sessionId);
    if (!isHost) {
      res.status(403).json({ error: "Only the host is authorized to request upload authorization" });
      return;
    }

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      res.status(400).json({ error: "Unsupported file extension" });
      return;
    }

    if (mediaStorage instanceof S3MediaStorage && mediaStorage.getSignedUploadUrl) {
      const safeName = sanitizeFileName(filename);
      const effectiveMime = ext === ".mkv" ? "video/x-matroska" : (mimeType || "video/mp4");
      const signedData = await mediaStorage.getSignedUploadUrl(roomId, safeName, effectiveMime);
      res.json({
        uploadUrl: signedData.uploadUrl,
        storageKey: signedData.storageKey,
        publicUrl: signedData.publicUrl,
        method: "PUT",
      });
    } else {
      res.status(501).json({
        error: "Direct S3 pre-signed upload is only available when STORAGE_DRIVER=s3 is configured.",
        fallbackEndpoint: "/api/media/upload",
      });
    }
  } catch (err: any) {
    console.error("Request upload URL error:", err.message);
    res.status(500).json({ error: "Failed to generate upload authorization" });
  }
});

// POST /api/media/record-direct-upload (Record metadata after direct S3 upload completes)
router.post("/record-direct-upload", async (req: Request, res: Response) => {
  try {
    const { roomId, sessionId, storageKey, filename, mimeType, size, title, duration } = req.body;

    if (!roomId || !sessionId || !storageKey || !filename) {
      res.status(400).json({ error: "Missing required media metadata parameters" });
      return;
    }

    const isHost = await roomManager.isHost(roomId, sessionId);
    if (!isHost) {
      res.status(403).json({ error: "Only the host is authorized to attach media" });
      return;
    }

    const ext = path.extname(filename).toLowerCase();
    const effectiveMime = ext === ".mkv" ? "video/x-matroska" : (mimeType || "video/mp4");
    const safeTitle = title || sanitizeFileName(filename).replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");

    const mediaRecord = await roomManager.attachMedia(roomId, {
      title: safeTitle,
      filename: sanitizeFileName(filename),
      mimeType: effectiveMime,
      size: (typeof size === "number" || typeof size === "string" || typeof size === "bigint") ? size : 0,
      storageKey,
      duration: typeof duration === "number" ? duration : undefined,
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
    console.error("Record direct upload error:", err.message);
    res.status(500).json({ error: "Failed to record direct upload metadata" });
  }
});


// POST /api/media/process-existing (Enqueue processing for an existing storage object)
router.post("/process-existing", async (req: Request, res: Response) => {
  try {
    const { roomId, sessionId, storageKey, filename, size, title } = req.body;

    if (!roomId || !sessionId || !storageKey || !filename) {
      res.status(400).json({ error: "Missing required parameters (roomId, sessionId, storageKey, filename)" });
      return;
    }

    const isHost = await roomManager.isHost(roomId, sessionId);
    if (!isHost) {
      res.status(403).json({ error: "Only the host is authorized to process media" });
      return;
    }

    const safeName = sanitizeFileName(filename);
    const safeTitle = title || safeName.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
    const numSize = typeof size === "number" ? size : (parseInt(size, 10) || 0);

    await mediaJobQueue.enqueueMediaProcessing(
      roomId,
      { storageKey, size: numSize },
      safeName,
      safeTitle
    );

    res.json({
      status: "processing",
      roomId,
      storageKey,
      filename: safeName,
    });
  } catch (err: any) {
    console.error("Process existing media error:", err.message);
    res.status(500).json({ error: "Failed to process existing media" });
  }
});


// POST /api/media/presigned-get-url (POC presigned GET URL for B2 objects)
router.post("/presigned-get-url", async (req: Request, res: Response) => {
  try {
    const { storageKey } = req.body;
    if (!storageKey) {
      res.status(400).json({ error: "storageKey is required" });
      return;
    }
    if (mediaStorage instanceof S3MediaStorage && (mediaStorage as any).getSignedDownloadUrl) {
      const url = await (mediaStorage as any).getSignedDownloadUrl(storageKey);
      res.json({ presignedGetUrl: url, storageKey });
    } else {
      res.status(501).json({ error: "S3 storage driver required" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
