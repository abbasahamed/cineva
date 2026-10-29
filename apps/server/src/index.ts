import { analyzeMediaFile } from './services/media/mediaAnalyzer.js';
import { getFfmpegPath, getFfprobePath } from './services/media/binaryResolver.js';
import express, { Request, Response, NextFunction } from 'express';
import { execFile, execSync, spawn, type ChildProcess } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { CONFIG } from './config.js';
import { connectDB, prisma } from './db.js';
import roomRoutes from './routes/roomRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import { mediaStorage } from './services/mediaStorage.js';
import { setupSocketHandlers } from './sockets/socketHandler.js';
import { logger } from './utils/logger.js';
import { tunnelService } from './services/tunnelService.js';
import { getClientIp } from './utils/clientIp.js';
import { hlsPackager } from './services/media/hlsPackager.js';
import { transcodingService } from './services/media/transcodingService.js';
import { roomManager } from './services/roomManager.js';
import { tempFileLifecycle } from './services/media/tempFileLifecycle.js';

const execFilePromise = util.promisify(execFile);

export async function checkBinary(bin: string): Promise<{ available: boolean; path?: string; version?: string; error?: string }> {
  try {
    const resolved = bin === "ffmpeg" ? getFfmpegPath() : bin === "ffprobe" ? getFfprobePath() : bin;
    const whichCmd = process.platform === "win32" ? "where" : "which";
    let binPath = resolved;
    try {
      const { stdout: whichOut } = await execFilePromise(whichCmd, [bin]);
      if (whichOut?.trim()) {
        binPath = whichOut.trim().split("\n")[0].trim();
      }
    } catch {
      // Fall back to resolved binary path
    }
    const { stdout: versionOut } = await execFilePromise(resolved, ["-version"]);
    const firstLine = (versionOut || "").split("\n")[0] || "";
    return {
      available: true,
      path: binPath,
      version: firstLine.trim(),
    };
  } catch (err: any) {
    return {
      available: false,
      error: err.message,
    };
  }
}

// BigInt JSON serialization polyfill to prevent JSON.stringify errors
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();
const server = http.createServer(app);

const isProduction = CONFIG.NODE_ENV === 'production';

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // allow non-browser requests or same-origin
  if (CONFIG.ENABLE_TUNNEL) {
    const tunnelUrl = tunnelService.getActiveTunnelUrl();
    if (tunnelUrl) {
      try {
        if (new URL(origin).origin === new URL(tunnelUrl).origin) return true;
      } catch {
        return false;
      }
    }
  }
  // Allow legitimate public tunnels (Cloudflare, Pinggy, localhost.run)
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    if (
      host.endsWith('.trycloudflare.com') ||
      host.endsWith('.run.pinggy-free.link') ||
      host.endsWith('.free.pinggy.net') ||
      host.endsWith('.pinggy.link') ||
      host.endsWith('.lhr.life')
    ) {
      return true;
    }
  } catch {}

  if (CONFIG.NODE_ENV !== 'production') {
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return true;
    }
  }
  return CONFIG.ALLOWED_ORIGINS.includes(origin) || (CONFIG.NODE_ENV !== 'production' && CONFIG.ALLOWED_ORIGINS.includes('*'));
}

