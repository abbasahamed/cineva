import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import ioClient from 'socket.io-client';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import express from 'express';
import { setupSocketHandlers } from '../sockets/socketHandler.js';
import { roomManager } from '../services/roomManager.js';
import { prisma } from '../db.js';
import { SOCKET_EVENTS } from '@cineva/shared';

describe('Host Exit and Room Cancellation Lifecycle Tests', () => {
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

  it('1 & 4 & 5. Explicit host exit -> immediate ROOM_CANCELLED emitted exactly once to all guests', async () => {
    const created = await roomManager.createRoom({
      displayName: 'HostAlice',
      roomName: 'Cancel Test Room',
      allowGuestControl: false,
    });

    const hostSocket = ioClient(serverUrl, { transports: ['websocket'] });
    const guest1Socket = ioClient(serverUrl, { transports: ['websocket'] });
    const guest2Socket = ioClient(serverUrl, { transports: ['websocket'] });

    await new Promise<void>((resolve) => hostSocket.on('connect', () => resolve()));
    await new Promise<void>((resolve) => guest1Socket.on('connect', () => resolve()));
    await new Promise<void>((resolve) => guest2Socket.on('connect', () => resolve()));

    // Host joins
    hostSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: created.room.roomCode,
      displayName: 'HostAlice',
      sessionId: created.hostSessionId,
    });
    await new Promise<void>((resolve) => hostSocket.once(SOCKET_EVENTS.ROOM_STATE, () => resolve()));

    // Guest 1 joins
    guest1Socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: created.room.roomCode,
      displayName: 'GuestBob',
    });
    await new Promise<void>((resolve) => guest1Socket.once(SOCKET_EVENTS.ROOM_STATE, () => resolve()));

    // Guest 2 joins
    guest2Socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: created.room.roomCode,
      displayName: 'GuestCharlie',
    });
    await new Promise<void>((resolve) => guest2Socket.once(SOCKET_EVENTS.ROOM_STATE, () => resolve()));

    let guest1CancelledCount = 0;
    let guest2CancelledCount = 0;
    let guest1Message = '';

    guest1Socket.on(SOCKET_EVENTS.ROOM_CANCELLED, (data: { message: string }) => {
      guest1CancelledCount++;
      guest1Message = data.message;
    });

    guest2Socket.on(SOCKET_EVENTS.ROOM_CANCELLED, () => {
      guest2CancelledCount++;
    });

    // Host explicitly leaves room
    hostSocket.emit(SOCKET_EVENTS.LEAVE_ROOM);

    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(guest1CancelledCount).toBe(1);
    expect(guest2CancelledCount).toBe(1);
    expect(guest1Message).toContain('The host has left the room');

    // Verify room status in DB is ended
    const roomInDb = await roomManager.getRoomById(created.room.id);
    expect(roomInDb?.status).toBe('ended');

    hostSocket.disconnect();
    guest1Socket.disconnect();
    guest2Socket.disconnect();
  });

  it('3. Guest exit -> room remains active, host remains host, NO ROOM_CANCELLED', async () => {
    const created = await roomManager.createRoom({
      displayName: 'HostAlice',
      roomName: 'Guest Exit Test',
    });

    const hostSocket = ioClient(serverUrl, { transports: ['websocket'] });
    const guestSocket = ioClient(serverUrl, { transports: ['websocket'] });

    await new Promise<void>((resolve) => hostSocket.on('connect', () => resolve()));
    await new Promise<void>((resolve) => guestSocket.on('connect', () => resolve()));

    hostSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: created.room.roomCode,
      displayName: 'HostAlice',
      sessionId: created.hostSessionId,
    });
    await new Promise<void>((resolve) => hostSocket.once(SOCKET_EVENTS.ROOM_STATE, () => resolve()));

    guestSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: created.room.roomCode,
      displayName: 'GuestBob',
    });
    await new Promise<void>((resolve) => guestSocket.once(SOCKET_EVENTS.ROOM_STATE, () => resolve()));

    let hostCancelledCount = 0;
    hostSocket.on(SOCKET_EVENTS.ROOM_CANCELLED, () => {
      hostCancelledCount++;
    });

    // Guest leaves
    guestSocket.emit(SOCKET_EVENTS.LEAVE_ROOM);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(hostCancelledCount).toBe(0);

    const roomInDb = await roomManager.getRoomById(created.room.id);
    expect(roomInDb?.status).toBe('active');

    hostSocket.disconnect();
    guestSocket.disconnect();
  });

  it('13. Reconnecting to cancelled/ended room is rejected', async () => {
    const created = await roomManager.createRoom({
      displayName: 'HostAlice',
      roomName: 'Ended Room Reconnect',
    });

    await roomManager.endRoom(created.room.id);

    const newGuestSocket = ioClient(serverUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve) => newGuestSocket.on('connect', () => resolve()));

    let errorReceived: string | null = null;
    newGuestSocket.on(SOCKET_EVENTS.ROOM_NOT_FOUND, (data: { message: string }) => {
      errorReceived = data.message;
    });

    newGuestSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: created.room.roomCode,
      displayName: 'LateGuest',
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(errorReceived).toBe('This watch room has ended.');

    newGuestSocket.disconnect();
  });
});
