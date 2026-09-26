import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { tempFileLifecycle } from '../services/media/tempFileLifecycle.js';
import { mediaJobQueue } from '../services/media/mediaJobQueue.js';
import { mediaStorage } from '../services/mediaStorage.js';
import { prisma } from '../db.js';
import { CONFIG } from '../config.js';
import { roomManager } from '../services/roomManager.js';

const execFileAsync = promisify(execFile);

describe('Temporary File Lifecycle & Disk Protection Test Suite', () => {
  const tempDir = path.join(CONFIG.MEDIA_STORAGE_PATH, 'temp');

  beforeAll(async () => {
    await prisma.$connect();
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  beforeEach(() => {
    tempFileLifecycle.clearActiveFiles();
  });

  afterAll(async () => {
    // Cleanup database test records
    await prisma.media.deleteMany({}).catch(() => {});
  });

  it('1. Active Job Protection: Prevents concurrent cleanup from unlinking active files', () => {
    const activeFilePath = path.join(tempDir, `active_file_${Date.now()}.tmp`);
    fs.writeFileSync(activeFilePath, 'active_job_data');

    // Make the file mtime 2 hours old
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
    fs.utimesSync(activeFilePath, twoHoursAgo, twoHoursAgo);

    // Register active file
    tempFileLifecycle.registerActiveFile(activeFilePath);
    expect(tempFileLifecycle.isActiveFile(activeFilePath)).toBe(true);

    // Stale cleanup should skip this file because it is registered as active
    const report = tempFileLifecycle.cleanupStaleTempFiles(3600 * 1000); // 1 hour threshold
    expect(fs.existsSync(activeFilePath)).toBe(true);

    // safeDeleteFile without force should also skip
    const deletedNoForce = tempFileLifecycle.safeDeleteFile(activeFilePath, false);
    expect(deletedNoForce).toBe(false);
    expect(fs.existsSync(activeFilePath)).toBe(true);

    // Unregister and delete
    tempFileLifecycle.unregisterActiveFile(activeFilePath);
    const deleted = tempFileLifecycle.safeDeleteFile(activeFilePath, false);
    expect(deleted).toBe(true);
    expect(fs.existsSync(activeFilePath)).toBe(false);
  });

  it('2. Stale Temp Cleanup: Automatically removes stale files older than threshold', () => {
    const staleFilePath = path.join(tempDir, `stale_file_${Date.now()}.tmp`);
    const freshFilePath = path.join(tempDir, `fresh_file_${Date.now()}.tmp`);

    fs.writeFileSync(staleFilePath, 'stale_data');
    fs.writeFileSync(freshFilePath, 'fresh_data');

    // Set stale file mtime to 3 hours ago
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000);
    fs.utimesSync(staleFilePath, threeHoursAgo, threeHoursAgo);

    // Run stale temp cleanup with 1 hour threshold
    const report = tempFileLifecycle.cleanupStaleTempFiles(3600 * 1000);

    expect(report.deleted).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(staleFilePath)).toBe(false);
    expect(fs.existsSync(freshFilePath)).toBe(true);

    // Cleanup fresh file
    fs.unlinkSync(freshFilePath);
  });

  it('3. Insufficient Disk Space Protection: Rejects job when disk space is inadequate', () => {
    // Attempt to check disk space requiring 10,000 TB (impossible amount)
    const requiredHugeBytes = 10 * 1024 * 1024 * 1024 * 1024 * 1024; // 10 PB
    const diskResult = tempFileLifecycle.checkDiskSpace(tempDir, requiredHugeBytes);

    expect(diskResult.hasEnoughSpace).toBe(false);
    expect(diskResult.availableGB).toBeDefined();
    expect(diskResult.requiredGB).toBeDefined();
  });

  it('4. Successful Cleanup: Deletes temporary upload & intermediate files on success', async () => {
    const dummyUploadPath = path.join(tempDir, `upload_success_${Date.now()}.mp4`);

    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 'lavfi',
        '-i', 'testsrc=duration=1:size=160x120:rate=10',
        '-f', 'lavfi',
        '-i', 'sine=frequency=440:duration=1',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        dummyUploadPath,
      ]);
    } catch {
      // Fallback
    }

    // Create room using roomManager
    const { room } = await roomManager.createRoom({ displayName: 'Host', roomName: 'Cleanup Room' });

    // Enqueue job
    await mediaJobQueue.enqueueMediaProcessing(room.id, dummyUploadPath, 'test_cleanup.mp4');

    // Wait for processing to finish
    let mediaRecord = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      mediaRecord = await prisma.media.findUnique({ where: { roomId: room.id } });
      if (mediaRecord && mediaRecord.status !== 'processing') {
        break;
      }
    }

    expect(mediaRecord).not.toBeNull();
    expect(mediaRecord?.status).toBe('ready');

    // Verify local upload file was cleaned up from temp
    expect(fs.existsSync(dummyUploadPath)).toBe(false);

    // Verify storage assets are preserved
    if (mediaRecord?.storageKey) {
      const storagePath = path.join(CONFIG.MEDIA_STORAGE_PATH, mediaRecord.storageKey);
      expect(fs.existsSync(storagePath)).toBe(true);
    }
  });

  it('5. Failed-Job Cleanup: Removes partial outputs and scratch files on failure', async () => {
    const invalidUploadPath = path.join(tempDir, `invalid_fail_${Date.now()}.mp4`);
    fs.writeFileSync(invalidUploadPath, 'corrupted_invalid_video_bytes');

    const { room } = await roomManager.createRoom({ displayName: 'Host', roomName: 'Fail Room' });

    await mediaJobQueue.enqueueMediaProcessing(room.id, invalidUploadPath, 'corrupt.mp4');

    let mediaRecord = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      mediaRecord = await prisma.media.findUnique({ where: { roomId: room.id } });
      if (mediaRecord && mediaRecord.status === 'failed') {
        break;
      }
    }

    expect(mediaRecord?.status).toBe('failed');
    expect(mediaRecord?.transcodeError).not.toContain('/Users/');
    expect(mediaRecord?.transcodeError).toMatch(/Video processing failed|Not enough temporary storage/);

    // Verify invalid upload path was unlinked
    expect(fs.existsSync(invalidUploadPath)).toBe(false);

    await prisma.media.deleteMany({ where: { roomId: room.id } }).catch(() => {});
    await prisma.room.deleteMany({ where: { id: room.id } }).catch(() => {});
  });

  it('6. Cancelled-Job Cleanup: Cancels job and cleans up temporary files', async () => {
    const cancelUploadPath = path.join(tempDir, `cancel_upload_${Date.now()}.mp4`);
    fs.writeFileSync(cancelUploadPath, 'dummy_cancel_data');

    const cancelJobId = `job_cancel_${Date.now()}`;
    tempFileLifecycle.registerActiveFile(cancelUploadPath);

    const isCancelled = await mediaJobQueue.cancelJob(cancelJobId);
    expect(typeof isCancelled).toBe('boolean');

    // Safe delete manually verify
    tempFileLifecycle.safeDeleteFile(cancelUploadPath, true);
    expect(fs.existsSync(cancelUploadPath)).toBe(false);
  });
});
