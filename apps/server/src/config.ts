import path from "path";
import dotenv from "dotenv";

dotenv.config();

const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [clientUrl];

const nodeEnv = process.env.NODE_ENV || "development";

export const CONFIG = {
  PORT: parseInt(process.env.PORT || "4000", 10),
  NODE_ENV: nodeEnv,
  CLIENT_URL: clientUrl,
  FRONTEND_URL: clientUrl,
  ALLOWED_ORIGINS: allowedOrigins,
  DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db",
  
  // Abuse prevention limits & capacity controls
  MAX_CONCURRENT_ROOMS: parseInt(process.env.MAX_CONCURRENT_ROOMS || (nodeEnv === "test" ? "100" : nodeEnv === "development" ? "100" : "50"), 10),
  MAX_TOTAL_STORAGE_GB: parseInt(process.env.MAX_TOTAL_STORAGE_GB || "40", 10),
  MAX_TOTAL_STORAGE_BYTES: parseInt(process.env.MAX_TOTAL_STORAGE_GB || "40", 10) * 1024 * 1024 * 1024,

  // Media Storage Configuration (Local disk storage exclusively)
  STORAGE_DRIVER: "local" as const,
  MEDIA_STORAGE_PATH: path.resolve(process.cwd(), process.env.MEDIA_STORAGE_PATH || "./uploads"),
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || "10240", 10),
  MAX_VIDEO_SIZE_BYTES: parseInt(process.env.MAX_FILE_SIZE_MB || "10240", 10) * 1024 * 1024, // 10,737,418,240 bytes (10 GB)

  // Redis Configuration for horizontal scaling (optional)
  REDIS_URL: process.env.REDIS_URL || undefined,

  ROOM_GRACE_PERIOD_MS: 30 * 1000, // 30s before marking participant as offline
  ROOM_INACTIVE_TIMEOUT_MS: 10 * 60 * 1000, // 10 minutes inactive room & media eviction
  ROOM_EXPIRATION_HOURS: 24, // 24h room lifespan

  // Single-port serving & networking
  ENABLE_TUNNEL: process.env.ENABLE_TUNNEL !== undefined
    ? process.env.ENABLE_TUNNEL.toLowerCase() === "true"
    : nodeEnv !== "test",
  KEEP_AWAKE: (process.env.KEEP_AWAKE || "true").toLowerCase() === "true",
  // Absolute path to the built web app; served from this process so one
  // port (and one tunnel) fronts both the site and the sockets.
  WEB_DIST_PATH: path.resolve(__dirname, "..", "..", "web", "dist"),
};
