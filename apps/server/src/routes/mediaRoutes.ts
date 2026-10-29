import fs from "fs";
import express, { Request, Response } from "express";
import multer from "multer";
import path from "path";
import rateLimit from "express-rate-limit";
import { roomManager } from "../services/roomManager.js";
import { mediaJobQueue } from "../services/media/mediaJobQueue.js";
import { CONFIG } from "../config.js";
import { getClientIp } from "../utils/clientIp.js";
import { checkUploadDiskQuota } from "../utils/diskQuota.js";

const router = express.Router();

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => getClientIp(req),
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

// Multer disk storage with strict 10 GB file size limit and type inspection
const upload = multer({
  storage,
  limits: {
    fileSize: CONFIG.MAX_VIDEO_SIZE_BYTES, // 10 * 1024 * 1024 * 1024 (10,737,418,240 bytes)
    files: 1,
    fields: 3,
    fieldNestingDepth: 0,
    fieldArrayIndexLimit: 0,
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

/**
 * POST /api/media/upload
 * Primary upload endpoint for local video files.
 * Streams the incoming upload directly to local temporary disk staging,
 * validates authorization, quota, format, and size, then enqueues local FFmpeg/HLS processing.
 */
router.post(
  "/upload",
  uploadLimiter,
  (req, res, next) => {
    upload.single("video")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: "Video exceeds the 10GB upload limit" });
        }
        return res.status(400).json({ error: err.message || "File upload error" });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
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

      // Automatically prune inactive rooms and orphaned uploads before quota check
      await roomManager.pruneStaleRooms().catch(() => {});

      const quota = checkUploadDiskQuota(req.file.size);
      if (!quota.allowed) {
        if (uploadedPath) await fs.promises.unlink(uploadedPath).catch(() => {});
        res.status(507).json({ error: quota.error });
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
      await mediaJobQueue
        .enqueueMediaProcessing(roomId, req.file.path, safeName, title)
        .catch((err: any) => {
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
        error:
          CONFIG.NODE_ENV === "production"
            ? "Failed to upload video"
            : err.message || "Failed to upload video",
      });
    }
  }
);

/**
 * POST /api/media/network-check
 * Measures upload throughput from client to calculate host bandwidth.
 */
router.post(
  "/network-check",
  express.raw({ type: "*/*", limit: "15mb" }),
  (req: Request, res: Response) => {
    const startTime = req.headers["x-upload-start"]
      ? parseInt(req.headers["x-upload-start"] as string, 10)
      : Date.now();
    const durationMs = Math.max(1, Date.now() - startTime);
    const bytes = Buffer.isBuffer(req.body)
      ? req.body.length
      : typeof req.body === "string"
      ? Buffer.byteLength(req.body)
      : 0;
    const mbps = bytes > 0 ? (bytes * 8) / (durationMs * 1000) : 0;
    const clientIp = req.ip || req.socket.remoteAddress || "";
    const isLocal =
      clientIp === "127.0.0.1" ||
      clientIp === "::1" ||
      clientIp === "::ffff:127.0.0.1" ||
      clientIp.includes("127.0.0.1");

    res.json({
      bytes,
      durationMs,
      mbps: Math.round(mbps * 10) / 10,
      viewersAt1080p: Math.min(20, Math.max(1, Math.floor(mbps / 4.0))),
      isLocal,
    });
  }
);

export default router;
