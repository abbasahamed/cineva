import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { CONFIG } from './config.js';
import { connectDB } from './db.js';
import roomRoutes from './routes/roomRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import { mediaStorage } from './services/mediaStorage.js';
import { setupSocketHandlers } from './sockets/socketHandler.js';
import { logger } from './utils/logger.js';

// BigInt JSON serialization polyfill to prevent JSON.stringify errors
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();
const server = http.createServer(app);

const isProduction = CONFIG.NODE_ENV === 'production';

// CORS Origin Check
function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // allow non-browser requests or same-origin
  if (!isProduction) {
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return true;
    }
  }
  return CONFIG.ALLOWED_ORIGINS.includes(origin) || CONFIG.ALLOWED_ORIGINS.includes('*');
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

// Security Headers per Section 11
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

// Express CORS Configuration per Section 10
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
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global Rate Limiter for API endpoints per Section 12
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per IP
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Dedicated Rate Limiter for Room Creation to prevent room spam
const roomCreationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30, // 30 rooms per IP per 10 mins
  message: { error: 'Too many rooms created recently. Please wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Dedicated Rate Limiter for Room Joining to protect against brute-force room code guessing
const roomJoinLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 60, // 60 join attempts per IP per 5 mins
  message: { error: 'Too many join attempts. Please wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/rooms', (req, res, next) => {
  if (req.method === 'POST') {
    if (req.path.endsWith('/join')) {
      return roomJoinLimiter(req, res, next);
    }
    return roomCreationLimiter(req, res, next);
  }
  next();
});

// Health check endpoints (supports both /health and /api/health)
app.get(['/health', '/api/health'], (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// REST Routes
app.use('/api/rooms', roomRoutes);
app.use('/api/media', mediaRoutes);

// Direct media streaming route with byte-range requests
app.get('/media/*', (req: Request, res: Response) => {
  const storageKey = req.params[0];
  if (!storageKey) {
    res.status(400).json({ error: 'Storage key required' });
    return;
  }
  mediaStorage.streamFile(decodeURIComponent(storageKey), req, res);
});

import { setMediaSocketIO } from './services/media/mediaJobQueue.js';

// Setup Socket.IO Event Handlers
setMediaSocketIO(io);
setupSocketHandlers(io);

// Production Safe Error Handling Middleware per Section 19
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('unhandled_server_error', { message: err?.message || 'Unknown error' });
  if (res.headersSent) return;

  const isClientValidation = err.name === 'MulterError' || (err.message && /Invalid video|file size|too large|CORS/i.test(err.message));
  const statusCode = typeof err.status === 'number' ? err.status : (isClientValidation ? 400 : 500);

  res.status(statusCode).json({
    error: isProduction && !isClientValidation ? 'An unexpected server error occurred' : (err.message || 'Internal server error'),
  });
});

import { tempFileLifecycle } from './services/media/tempFileLifecycle.js';

// Start server
async function start() {
  await connectDB();

  // Run startup cleanup of stale temporary files older than 1 hour
  try {
    const cleanupReport = tempFileLifecycle.cleanupStaleTempFiles(3600000);
    if (cleanupReport.deleted > 0) {
      logger.info('Startup temporary file cleanup completed', cleanupReport);
    }
  } catch (err: any) {
    logger.warn('Startup temporary file cleanup error', { message: err.message });
  }

  server.listen(CONFIG.PORT, () => {
    logger.info('server_started', {
      port: CONFIG.PORT,
      env: CONFIG.NODE_ENV,
      storageDriver: CONFIG.STORAGE_DRIVER,
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
