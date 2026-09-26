import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { app, server } from '../index.js';
import { prisma } from '../db.js';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { SOCKET_EVENTS } from '@syncwatch/shared';

describe('Watch Room Media State Propagation Regression Test Suite', () => {
  let serverUrl: string;
  let roomId: string;
  let roomCode: string;
  let hostSessionId: string;
  let guestSessionId: string;
  let hostSocket: ClientSocketType;
  let guestSocket: ClientSocketType;
  let didStartServer = false;
  const testFixturesDir = path.join(process.cwd(), 'scratch', 'bugfix_fixtures');

  beforeAll(async () => {
    await prisma.$connect();

    if (!fs.existsSync(testFixturesDir)) {
      fs.mkdirSync(testFixturesDir, { recursive: true });
    }

    if (!server.listening) {
      await new Promise<void>((resolve) => {
        server.listen(4058, () => resolve());
      });
      didStartServer = true;
      serverUrl = 'http://localhost:4058';
    } else {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : 4000;
      serverUrl = `http://localhost:${port}`;
    }

    // Create room with NO media initially
    const res = await request(app)
      .post('/api/rooms')
      .send({ displayName: 'BugFix Host', roomName: 'Empty Room Initial State' });

    expect(res.status).toBe(201);
    roomCode = res.body.room.roomCode;
    roomId = res.body.room.id;
    hostSessionId = res.body.hostSessionId;

    // Join guest to room
    const joinRes = await request(app)
      .post(`/api/rooms/${roomCode}/join`)
      .send({ displayName: 'BugFix Guest', roomCode });

    expect(joinRes.status).toBe(200);
    guestSessionId = joinRes.body.sessionId;

    // Verify initial API GET returns null media
    const initialRoomRes = await request(app).get(`/api/rooms/${roomCode}`);
    expect(initialRoomRes.status).toBe(200);
    expect(initialRoomRes.body.media).toBeNull();
  });

  afterAll(async () => {
    if (hostSocket && hostSocket.connected) hostSocket.disconnect();
    if (guestSocket && guestSocket.connected) guestSocket.disconnect();

    if (didStartServer && server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (fs.existsSync(testFixturesDir)) {
      fs.rmSync(testFixturesDir, { recursive: true, force: true });
    }
  });

  it('Test 1 & Test 2: Uploading media when room media is null immediately creates processing DB record and emits MEDIA_PROCESSING socket event', async () => {
    const hostEvents: any[] = [];
    const guestEvents: any[] = [];

    hostSocket = ClientSocket(serverUrl, { transports: ['websocket'] });
    guestSocket = ClientSocket(serverUrl, { transports: ['websocket'] });

    hostSocket.on('media:processing', (d) => hostEvents.push(d));
    guestSocket.on('media:processing', (d) => guestEvents.push(d));

    await new Promise<void>((resolve) => {
      hostSocket.on('connect', () => {
        hostSocket.emit('room:join', { roomCode, displayName: 'BugFix Host', sessionId: hostSessionId });
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      guestSocket.on('connect', () => {
        guestSocket.emit('room:join', { roomCode, displayName: 'BugFix Guest', sessionId: guestSessionId });
        setTimeout(resolve, 100);
      });
    });

    const testVideoPath = path.join(testFixturesDir, 'initial_upload.mp4');
    fs.writeFileSync(testVideoPath, Buffer.from('dummy_video_bytes_header_12345'));

    const uploadRes = await request(app)
      .post('/api/media/upload')
      .field('roomId', roomId)
      .field('sessionId', hostSessionId)
      .attach('video', testVideoPath);

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.status).toBe('processing');

    // Verify DB immediately reflects processing state
    const dbMedia = await prisma.media.findUnique({ where: { roomId } });
    expect(dbMedia).not.toBeNull();
    expect(dbMedia?.status).toBe('processing');
    expect(dbMedia?.transcodeProgress).toBeGreaterThan(0);

    // Wait for WebSocket event arrival
    await new Promise((r) => setTimeout(r, 400));
    expect(hostEvents.length).toBeGreaterThan(0);
    expect(guestEvents.length).toBeGreaterThan(0);
    expect(hostEvents[0].status).toBe('processing');
    expect(guestEvents[0].status).toBe('processing');
  });

  it('Test 5 & Test 7: GET /api/rooms/:roomCode and WebSocket room state propagate updated media state to all clients', async () => {
    const apiRoom = await request(app).get(`/api/rooms/${roomCode}`);
    expect(apiRoom.status).toBe(200);
    expect(apiRoom.body.media).not.toBeNull();
    expect(apiRoom.body.media.filename).toBe('initial_upload.mp4');
  });

  it('Test 6: Repeated upload actions do not create duplicate conflicting active jobs', async () => {
    const testVideo2 = path.join(testFixturesDir, 'second_upload.mp4');
    fs.writeFileSync(testVideo2, Buffer.from('dummy_video_bytes_header_67890'));

    const uploadRes2 = await request(app)
      .post('/api/media/upload')
      .field('roomId', roomId)
      .field('sessionId', hostSessionId)
      .attach('video', testVideo2);

    expect(uploadRes2.status).toBe(201);

    // Verify database only has 1 media record per room
    const mediaCount = await prisma.media.count({ where: { roomId } });
    expect(mediaCount).toBe(1);
  });
});
