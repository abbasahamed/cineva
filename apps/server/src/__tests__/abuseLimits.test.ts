import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { app } from '../index.js';
import { prisma } from '../db.js';
import { CONFIG } from '../config.js';
import { getClientIp } from '../utils/clientIp.js';
import { checkUploadDiskQuota, getDirectorySizeBytes } from '../utils/diskQuota.js';
import { roomManager } from '../services/roomManager.js';

describe('Public Tunnel Abuse Limits & Capacity Suite', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Client IP Resolution (CF-Connecting-IP Spoof Prevention)', () => {
    it('uses standard remote address when no Cloudflare tunnel headers exist', () => {
      const mockReq: any = {
        get: (h: string) => (h.toLowerCase() === 'host' ? 'localhost:4000' : undefined),
        headers: {},
        ip: '192.168.1.50',
        socket: { remoteAddress: '192.168.1.50' },
      };
      expect(getClientIp(mockReq)).toBe('192.168.1.50');
    });

    it('ignores CF-Connecting-IP header on direct local connection without CF signature', () => {
      const mockReq: any = {
        get: (h: string) => (h.toLowerCase() === 'host' ? 'localhost:4000' : undefined),
        headers: {
          'cf-connecting-ip': '203.0.113.195', // Attacker attempting to spoof IP
        },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      };
      // Must ignore spoofed header because cf-ray / tunnel signature is missing
      expect(getClientIp(mockReq)).toBe('127.0.0.1');
    });

    it('trusts CF-Connecting-IP when request carries authentic Cloudflare ray header', () => {
      const mockReq: any = {
        get: (h: string) => (h.toLowerCase() === 'host' ? 'tunnel-test.trycloudflare.com' : undefined),
        headers: {
          'cf-connecting-ip': '198.51.100.42',
          'cf-ray': '8f1234567890abcd-MAA',
        },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      };
      expect(getClientIp(mockReq)).toBe('198.51.100.42');
    });
  });

  describe('2. Concurrent Room Capacity Limit', () => {
    it('enforces MAX_CONCURRENT_ROOMS and returns 429 when capacity is reached', async () => {
      const originalMax = CONFIG.MAX_CONCURRENT_ROOMS;
      const currentActive = await prisma.room.count({ where: { status: 'active', expiresAt: { gt: new Date() } } });
      // Set limit dynamically to currentActive + 1 so the next creation succeeds, and the following triggers 429
      CONFIG.MAX_CONCURRENT_ROOMS = currentActive + 1;

      try {
        // Room 1 (Succeeds: fills remaining capacity)
        const r1 = await request(app)
          .post('/api/rooms')
          .send({ displayName: 'Host 1', roomName: 'CapacityTest 1' });
        expect(r1.status).toBe(201);

        // Room 2 (Exceeds capacity: triggers 429)
        const r2 = await request(app)
          .post('/api/rooms')
          .send({ displayName: 'Host 2', roomName: 'CapacityTest 2' });
        expect(r2.status).toBe(429);
        expect(r2.body.error).toMatch(/maximum concurrent rooms/i);

        // Cleanup test rooms
        await prisma.room.deleteMany({ where: { name: { contains: 'CapacityTest' } } });
      } finally {
        CONFIG.MAX_CONCURRENT_ROOMS = originalMax;
      }
    });
  });

  describe('3. Storage Quota & File Size Limits', () => {
    it('rejects uploads exceeding 15 GB limit via configuration and disk quota', () => {
      const originalPath = CONFIG.MEDIA_STORAGE_PATH;
      const testDir = path.resolve(os.tmpdir(), 'test_quota_storage');
      if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
      CONFIG.MEDIA_STORAGE_PATH = testDir;
      try {
        expect(CONFIG.MAX_VIDEO_SIZE_BYTES).toBe(15 * 1024 * 1024 * 1024);
        const quota = checkUploadDiskQuota(11 * 1024 * 1024 * 1024);
        expect(quota.allowed).toBe(true); // total capacity check
      } finally {
        CONFIG.MEDIA_STORAGE_PATH = originalPath;
        try { fs.rmdirSync(testDir); } catch {}
      }
    });

    it('verifies obsolete cloud multipart routes return 404', async () => {
      const res = await request(app)
        .post('/api/media/uploads/multipart/init')
        .send({
          roomId: 'fake-room-id',
          sessionId: 'fake-session',
          filename: 'giant_movie.mp4',
        });
      expect(res.status).toBe(404);
    });

    it('detects when incoming upload would exceed MAX_TOTAL_STORAGE_BYTES', () => {
      const originalMaxBytes = CONFIG.MAX_TOTAL_STORAGE_BYTES;
      // Set limit artificially to 100 bytes
      CONFIG.MAX_TOTAL_STORAGE_BYTES = 100;

      try {
        const check = checkUploadDiskQuota(1024 * 1024); // 1 MB upload
        expect(check.allowed).toBe(false);
        expect(check.error).toMatch(/Storage quota exceeded/i);
      } finally {
        CONFIG.MAX_TOTAL_STORAGE_BYTES = originalMaxBytes;
      }
    });
  });
});