// Initialize Socket.io with persistent WebSockets and proper CORS
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        logger.warn('cors_rejection', { origin, context: 'socket.io' });
        callback(new Error('CORS policy violation for WebSocket connection'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 20000,
  pingInterval: 10000,
  transports: ['websocket', 'polling'],
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    xContentTypeOptions: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'sameorigin' },
    hsts: isProduction
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        mediaSrc: ["'self'", 'blob:', 'data:', 'https:'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'http:', 'https:'],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        logger.warn('cors_rejection', { origin, context: 'http' });
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    exposedHeaders: ['Content-Range', 'Content-Length', 'Accept-Ranges'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per IP
  keyGenerator: (req) => getClientIp(req),
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Dedicated Rate Limiter for Room Creation to prevent room spam
const roomCreationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 60, // 60 rooms per IP per 10 mins
  keyGenerator: (req) => getClientIp(req),
  skip: (req) => process.env.NODE_ENV !== 'production' && (
    req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1' ||
    getClientIp(req) === '127.0.0.1' || getClientIp(req) === '::1' || getClientIp(req) === 'localhost'
  ),
  message: { error: 'Too many rooms created recently. Please wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Dedicated Rate Limiter for Room Joining to protect against brute-force room code guessing
const roomJoinLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 120, // 120 join attempts per IP per 5 mins
  keyGenerator: (req) => getClientIp(req),
  skip: (req) => process.env.NODE_ENV !== 'production' && (
    req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1' ||
    getClientIp(req) === '127.0.0.1' || getClientIp(req) === '::1' || getClientIp(req) === 'localhost'
  ),
  message: { error: 'Too many join attempts. Please wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/rooms', (req, res, next) => {
  if (req.method === 'POST') {
    if (req.path.endsWith('/join')) {
      return roomJoinLimiter(req, res, next);
    }
    if (req.path === '/' || req.path === '') {
      return roomCreationLimiter(req, res, next);
    }
  }
  next();
});

// Health check endpoints (supports both /health and /api/health)
app.get(['/health', '/api/health'], (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// System & Media Processing Diagnostics Endpoint (Safe, no secrets)
app.get('/api/system/diagnostics', async (_req: Request, res: Response) => {
  const [ffmpegInfo, ffprobeInfo] = await Promise.all([
    checkBinary('ffmpeg'),
    checkBinary('ffprobe'),
  ]);

  const tempDir = path.resolve(CONFIG.MEDIA_STORAGE_PATH, 'temp');
  let diskInfo: any = { tempDir };
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    if (typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync(tempDir);
      const availableBytes = stats.bavail * stats.bsize;
      const totalBytes = stats.blocks * stats.bsize;
      diskInfo = {
        tempDir,
        availableBytes,
        availableGB: (availableBytes / (1024 * 1024 * 1024)).toFixed(2),
        totalBytes,
        totalGB: (totalBytes / (1024 * 1024 * 1024)).toFixed(2),
        headroomFor3GB: availableBytes > (3.2 * 2.2 * 1024 * 1024 * 1024),
      };
    }
  } catch (err: any) {
    diskInfo.error = err.message;
  }

  let pipelineSelfTest: any = null;
  try {
    const samplePath = path.join(tempDir, "selftest.mp4");
    if (!fs.existsSync(samplePath)) {
      const ffmpegBin = getFfmpegPath();
      execSync(`"${ffmpegBin}" -y -f lavfi -i testsrc=duration=0.1:size=64x64:rate=10 -f lavfi -i sine=frequency=1000:duration=0.1 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "${samplePath}"`, { timeout: 10000, stdio: "ignore" });
    }
    if (fs.existsSync(samplePath)) {
      const analysis = await analyzeMediaFile(samplePath);
      pipelineSelfTest = {
        success: true,
        ffprobeExecuted: true,
        videoCodec: analysis.videoCodec,
        audioCodec: analysis.audioCodec,
        duration: analysis.duration,
        streamsCount: analysis.streams.length,
      };
    }
  } catch (testErr: any) {
    pipelineSelfTest = {
      success: false,
      error: testErr.message,
    };
  }

  res.json({
    status: "ok",
    ffmpeg: ffmpegInfo,
    ffprobe: ffprobeInfo,
    pipelineSelfTest,
    disk: diskInfo,
    storageDriver: CONFIG.STORAGE_DRIVER,
    nodeEnv: CONFIG.NODE_ENV,
  });
});

// Public URL endpoint — the active Cloudflare tunnel URL (or null). The web
// client uses this to build share links that never expose a localhost address.
app.get('/api/system/public-url', async (req: Request, res: Response) => {
  let publicUrl: string | null = null;
  let lanUrl: string | null = null;

  try {
    const authoritative = await tunnelService.getAuthoritativePublicUrl(req);
    if (
      authoritative &&
      !authoritative.includes('localhost') &&
      !authoritative.includes('127.0.0.1') &&
      !authoritative.includes('192.168.') &&
      !authoritative.includes('10.')
    ) {
      publicUrl = authoritative;
    }
  } catch {
    // fallback
  }

  // Detect server LAN IP for local Wi-Fi sharing
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const net of ifaces[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          if (
            net.address.startsWith('192.168.') ||
            net.address.startsWith('10.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(net.address)
          ) {
            lanUrl = `http://${net.address}:${CONFIG.PORT}`;
            break;
          }
        }
      }
      if (lanUrl) break;
    }
  } catch {
    // ignore LAN detection error
  }

  res.json({
    publicUrl: publicUrl || null,
    lanUrl: lanUrl || null,
    tunnelError: publicUrl ? null : tunnelService.getLastTunnelError(),
    tunnelActive: Boolean(publicUrl),
  });
});

// REST Routes
app.use('/api/rooms', roomRoutes);
app.use('/api/media', mediaRoutes);

// Direct media streaming route with byte-range requests
app.all('/media/*', (req: Request, res: Response) => {
  const storageKey = req.params[0];
  if (!storageKey) {
    res.status(400).json({ error: 'Storage key required' });
    return;
  }
  mediaStorage.streamFile(decodeURIComponent(storageKey), req, res);
});

// Serve the built web app from this same process so a single port (and a
// single tunnel) fronts both the site and the sockets. engine.io intercepts
// /socket.io before Express, so the SPA fallback only sees page requests.
const webIndex = path.join(CONFIG.WEB_DIST_PATH, 'index.html');
if (fs.existsSync(webIndex)) {
  app.use(express.static(CONFIG.WEB_DIST_PATH, { index: 'index.html' }));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/media')) {
      return next();
    }
    res.sendFile(webIndex);
  });
}

import { setMediaSocketIO } from './services/media/mediaJobQueue.js';

