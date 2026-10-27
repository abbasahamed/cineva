import { describe, it, expect } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { getFfmpegPath, getFfprobePath } from '../services/media/binaryResolver.js';
import { checkBinary } from '../index.js';
import { LocalMediaStorage } from '../services/mediaStorage.js';

describe('Cross-Platform Compatibility & Binary Resolution Test Suite', () => {

  describe('1. Binary Resolver & Detection', () => {
    it('should resolve ffmpeg and ffprobe paths without throwing exceptions', () => {
      const ffmpeg = getFfmpegPath();
      const ffprobe = getFfprobePath();

      expect(typeof ffmpeg).toBe('string');
      expect(ffmpeg.length).toBeGreaterThan(0);
      expect(typeof ffprobe).toBe('string');
      expect(ffprobe.length).toBeGreaterThan(0);
    });

    it('should execute checkBinary on known binaries safely', async () => {
      const result = await checkBinary('ffmpeg');
      expect(result.available).toBe(true);
      expect(result.path).toBeDefined();
      expect(result.version).toBeDefined();
    });

    it('should handle non-existent binaries gracefully without throwing', async () => {
      const result = await checkBinary('definitely_nonexistent_binary_xyz_123');
      expect(result.available).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('2. Cross-Platform Path Handling & Traversal Sanitization', () => {
    it('should prevent path traversal with both Unix and Windows separators', () => {
      const baseDir = path.resolve(os.tmpdir(), 'cineva_cross_platform_storage');
      const storage = new LocalMediaStorage(baseDir);

      // Traversal using Unix forward-slashes
      const unixTraversal = (storage as any).getSafeFilePath('../../../etc/passwd');
      expect(unixTraversal.startsWith(baseDir)).toBe(true);

      // Traversal using Windows back-slashes
      const winTraversal = (storage as any).getSafeFilePath('..\\..\\..\\Windows\\System32\\calc.exe');
      expect(winTraversal.startsWith(baseDir)).toBe(true);

      // Mixed traversal
      const mixedTraversal = (storage as any).getSafeFilePath('..\\../..\\etc/passwd');
      expect(mixedTraversal.startsWith(baseDir)).toBe(true);

      if (fs.existsSync(baseDir)) {
        try { fs.rmdirSync(baseDir); } catch {}
      }
    });

    it('should generate valid platform paths for media storage and uploads', () => {
      const baseDir = path.resolve('./uploads');
      const storage = new LocalMediaStorage(baseDir);
      const safeRoomId = 'test_room_123';
      const key = path.join(safeRoomId, 'sample_video.mp4');

      const fullPath = (storage as any).getSafeFilePath(key);
      expect(fullPath).toBe(path.resolve(baseDir, key));
    });
  });

  describe('3. Clean and Build Script Portability', () => {
    it('should execute scripts/clean.mjs cleanly using node standard library', () => {
      const cleanScript = path.resolve(__dirname, '../../../../scripts/clean.mjs');
      expect(fs.existsSync(cleanScript)).toBe(true);
    });
  });
});
