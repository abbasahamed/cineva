import path from "path";
import dotenv from "dotenv";

dotenv.config();

const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [clientUrl];

const cleanEnv = (val: string | undefined): string => {
  return (val || "").trim().replace(/^[\"']|[\"']$/g, "");
};

const s3Bucket = cleanEnv(process.env.B2_BUCKET || process.env.S3_BUCKET || process.env.BUCKET_NAME);
const s3Region = cleanEnv(process.env.B2_REGION || process.env.S3_REGION || process.env.AWS_REGION || "us-east-1");
const rawEndpoint = cleanEnv(process.env.B2_ENDPOINT || process.env.S3_ENDPOINT);
const s3Endpoint = rawEndpoint || undefined;
const s3AccessKeyId = cleanEnv(
  process.env.B2_KEY_ID ||
  process.env.B2_ACCESS_KEY_ID ||
  process.env.keyID ||
  process.env.KEY_ID ||
  process.env.S3_ACCESS_KEY_ID ||
  process.env.AWS_ACCESS_KEY_ID
);
const s3SecretAccessKey = cleanEnv(
  process.env.B2_APPLICATION_KEY ||
  process.env.B2_APP_KEY ||
  process.env.applicationKey ||
  process.env.APPLICATION_KEY ||
  process.env.B2_SECRET_ACCESS_KEY ||
  process.env.S3_SECRET_ACCESS_KEY ||
  process.env.AWS_SECRET_ACCESS_KEY
);
const s3PublicBaseUrl = cleanEnv(process.env.B2_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL);
const s3ForcePathStyle = cleanEnv(process.env.B2_FORCE_PATH_STYLE || process.env.S3_FORCE_PATH_STYLE) === "true";

const rawDriver = (process.env.STORAGE_DRIVER || "").toLowerCase();
const nodeEnv = process.env.NODE_ENV || "development";

// If STORAGE_DRIVER is explicitly set, honor it. Otherwise, if B2/S3 bucket is configured in production, use s3.
const storageDriver: "local" | "s3" = rawDriver === "s3" || rawDriver === "local"
  ? rawDriver
  : (nodeEnv === "production" && s3Bucket ? "s3" : "local");

export const CONFIG = {
  PORT: parseInt(process.env.PORT || "4000", 10),
  NODE_ENV: nodeEnv,
  CLIENT_URL: clientUrl,
  FRONTEND_URL: clientUrl,
  ALLOWED_ORIGINS: allowedOrigins,
  DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db",
  
  // Media Storage Configuration
  STORAGE_DRIVER: storageDriver,
  MEDIA_STORAGE_PATH: path.resolve(process.cwd(), process.env.MEDIA_STORAGE_PATH || "./uploads"),
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || "5120", 10),
  MAX_VIDEO_SIZE_BYTES: parseInt(process.env.MAX_FILE_SIZE_MB || "5120", 10) * 1024 * 1024, // 5,368,709,120 bytes (5 GB)
  
  // S3 / Backblaze B2 Object Storage Configuration
  S3: {
    BUCKET: s3Bucket,
    REGION: s3Region,
    ENDPOINT: s3Endpoint,
    ACCESS_KEY_ID: s3AccessKeyId,
    SECRET_ACCESS_KEY: s3SecretAccessKey,
    PUBLIC_BASE_URL: s3PublicBaseUrl,
    FORCE_PATH_STYLE: s3ForcePathStyle,
  },

  // Backblaze B2 alias references
  B2: {
    BUCKET: s3Bucket,
    REGION: s3Region,
    ENDPOINT: s3Endpoint,
    KEY_ID: s3AccessKeyId,
    APPLICATION_KEY: s3SecretAccessKey,
    PUBLIC_BASE_URL: s3PublicBaseUrl,
    FORCE_PATH_STYLE: s3ForcePathStyle,
  },

  // Redis Configuration for horizontal scaling (optional)
  REDIS_URL: process.env.REDIS_URL || undefined,

  SESSION_SECRET: process.env.SESSION_SECRET || "syncwatch_dev_session_secret_key_123",
  ROOM_GRACE_PERIOD_MS: 30 * 1000, // 30s before marking participant as offline
  ROOM_EXPIRATION_HOURS: 24, // 24h room lifespan
};

// Validate required storage configuration in production when S3 driver is selected
export function validateStorageConfig(): void {
  if (CONFIG.STORAGE_DRIVER === "s3") {
    const missing: string[] = [];
    if (!CONFIG.S3.BUCKET) missing.push("B2_BUCKET (or S3_BUCKET)");
    if (!CONFIG.S3.ACCESS_KEY_ID) missing.push("B2_KEY_ID (or S3_ACCESS_KEY_ID)");
    if (!CONFIG.S3.SECRET_ACCESS_KEY) missing.push("B2_APPLICATION_KEY (or S3_SECRET_ACCESS_KEY)");
    if (!CONFIG.S3.ENDPOINT) missing.push("B2_ENDPOINT (or S3_ENDPOINT)");
    if (missing.length > 0) {
      const msg = "[Storage Config Error] Missing required Backblaze B2 / S3 environment variables: " + missing.join(", ");
      if (CONFIG.NODE_ENV === "production") {
        throw new Error(msg);
      } else {
        console.warn(msg + ". Falling back to local storage driver.");
        (CONFIG as any).STORAGE_DRIVER = "local";
      }
    }
  }
}