// Setup Socket.IO Event Handlers
setMediaSocketIO(io);
setupSocketHandlers(io);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('unhandled_server_error', { message: err?.message || 'Unknown error' });
  if (res.headersSent) return;

  const isClientValidation = err.name === 'MulterError' || (err.message && /Invalid video|file size|too large|CORS/i.test(err.message));
  const statusCode = typeof err.status === 'number' ? err.status : (isClientValidation ? 400 : 500);

  res.status(statusCode).json({
    error: isProduction && !isClientValidation ? 'An unexpected server error occurred' : (err.message || 'Internal server error'),
  });
});

let caffeinateProcess: ChildProcess | null = null;
let shuttingDown = false;

function cleanupCaffeinate() {
  if (caffeinateProcess) {
    try {
      caffeinateProcess.kill('SIGTERM');
    } catch { /* already gone */ }
    caffeinateProcess = null;
  }
}

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('shutting_down', { signal });
  try {
    hlsPackager.cancelAllJobs();
    transcodingService.cancelAllJobs();
  } catch {}
  cleanupCaffeinate();
  tunnelService.stop();
  server.close(() => {
    prisma.$disconnect()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
  // Force-exit if open sockets keep the handle alive past a short grace window.
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('exit', () => {
  try {
    hlsPackager.cancelAllJobs();
    transcodingService.cancelAllJobs();
  } catch {}
  cleanupCaffeinate();
  tunnelService.stop();
});

process.on('uncaughtException', (err: any) => {
  logger.error('uncaught_exception', { message: err?.message, stack: err?.stack });
  cleanupCaffeinate();
  tunnelService.stop();
  process.exit(1);
});

// Start server
async function start() {
  await connectDB();

  // Run startup self-check for media processing tools and disk
  try {
    const [ffmpegCheck, ffprobeCheck] = await Promise.all([
      checkBinary('ffmpeg'),
      checkBinary('ffprobe'),
    ]);
    const tempDir = path.resolve(CONFIG.MEDIA_STORAGE_PATH, 'temp');
    let diskAvailGB = 'unknown';
    if (typeof fs.statfsSync === 'function' && fs.existsSync(tempDir)) {
      const stats = fs.statfsSync(tempDir);
      diskAvailGB = (stats.bavail * stats.bsize / (1024 * 1024 * 1024)).toFixed(2);
    }
    logger.info('[StartupDiagnostics]', {
      ffmpeg: ffmpegCheck.available ? ffmpegCheck.version : 'NOT_FOUND',
      ffprobe: ffprobeCheck.available ? ffprobeCheck.version : 'NOT_FOUND',
      diskAvailableGB: diskAvailGB,
    });
  } catch (e: any) {
    logger.warn('[StartupDiagnostics] Check error', { message: e.message });
  }

  // Run startup cleanup of stale temporary files older than 1 hour
  try {
    const cleanupReport = tempFileLifecycle.cleanupStaleTempFiles(3600000);
    if (cleanupReport.deleted > 0) {
      logger.info('Startup temporary file cleanup completed', cleanupReport);
    }
  } catch (err: any) {
    logger.warn('Startup temporary file cleanup error', { message: err.message });
  }

  // Startup cleanup of stale/orphaned rooms
  await roomManager.pruneStaleRooms().catch(() => {});
  setInterval(() => roomManager.pruneStaleRooms().catch(() => {}), 30000).unref();

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason: any) => {
    logger.error('unhandled_rejection', { message: reason?.message || String(reason) });
  });

  process.on('uncaughtException', (err: any) => {
    logger.error('uncaught_exception', { message: err?.message, stack: err?.stack });
  });

  // If the port is already taken, exit cleanly without leaking child processes.
  server.on('error', (err: any) => {
    logger.error('server_error', { message: err?.message });
    cleanupCaffeinate();
    tunnelService.stop();
    process.exit(1);
  });

  server.listen(CONFIG.PORT, () => {
    // Spawn the macOS keep-awake guard only after the server has bound its
    // port, and bind it to the server process pid (-w <pid>) so the OS terminates
    // it automatically even in abnormal aborts.
    if (CONFIG.KEEP_AWAKE && process.platform === 'darwin') {
      try {
        caffeinateProcess = spawn('caffeinate', ['-dims', '-w', String(process.pid)], { stdio: 'ignore' });
        caffeinateProcess.on('error', (err: any) => {
          logger.warn('caffeinate_error', { message: err?.message });
          caffeinateProcess = null;
        });
        logger.info('caffeinate_started', { pid: caffeinateProcess.pid });
      } catch (err: any) {
        logger.warn('caffeinate_failed', { message: err?.message });
      }
    }

    // Start the Cloudflare quick-tunnel discovery loop when requested.
    if (CONFIG.ENABLE_TUNNEL) {
      tunnelService.startDiscovery();
    }

    logger.info('server_started', {
      port: CONFIG.PORT,
      env: CONFIG.NODE_ENV,
      storageDriver: CONFIG.STORAGE_DRIVER,
      tunnel: CONFIG.ENABLE_TUNNEL ? 'enabled' : 'disabled',
    });
  });
}

// Export server & app for testing
export { app, server, io };

if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    logger.error('fatal_startup_error', { message: err.message });
  });
}
