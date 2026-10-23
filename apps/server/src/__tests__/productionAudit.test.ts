import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { app, server } from '../index.js';
import { prisma } from '../db.js';
import { mediaStorage } from '../services/mediaStorage.js';
import { SOCKET_EVENTS } from '@cineva/shared';

describe('Phase 7 Production Audit & Security Test Suite', () => {
  let serverUrl: string;
  let roomCode: string;
  let roomId: string;
  let hostSessionId: string;
  let guestSessionId: string;

  let didStartServer = false;

  beforeAll(async () => {
    await prisma.$connect();
    mediaStorage.ensureDemoMedia();
    // Ensure HTTP / WebSocket server is actively listening
    if (!server.listening) {
      await new Promise<void>((resolve) => {
        server.listen(4056, () => resolve());
      });
      didStartServer = true;
      serverUrl = 'http://localhost:4056';
    } else {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : 4000;
      serverUrl = `http://localhost:${port}`;
    }

    // Create a room via API
    const res = await request(app)
      .post('/api/rooms')
      .send({ displayName: 'Audit Host', roomName: 'Production Audit Room', allowGuestControl: false });

    expect(res.status).toBe(201);
    roomCode = res.body.room.roomCode;
    roomId = res.body.room.id;
    hostSessionId = res.body.hostSessionId;

    // Join guest via API
    const guestRes = await request(app)
      .post(`/api/rooms/${roomCode}/join`)
      .send({ displayName: 'Audit Guest' });

    expect(guestRes.status).toBe(200);
    guestSessionId = guestRes.body.sessionId;
  });

  afterAll(async () => {
    if (roomId) {
      await prisma.room.deleteMany({ where: { id: roomId } });
    }
    if (didStartServer && server.listening) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    await prisma.$disconnect();
  });

  // 1. Health Endpoint Test per Section 7
  it('GET /api/health should return status ok without stack traces or secrets', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.body.DATABASE_URL).toBeUndefined();
    expect(res.body.SESSION_SECRET).toBeUndefined();
  });

  // 2. Security Headers Test per Section 12
  it('Should set Helmet security headers (CSP, X-Content-Type-Options, Frame-Options, Referrer-Policy)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  // 3. CORS Allowed vs Disallowed Origin Test per Section 11
  it('Should accept allowed origins and reject forbidden CORS origins', async () => {
    const allowedRes = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(allowedRes.status).toBe(200);
    expect(allowedRes.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const forbiddenRes = await request(app)
      .get('/api/health')
      .set('Origin', 'http://malicious-hacker-site.com');
    // Express cors middleware returns 500 error on CORS rejection or omits ACAO
    expect(forbiddenRes.headers['access-control-allow-origin']).toBeUndefined();
  });

  // 4. Upload Security & 5 GB Limit Test
  it('Should enforce upload file extension & MIME whitelisting, sanitize traversal filenames, and enforce 5 GB limit', async () => {
    // A. Verify 5 GB binary constant configuration (5 * 1024 * 1024 * 1024 = 5,368,709,120 bytes)
    const { MAX_VIDEO_SIZE_BYTES, MAX_VIDEO_SIZE_MB, MAX_VIDEO_SIZE_LABEL } = await import('@cineva/shared');
    expect(MAX_VIDEO_SIZE_BYTES).toBe(5 * 1024 * 1024 * 1024);
    expect(MAX_VIDEO_SIZE_BYTES).toBe(5368709120);
    expect(MAX_VIDEO_SIZE_MB).toBe(5120);
    expect(MAX_VIDEO_SIZE_LABEL).toBe('5GB');

    // B. Malicious executable should be rejected
    const badFileRes = await request(app)
      .post('/api/media/upload')
      .field('roomId', roomId)
      .field('sessionId', hostSessionId)
      .attach('video', Buffer.from('malicious script'), 'attack.exe');

    expect(badFileRes.status).toBe(400);
    expect(badFileRes.body.error).toMatch(/Invalid video extension/i);

    // C. Path traversal filename should be sanitized cleanly
    const traversalRes = await request(app)
      .post('/api/media/upload')
      .field('roomId', roomId)
      .field('sessionId', hostSessionId)
      .attach('video', Buffer.from('AAAA', 'utf-8'), '../../etc/passwd.mp4');

    expect(traversalRes.status).toBe(201);
    expect(traversalRes.body.filename).not.toContain('..');
    expect(traversalRes.body.filename).toBe('passwd.mp4');

    // D. Non-host upload should be rejected
    const nonHostRes = await request(app)
      .post('/api/media/upload')
      .field('roomId', roomId)
      .field('sessionId', guestSessionId)
      .attach('video', Buffer.from('AAAA', 'utf-8'), 'guest_video.mp4');

    expect(nonHostRes.status).toBe(403);
    expect(nonHostRes.body.error).toMatch(/Only the host is authorized/i);

    // E. Legitimate MKV files with common MIME variants (video/x-matroska, video/mkv, application/octet-stream) should be accepted cleanly
    const mkvMimes = ['video/x-matroska', 'video/mkv', 'application/x-matroska', 'application/octet-stream'];
    for (const mime of mkvMimes) {
      const mkvRes = await request(app)
        .post('/api/media/upload')
        .field('roomId', roomId)
        .field('sessionId', hostSessionId)
        .attach('video', Buffer.from('1234567890', 'utf-8'), {
          filename: 'sample_movie.mkv',
          contentType: mime,
        });

      expect(mkvRes.status).toBe(201);
      expect(mkvRes.body.filename).toBe('sample_movie.mkv');
      expect(mkvRes.body.status).toBe('processing');
    }
  });

  // 5. Media Byte-Range Streaming Test per Section 18
  it('Should support HTTP 206 Partial Content range requests for video streaming', async () => {
    const res = await request(app)
      .get('/media/demo/sample_video.mp4')
      .set('Range', 'bytes=0-99');

    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toMatch(/^bytes 0-99\//);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-type']).toBe('video/mp4');
  });

  // 6. WebSocket Host Authorization Security Test per Section 14
  it('Should enforce server-authoritative guest restrictions on WebSocket controls', async () => {
    const guestSocket: ClientSocketType = ClientSocket(serverUrl, { transports: ['websocket'] });

    await new Promise<void>((resolve) => {
      guestSocket.on(SOCKET_EVENTS.ROOM_STATE, () => {
        resolve();
      });
      guestSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
        roomCode,
        displayName: 'Unauthorized Guest',
        sessionId: guestSessionId,
      });
    });

    // Guest attempts to play while allowGuestControl=false
    const errorPromise = new Promise<string>((resolve) => {
      guestSocket.once(SOCKET_EVENTS.ERROR, (data) => {
        resolve(data.message);
      });
    });

    guestSocket.emit(SOCKET_EVENTS.PLAYBACK_PLAY, { position: 10 });
    const errMsg = await errorPromise;
    expect(errMsg).toBe('Only the host can control playback.');

    guestSocket.disconnect();
  });

  // 7. Large Media Size & BigInt Database Verification Test Suite per Section 11
  it('Should store exact 3.3 GB (3,464,998,761 B) and 5 GB (5,368,709,120 B) media size in database without INT overflow', async () => {
    const { roomManager } = await import('../services/roomManager.js');

    // Test 1: Normal small video (100 MB = 104,857,600 bytes) -> accepted
    const smallMedia = await roomManager.attachMedia(roomId, {
      title: 'Small Test Video',
      filename: 'small_video.mp4',
      mimeType: 'video/mp4',
      size: 104857600,
      storageKey: 'test/small_video.mp4',
    });
    expect(smallMedia.size).toBe(104857600n);

    // Test 2: Large video (3,464,998,761 bytes ~3.3 GB) -> accepted and stored successfully without INT overflow
    const large33GB = await roomManager.attachMedia(roomId, {
      title: '3.3 GB Movie',
      filename: 'movie_33gb.mkv',
      mimeType: 'video/x-matroska',
      size: 3464998761,
      storageKey: 'test/movie_33gb.mkv',
    });
    expect(large33GB.size).toBe(3464998761n);

    // Test 3: Exactly 5 GB (5,368,709,120 bytes) -> accepted
    const exact5GB = await roomManager.attachMedia(roomId, {
      title: 'Exact 5GB Movie',
      filename: 'movie_5gb.mp4',
      mimeType: 'video/mp4',
      size: 5368709120,
      storageKey: 'test/movie_5gb.mp4',
    });
    expect(exact5GB.size).toBe(5368709120n);

    // Test 8: API serialization: RoomInfo response must contain exact string size and JSON.stringify must not throw
    const roomInfo = await roomManager.getRoomInfo(roomId);
    expect(roomInfo).not.toBeNull();
    expect(roomInfo?.media?.size).toBe('5368709120');

    // Verify JSON.stringify does NOT throw BigInt serialization error
    expect(() => JSON.stringify(roomInfo)).not.toThrow();

    const jsonStr = JSON.stringify(roomInfo);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.media.size).toBe('5368709120');
  });
});
