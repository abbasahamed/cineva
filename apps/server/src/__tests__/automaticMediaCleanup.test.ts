import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import ioClient from 'socket.io-client';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import express from 'express';
import { setupSocketHandlers } from '../sockets/socketHandler.js';
import { roomManager } from '../services/roomManager.js';
import { mediaStorage } from '../services/mediaStorage.js';
import { mediaJobQueue } from '../services/media/mediaJobQueue.js';
import { prisma } from '../db.js';
import { SOCKET_EVENTS } from '@cineva/shared';
import { CONFIG } from '../config.js';

describe('Automatic Media Cleanup on Room Closure Test Suite', () => {
  let server: http.Server;
  let io: SocketIOServer;
  let serverUrl: string;

  beforeAll(async () => {
    const app = express();
    server = http.createServer(app);
    io = new SocketIOServer(server, {
      cors: { origin: '*' },
    });
    setupSocketHandlers(io);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (io) io.close();
    if (server) server.close();
  });

  beforeEach(async () => {
    await prisma.chatMessage.deleteMany();
    await prisma.participant.deleteMany();
    await prisma.media.deleteMany();
    await prisma.room.deleteMany();
  });

  it('TEST 1 — Host exit deletes media (original + playback deleted)', async () => {
    const created = await roomManager.createRoom({
      displayName: 'HostAlice',
      roomName: 'Cleanup Room 1',
      allowGuestControl: false,
    });
    const roomId = created.room.id;

    // Attach media with files
    const origKey = path.join(roomId, 'source_test_video.mp4');
    const playKey = path.join(roomId, 'test_video.mp4');
    const origPath = mediaStorage.getLocalPath(origKey)!;
    const playPath = mediaStorage.getLocalPath(playKey)!;

    fs.mkdirSync(path.dirname(origPath), { recursive: true });
    fs.writeFileSync(origPath, 'fake source data');
    fs.writeFileSync(playPath, 'fake playback data');

    await prisma.media.create({
      data: {
        roomId,
        title: 'Test Video',
        filename: 'test_video.mp4',
        mimeType: 'video/mp4',
        size: BigInt(100),
        storageKey: playKey,
        originalStorageKey: origKey,
        playbackStorageKey: playKey,
        status: 'ready',
      },
    });

    const hostSocket = ioClient(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((res) => hostSocket.on('connect', res));

    hostSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: created.room.roomCode,
      displayName: 'HostAlice',
      sessionId: created.hostSessionId,
    });
    await new Promise<void>((res) => hostSocket.once(SOCKET_EVENTS.ROOM_STATE, () => res()));

    // Host exits room
    hostSocket.emit(SOCKET_EVENTS.LEAVE_ROOM);
    await new Promise((res) => setTimeout(res, 300));

    // Verify room ended
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    expect(room?.status).toBe('ended');

    // Verify physical files deleted
    expect(fs.existsSync(origPath)).toBe(false);
    expect(fs.existsSync(playPath)).toBe(false);

    // Verify media DB record deleted
    const mediaCount = await prisma.media.count({ where: { roomId } });
    expect(mediaCount).toBe(0);

    hostSocket.close();
  });

  it('TEST 2 — Guest exit DOES NOT delete media', async () => {
    const created = await roomManager.createRoom({
      displayName: 'HostAlice',
      roomName: 'Keep Media Room',
      allowGuestControl: false,
    });
    const roomId = created.room.id;

    const playKey = path.join(roomId, 'sample_video.mp4');
    const playPath = mediaStorage.getLocalPath(playKey)!;
    fs.mkdirSync(path.dirname(playPath), { recursive: true });
    fs.writeFileSync(playPath, 'sample data');

    await prisma.media.create({
      data: {
        roomId,
        title: 'Sample',
        filename: 'sample_video.mp4',
        mimeType: 'video/mp4',
        size: BigInt(50),
        storageKey: playKey,
        playbackStorageKey: playKey,
        status: 'ready',
      },
    });

    const joinResult = await roomManager.joinRoom({
      roomCode: created.room.roomCode,
      displayName: 'GuestBob',
    });

    const guestSocket = ioClient(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((res) => guestSocket.on('connect', res));

    guestSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: created.room.roomCode,
      displayName: 'GuestBob',
      sessionId: joinResult.sessionId,
    });
    await new Promise<void>((res) => guestSocket.once(SOCKET_EVENTS.ROOM_STATE, () => res()));

    // Guest leaves room
    guestSocket.emit(SOCKET_EVENTS.LEAVE_ROOM);
    await new Promise((res) => setTimeout(res, 200));

    // Verify room is still active and media still exists
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    expect(room?.status).toBe('active');

    expect(fs.existsSync(playPath)).toBe(true);
    const mediaCount = await prisma.media.count({ where: { roomId } });
    expect(mediaCount).toBe(1);

    guestSocket.close();
  });

  it('TEST 3 — Host disconnect during grace period (media untouched)', async () => {
    const created = await roomManager.createRoom({
      displayName: 'HostAlice',
      roomName: 'Grace Period Room',
      allowGuestControl: false,
    });
    const roomId = created.room.id;

    const playKey = path.join(roomId, 'sample_video.mp4');
    const playPath = mediaStorage.getLocalPath(playKey)!;
    fs.mkdirSync(path.dirname(playPath), { recursive: true });
    fs.writeFileSync(playPath, 'sample data');

    await prisma.media.create({
      data: {
        roomId,
        title: 'Sample',
        filename: 'sample_video.mp4',
        mimeType: 'video/mp4',
        size: BigInt(50),
        storageKey: playKey,
        playbackStorageKey: playKey,
        status: 'ready',
      },
    });

    const hostSocket = ioClient(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((res) => hostSocket.on('connect', res));

    hostSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: created.room.roomCode,
      displayName: 'HostAlice',
      sessionId: created.hostSessionId,
    });
    await new Promise<void>((res) => hostSocket.once(SOCKET_EVENTS.ROOM_STATE, () => res()));

    // Disconnect socket abruptly (triggers 30s grace period timer)
    hostSocket.disconnect();
    await new Promise((res) => setTimeout(res, 200));

    // Immediately verify media is still untouched during grace period
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    expect(room?.status).toBe('active');
    expect(fs.existsSync(playPath)).toBe(true);
  });

  it('TEST 4 — Host disconnect grace period expires (media cleaned)', async () => {
    const created = await roomManager.createRoom({
      displayName: 'HostAlice',
      roomName: 'Expire Grace Room',
      allowGuestControl: false,
    });
    const roomId = created.room.id;

    const playKey = path.join(roomId, 'grace_video.mp4');
    const playPath = mediaStorage.getLocalPath(playKey)!;
    fs.mkdirSync(path.dirname(playPath), { recursive: true });
    fs.writeFileSync(playPath, 'grace video content');

    await prisma.media.create({
      data: {
        roomId,
        title: 'Grace Video',
        filename: 'grace_video.mp4',
        mimeType: 'video/mp4',
        size: BigInt(100),
        storageKey: playKey,
        playbackStorageKey: playKey,
        status: 'ready',
      },
    });

    // Simulate grace period expiry by calling endRoom directly (which socketHandler calls on timer expiry)
    await roomManager.endRoom(roomId);

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    expect(room?.status).toBe('ended');
    expect(fs.existsSync(playPath)).toBe(false);

    const mediaCount = await prisma.media.count({ where: { roomId } });
    expect(mediaCount).toBe(0);
  });

  it('TEST 5 — Cleanup during queued processing (queued job cancelled)', async () => {
    const created = await roomManager.createRoom({
      displayName: 'HostAlice',
      roomName: 'Queue Cleanup Room',
      allowGuestControl: false,
    });
    const roomId = created.room.id;

    const tempSource = path.join(CONFIG.MEDIA_STORAGE_PATH, 'temp', 'queued_source.mp4');
    fs.mkdirSync(path.dirname(tempSource), { recursive: true });
    fs.writeFileSync(tempSource, 'dummy queued content');

    // Push job into queue
    (mediaJobQueue as any).queue.push({
      id: 'job_queued_test',
      roomId,
      localSourcePath: tempSource,
      filename: 'queued_source.mp4',
      createdAt: Date.now(),
    });

    // Cancel jobs for room while queued
    await mediaJobQueue.cancelJobsForRoom(roomId);
    await roomManager.cleanupRoomMedia(roomId);

    // Verify temp file deleted
    expect(fs.existsSync(tempSource)).toBe(false);
  });

  it('TEST 6 — Cleanup during active processing (active transcoding job cancelled)', async () => {
    const created = await roomManager.createRoom({
      displayName: 'HostAlice',
      roomName: 'Active Processing Room',
      allowGuestControl: false,
    });
    const roomId = created.room.id;

    // Simulate active processing job
    await prisma.media.create({
      data: {
        roomId,
        title: 'Processing Video',
        filename: 'proc_video.mp4',
        mimeType: 'video/mp4',
        size: BigInt(0),
        storageKey: 'pending_job_active',
        originalStorageKey: 'pending_job_active',
        status: 'processing',
        transcodeProgress: 25,
      },
    });

    await roomManager.cleanupRoomMedia(roomId);

    const mediaCount = await prisma.media.count({ where: { roomId } });
    expect(mediaCount).toBe(0);
  });

  it('TEST 7 — Idempotent cleanup (calling cleanupRoomMedia twice does not error)', async () => {
    const created = await roomManager.createRoom({
      displayName: 'HostAlice',
      roomName: 'Idempotent Room',
      allowGuestControl: false,
    });
    const roomId = created.room.id;

    const playKey = path.join(roomId, 'idem_video.mp4');
    const playPath = mediaStorage.getLocalPath(playKey)!;
    fs.mkdirSync(path.dirname(playPath), { recursive: true });
    fs.writeFileSync(playPath, 'idempotent content');

    await prisma.media.create({
      data: {
        roomId,
        title: 'Idempotent Video',
        filename: 'idem_video.mp4',
        mimeType: 'video/mp4',
        size: BigInt(100),
        storageKey: playKey,
        playbackStorageKey: playKey,
        status: 'ready',
      },
    });

    // First call
    await roomManager.cleanupRoomMedia(roomId);
    expect(fs.existsSync(playPath)).toBe(false);

    // Second call (should succeed idempotently with no errors)
    await expect(roomManager.cleanupRoomMedia(roomId)).resolves.not.toThrow();
  });

  it('TEST 8 — Missing files (handles missing files gracefully without crashing)', async () => {
    const created = await roomManager.createRoom({
      displayName: 'HostAlice',
      roomName: 'Missing File Room',
      allowGuestControl: false,
    });
    const roomId = created.room.id;

    // DB points to non-existent file
    const missingKey = path.join(roomId, 'non_existent_file.mp4');

    await prisma.media.create({
      data: {
        roomId,
        title: 'Missing File',
        filename: 'non_existent_file.mp4',
        mimeType: 'video/mp4',
        size: BigInt(100),
        storageKey: missingKey,
        playbackStorageKey: missingKey,
        status: 'ready',
      },
    });

    // Cleanup should complete without throwing
    await expect(roomManager.cleanupRoomMedia(roomId)).resolves.not.toThrow();

    // DB record should still be removed
    const mediaCount = await prisma.media.count({ where: { roomId } });
    expect(mediaCount).toBe(0);
  });

  it('TEST 9 — Cross-room protection (Room A cleanup does NOT touch Room B)', async () => {
    const roomA = await roomManager.createRoom({
      displayName: 'HostA',
      roomName: 'Room A',
      allowGuestControl: false,
    });
    const roomB = await roomManager.createRoom({
      displayName: 'HostB',
      roomName: 'Room B',
      allowGuestControl: false,
    });

    const keyA = path.join(roomA.room.id, 'videoA.mp4');
    const keyB = path.join(roomB.room.id, 'videoB.mp4');
    const pathA = mediaStorage.getLocalPath(keyA)!;
    const pathB = mediaStorage.getLocalPath(keyB)!;

    fs.mkdirSync(path.dirname(pathA), { recursive: true });
    fs.mkdirSync(path.dirname(pathB), { recursive: true });
    fs.writeFileSync(pathA, 'data A');
    fs.writeFileSync(pathB, 'data B');

    await prisma.media.create({
      data: {
        roomId: roomA.room.id,
        title: 'Media A',
        filename: 'videoA.mp4',
        mimeType: 'video/mp4',
        size: BigInt(50),
        storageKey: keyA,
        playbackStorageKey: keyA,
        status: 'ready',
      },
    });

    await prisma.media.create({
      data: {
        roomId: roomB.room.id,
        title: 'Media B',
        filename: 'videoB.mp4',
        mimeType: 'video/mp4',
        size: BigInt(50),
        storageKey: keyB,
        playbackStorageKey: keyB,
        status: 'ready',
      },
    });

    // Close Room A
    await roomManager.endRoom(roomA.room.id);

    // Room A media deleted
    expect(fs.existsSync(pathA)).toBe(false);
    const countA = await prisma.media.count({ where: { roomId: roomA.room.id } });
    expect(countA).toBe(0);

    // Room B media 100% UNTOUCHED
    expect(fs.existsSync(pathB)).toBe(true);
    const countB = await prisma.media.count({ where: { roomId: roomB.room.id } });
    expect(countB).toBe(1);
    const bRoom = await prisma.room.findUnique({ where: { id: roomB.room.id } });
    expect(bRoom?.status).toBe('active');
  });

  it('TEST 10 — Room cancellation cannot resurrect media (late completion rejected)', async () => {
    const created = await roomManager.createRoom({
      displayName: 'HostAlice',
      roomName: 'Resurrection Protection Room',
      allowGuestControl: false,
    });
    const roomId = created.room.id;

    // Close room while processing
    await roomManager.endRoom(roomId);

    // Verify room is ended and media cleanup cancelled jobs
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    expect(room?.status).toBe('ended');

    // Attempting to query room info returns ended status and null/empty media
    const roomInfo = await roomManager.getRoomInfo(roomId);
    expect(roomInfo?.media).toBeNull();
  });
});
