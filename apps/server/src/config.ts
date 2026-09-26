import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [clientUrl];

export const CONFIG = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  CLIENT_URL: clientUrl,
  FRONTEND_URL: clientUrl,
  ALLOWED_ORIGINS: allowedOrigins,
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  
  // Media Storage Configuration
  STORAGE_DRIVER: (process.env.STORAGE_DRIVER || 'local').toLowerCase() as 'local' | 's3',
  MEDIA_STORAGE_PATH: path.resolve(process.cwd(), process.env.MEDIA_STORAGE_PATH || './uploads'),
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || '5120', 10),
  MAX_VIDEO_SIZE_BYTES: parseInt(process.env.MAX_FILE_SIZE_MB || '5120', 10) * 1024 * 1024, // 5,368,709,120 bytes (5 GB)
  
  // S3 / Object Storage Configuration (AWS S3, Cloudflare R2, MinIO, Wasabi)
  S3: {
    BUCKET: process.env.S3_BUCKET || '',
    REGION: process.env.S3_REGION || 'us-east-1',
    ENDPOINT: process.env.S3_ENDPOINT || undefined,
    ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || '',
    SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || '',
    PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL || '', // Optional CDN or CloudFront URL
    FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE === 'true',
  },

  // Redis Configuration for horizontal scaling (optional)
  REDIS_URL: process.env.REDIS_URL || undefined,

  SESSION_SECRET: process.env.SESSION_SECRET || 'syncwatch_dev_session_secret_key_123',
  ROOM_GRACE_PERIOD_MS: 30 * 1000, // 30s before marking participant as offline
  ROOM_EXPIRATION_HOURS: 24, // 24h room lifespan
};
