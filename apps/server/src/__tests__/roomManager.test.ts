import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../db.js';
import { roomManager } from '../services/roomManager.js';

describe('RoomManager Integration Tests', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should create a room with 6-character room code and assign host permissions', async () => {
    const result = await roomManager.createRoom({
      displayName: 'Host User',
      roomName: 'Friday Movie Night',
      allowGuestControl: false,
    });

    expect(result.room).toBeDefined();
    expect(result.room.roomCode).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
    expect(result.room.name).toBe('Friday Movie Night');
    expect(result.hostSessionId).toBeDefined();

    const isHost = await roomManager.isHost(result.room.id, result.hostSessionId);
    expect(isHost).toBe(true);

    const canControl = await roomManager.canControlPlayback(result.room.id, result.hostSessionId);
    expect(canControl).toBe(true);
  });

  it('should allow a guest to join and restrict playback control if host disabled it', async () => {
    const hostResult = await roomManager.createRoom({
      displayName: 'Host Person',
      roomName: 'Host Only Room',
      allowGuestControl: false,
    });

    const guestJoin = await roomManager.joinRoom({
      roomCode: hostResult.room.roomCode,
      displayName: 'Guest Friend',
    });

    expect(guestJoin.participant).toBeDefined();
    expect(guestJoin.participant.isHost).toBe(false);
    expect(guestJoin.participant.displayName).toBe('Guest Friend');

    const isHost = await roomManager.isHost(hostResult.room.id, guestJoin.sessionId);
    expect(isHost).toBe(false);

    const canControl = await roomManager.canControlPlayback(hostResult.room.id, guestJoin.sessionId);
    expect(canControl).toBe(false);
  });

  it('should allow guest playback control if allowGuestControl is true', async () => {
    const hostResult = await roomManager.createRoom({
      displayName: 'Host Person',
      roomName: 'Collaborative Room',
      allowGuestControl: true,
    });

    const guestJoin = await roomManager.joinRoom({
      roomCode: hostResult.room.roomCode,
      displayName: 'Guest Co-Watcher',
    });

    const canControl = await roomManager.canControlPlayback(hostResult.room.id, guestJoin.sessionId);
    expect(canControl).toBe(true);
  });

  it('should allow guests to control playback by default (equal control)', async () => {
    // allowGuestControl omitted -> defaults to true (equal control).
    const hostResult = await roomManager.createRoom({
      displayName: 'Host Person',
      roomName: 'Equal Control Room',
    });

    const guestJoin = await roomManager.joinRoom({
      roomCode: hostResult.room.roomCode,
      displayName: 'Guest Default',
    });

    const canControl = await roomManager.canControlPlayback(hostResult.room.id, guestJoin.sessionId);
    expect(canControl).toBe(true);
  });

  it('should handle rejoining user with existing sessionId without duplicate participants', async () => {
    const hostResult = await roomManager.createRoom({
      displayName: 'Original Host',
      roomName: 'Reconnection Test Room',
      allowGuestControl: false,
    });

    const initialJoin = await roomManager.joinRoom({
      roomCode: hostResult.room.roomCode,
      displayName: 'Reconnecting User',
    });

    const reconnectedJoin = await roomManager.joinRoom({
      roomCode: hostResult.room.roomCode,
      displayName: 'Reconnecting User',
      sessionId: initialJoin.sessionId,
    });

    expect(reconnectedJoin.participant.id).toBe(initialJoin.participant.id);
    expect(reconnectedJoin.isNew).toBe(false);
  });

  it('should reject joining non-existent room code with clear error', async () => {
    await expect(
      roomManager.joinRoom({
        roomCode: 'NONEXIST',
        displayName: 'Lost User',
      })
    ).rejects.toThrow('Room not found');
  });

  it('should create an instant demo room with media pre-configured', async () => {
    const demo = await roomManager.createDemoRoom('Demo Explorer');
    expect(demo.room).toBeDefined();
    expect(demo.room.name).toBe('🎬 Demo Watch Room');
    expect(demo.room.media).toBeDefined();
    expect(demo.room.media?.title).toBe('Big Buck Bunny (Sample HD)');
  });
});
