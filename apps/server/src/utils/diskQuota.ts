import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

export function getDirectorySizeBytes(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          total += getDirectorySizeBytes(fullPath);
        } else if (entry.isFile()) {
          const stats = fs.statSync(fullPath);
          total += stats.size;
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  } catch {
    // Skip if directory read fails
  }
  return total;
}

export interface QuotaCheckResult {
  allowed: boolean;
  usedBytes: number;
  usedGB: string;
  maxGB: string;
  error?: string;
}

/**
 * Validates that an incoming upload will not breach the server's total uploads disk quota
 * (default 20 GB) or drive physical disk space below safety limits (2 GB free headroom).
 */
export function checkUploadDiskQuota(incomingBytes = 0): QuotaCheckResult {
  const usedBytes = getDirectorySizeBytes(CONFIG.MEDIA_STORAGE_PATH);
  const maxBytes = CONFIG.MAX_TOTAL_STORAGE_BYTES;

  if (usedBytes + incomingBytes > maxBytes) {
    return {
      allowed: false,
      usedBytes,
      usedGB: (usedBytes / (1024 * 1024 * 1024)).toFixed(2),
      maxGB: (maxBytes / (1024 * 1024 * 1024)).toFixed(0),
      error: `Storage quota exceeded: uploads are currently using ${(usedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB of ${CONFIG.MAX_TOTAL_STORAGE_GB} GB allowed limit.`,
    };
  }

  // Free disk safety check on the host volume
  if (typeof (fs as any).statfsSync === 'function') {
    try {
      const stats = (fs as any).statfsSync(CONFIG.MEDIA_STORAGE_PATH);
      const freeBytes = stats.bavail * stats.bsize;
      // Require at least 2 GB of physical free space to protect OS and server stability
      if (freeBytes < 2 * 1024 * 1024 * 1024) {
        return {
          allowed: false,
          usedBytes,
          usedGB: (usedBytes / (1024 * 1024 * 1024)).toFixed(2),
          maxGB: (maxBytes / (1024 * 1024 * 1024)).toFixed(0),
          error: `Disk storage exhausted: host machine has under 2 GB free disk space available. Upload rejected to preserve server stability.`,
        };
      }
    } catch {
      // statfsSync failure is non-fatal; quota limit check above still applies
    }
  }

  return {
    allowed: true,
    usedBytes,
    usedGB: (usedBytes / (1024 * 1024 * 1024)).toFixed(2),
    maxGB: (maxBytes / (1024 * 1024 * 1024)).toFixed(0),
  };
}
