import fs from 'fs';
import path from 'path';
import { CONFIG } from '../../config.js';
import { logger } from '../../utils/logger.js';

export interface DiskSpaceCheckResult {
  availableBytes: number;
  availableGB: string;
  requiredBytes: number;
  requiredGB: string;
  hasEnoughSpace: boolean;
}

export class TempFileLifecycle {
  private activeJobFiles: Set<string> = new Set();

  /**
   * Normalizes a file path for consistent set lookup.
   */
  private normalizePath(filePath: string): string {
    return path.resolve(filePath);
  }

  /**
   * Registers a file path as active to prevent concurrent cleanup from deleting it.
   */
  registerActiveFile(filePath: string | null | undefined): void {
    if (!filePath) return;
    const normalized = this.normalizePath(filePath);
    this.activeJobFiles.add(normalized);
  }

  /**
   * Unregisters a file path when its job finishes, fails, or cancels.
   */
  unregisterActiveFile(filePath: string | null | undefined): void {
    if (!filePath) return;
    const normalized = this.normalizePath(filePath);
    this.activeJobFiles.delete(normalized);
  }

  /**
   * Checks if a file path is currently registered to an active job.
   */
  isActiveFile(filePath: string | null | undefined): boolean {
    if (!filePath) return false;
    const normalized = this.normalizePath(filePath);
    return this.activeJobFiles.has(normalized);
  }

  /**
   * Returns a copy of all active job file paths.
   */
  getActiveJobFiles(): Set<string> {
    return new Set(this.activeJobFiles);
  }

  /**
   * Clears all registered active job files (used in testing cleanup).
   */
  clearActiveFiles(): void {
    this.activeJobFiles.clear();
  }

  /**
   * Safely deletes a temporary file if it exists.
   * If force is false, skips deletion if the file is registered as active.
   */
  safeDeleteFile(filePath: string | null | undefined, force = false): boolean {
    if (!filePath) return false;
    try {
      const normalized = this.normalizePath(filePath);
      if (!force && this.activeJobFiles.has(normalized)) {
        logger.info('Skipping deletion of active job file', { filePath: normalized });
        return false;
      }
      if (fs.existsSync(normalized)) {
        fs.unlinkSync(normalized);
        logger.info('Deleted temporary file', { filePath: normalized });
        return true;
      }
    } catch (err: any) {
      logger.warn('Failed to delete temporary file', { filePath, error: err.message });
    }
    return false;
  }

  /**
   * Scans the temporary storage directory for stale files older than maxAgeMs and unlinks them.
   * Ignores any active job files and permanent storage assets.
   */
  cleanupStaleTempFiles(maxAgeMs = 3600000): { scanned: number; deleted: number; bytesFreed: number } {
    const tempDir = path.join(CONFIG.MEDIA_STORAGE_PATH, 'temp');
    let scanned = 0;
    let deleted = 0;
    let bytesFreed = 0;

    if (!fs.existsSync(tempDir)) {
      return { scanned, deleted, bytesFreed };
    }

    const now = Date.now();

    try {
      const entries = fs.readdirSync(tempDir);
      for (const entry of entries) {
        const fullPath = path.join(tempDir, entry);
        const normalized = this.normalizePath(fullPath);

        // Never delete active job files
        if (this.activeJobFiles.has(normalized)) {
          continue;
        }

        try {
          const stat = fs.statSync(normalized);
          if (stat.isFile()) {
            scanned++;
            const ageMs = now - stat.mtimeMs;
            if (ageMs >= maxAgeMs) {
              const size = stat.size;
              fs.unlinkSync(normalized);
              deleted++;
              bytesFreed += size;
              logger.info('Cleaned up stale temp file', {
                file: entry,
                ageMinutes: (ageMs / 60000).toFixed(1),
                sizeBytes: size,
              });
            }
          }
        } catch {
          // ignore individual file errors
        }
      }
    } catch (err: any) {
      logger.error('Error scanning temp directory for stale files', { error: err.message });
    }

    return { scanned, deleted, bytesFreed };
  }

  /**
   * Pre-checks available disk space against required processing space.
   * Prints required logs:
   * [Media] Disk available: X GB
   * [Media] Required temporary space: Y GB
   * [Media] Starting processing...
   */
  checkDiskSpace(targetDir: string, requiredBytes: number): DiskSpaceCheckResult {
    const dir = path.resolve(targetDir);
    let availableBytes = Number.MAX_SAFE_INTEGER;

    try {
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync(dir);
        availableBytes = stats.bavail * stats.bsize;
      }
    } catch (err: any) {
      logger.warn('statfsSync unavailable or failed', { error: err.message });
    }

    const availableGB = (availableBytes / (1024 * 1024 * 1024)).toFixed(2);
    const requiredGB = (requiredBytes / (1024 * 1024 * 1024)).toFixed(2);

    logger.info(`[Media] Disk available: ${availableGB} GB`);
    logger.info(`[Media] Required temporary space: ${requiredGB} GB`);

    const hasEnoughSpace = availableBytes >= requiredBytes;

    if (hasEnoughSpace) {
      logger.info('[Media] Starting processing...');
    } else {
      logger.error('[Media] Insufficient disk space for processing job', {
        availableGB,
        requiredGB,
      });
    }

    return {
      availableBytes,
      availableGB,
      requiredBytes,
      requiredGB,
      hasEnoughSpace,
    };
  }
}

export const tempFileLifecycle = new TempFileLifecycle();
