import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ClientSocket, Socket } from 'socket.io-client';
import request from 'supertest';
import { server, app } from '../index.js';
import { prisma } from '../db.js';
import { roomManager } from '../services/roomManager.js';
import {
  SOCKET_EVENTS,
  RoomStateSnapshot,
  PlaybackState,
} from '@syncwatch/shared';

describe('Host Identity & Role State Regression Test Suite', () => {
  let serverPort: number = 4059;
  let serverUrl: string = `http://localhost:${serverPort}`;
  let hostSocket: Socket;
  let guestSocket: Socket;

  let testRoomCode: string;
  let roomId: string;
  let hostSessionId: string;
  let hostParticipantId: string;
  let guestSessionId: string = 'guest_session_12345';
  let didStartServer = false;

  beforeAll(async () => {
    await prisma.$connect();
    if (!server.listening) {
      await new Promise<void>((resolve) => {
        server.listen(serverPort, () => resolve());
      });
      didStartServer = true;
      serverUrl = `http://localhost:${serverPort}`;
    } else {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : 4000;
      serverUrl = `http://localhost:${port}`;
    }
  });

  afterAll(async () => {
    hostSocket?.disconnect();
    guestSocket?.disconnect();
    if (didStartServer && server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await prisma.media.deleteMany({ where: { roomId } }).catch(() => {});
    await prisma.room.deleteMany({ where: { id: roomId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('1. Room Creator Becomes Host: POST /api/rooms creates room with hostSessionId and hostParticipant', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ displayName: 'Creator Host', roomName: 'Host Role Test Room' });

    expect(res.status).toBe(201);
    expect(res.body.room).toBeDefined();
    expect(res.body.room.roomCode).toBeTruthy();
    expect(res.body.hostSessionId).toBeTruthy();
    expect(res.body.hostParticipantId).toBeTruthy();

    testRoomCode = res.body.room.roomCode;
    roomId = res.body.room.id;
    hostSessionId = res.body.hostSessionId;
    hostParticipantId = res.body.hostParticipantId;

    // Verify DB authoritative state
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { participants: true },
    });
    expect(room?.hostSessionId).toBe(hostSessionId);
    expect(room?.hostParticipantId).toBe(hostParticipantId);

    const hostP = room?.participants.find((p) => p.sessionId === hostSessionId);
    expect(hostP).toBeDefined();
    expect(hostP?.isHost).toBe(true);
  });

  it('2 & 3. Host Receives Correct Host Identity: Host joins via WebSocket and receives isHost === true', async () => {
    hostSocket = ClientSocket(serverUrl, {
      transports: ['websocket'],
      forceNew: true,
    });

    const snapshot = await new Promise<RoomStateSnapshot>((resolve) => {
      hostSocket.on(SOCKET_EVENTS.ROOM_STATE, (data: RoomStateSnapshot) => {
        resolve(data);
      });

      hostSocket.on('connect', () => {
        hostSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
          roomCode: testRoomCode,
          displayName: 'Creator Host',
          sessionId: hostSessionId,
        });
      });
    });

    expect(snapshot.isHost).toBe(true);
    expect(snapshot.room.hostSessionId).toBe(hostSessionId);
    expect(snapshot.room.hostParticipantId).toBe(hostParticipantId);
    expect(snapshot.myParticipantId).toBe(hostParticipantId);

    const me = snapshot.participants.find((p) => p.sessionId === hostSessionId);
    expect(me?.isHost).toBe(true);
  });

  it('4. Second Participant Joins as Guest: Receives isHost === false', async () => {
    guestSocket = ClientSocket(serverUrl, {
      transports: ['websocket'],
      forceNew: true,
    });

    const guestSnapshot = await new Promise<RoomStateSnapshot>((resolve) => {
      guestSocket.on(SOCKET_EVENTS.ROOM_STATE, (data: RoomStateSnapshot) => {
        resolve(data);
      });

      guestSocket.on('connect', () => {
        guestSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
          roomCode: testRoomCode,
          displayName: 'Guest Friend',
          sessionId: guestSessionId,
        });
      });
    });

    expect(guestSnapshot.isHost).toBe(false);
    expect(guestSnapshot.room.hostSessionId).toBe(hostSessionId);

    const guestParticipant = guestSnapshot.participants.find((p) => p.sessionId === guestSessionId);
    expect(guestParticipant).toBeDefined();
    expect(guestParticipant?.isHost).toBe(false);

    // Host participant in participant list still has isHost === true
    const hostInList = guestSnapshot.participants.find((p) => p.sessionId === hostSessionId);
    expect(hostInList?.isHost).toBe(true);
  });

  it('5. Host Refresh: Disconnecting and reconnecting with same hostSessionId preserves host role', async () => {
    hostSocket.disconnect();

    const newHostSocket = ClientSocket(serverUrl, {
      transports: ['websocket'],
      forceNew: true,
    });

    const refreshedSnapshot = await new Promise<RoomStateSnapshot>((resolve) => {
      newHostSocket.on(SOCKET_EVENTS.ROOM_STATE, (data: RoomStateSnapshot) => {
        resolve(data);
      });

      newHostSocket.on('connect', () => {
        newHostSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
          roomCode: testRoomCode,
          displayName: 'Creator Host',
          sessionId: hostSessionId,
        });
      });
    });

    expect(refreshedSnapshot.isHost).toBe(true);
    expect(refreshedSnapshot.room.hostSessionId).toBe(hostSessionId);
    expect(refreshedSnapshot.myParticipantId).toBe(hostParticipantId);

    hostSocket = newHostSocket;
  });

  it('6. Host Reconnect: Network drop recovery preserves host role', async () => {
    hostSocket.disconnect();
    await new Promise((r) => setTimeout(r, 100));

    hostSocket.connect();
    const reconnectedSnapshot = await new Promise<RoomStateSnapshot>((resolve) => {
      hostSocket.on(SOCKET_EVENTS.ROOM_STATE, (data: RoomStateSnapshot) => {
        resolve(data);
      });
      hostSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
        roomCode: testRoomCode,
        displayName: 'Creator Host',
        sessionId: hostSessionId,
      });
    });

    expect(reconnectedSnapshot.isHost).toBe(true);
    expect(reconnectedSnapshot.room.hostSessionId).toBe(hostSessionId);
  });

  it('7. Host Can Control Playback: Host play/pause/seek succeeds and broadcasts to all clients', async () => {
    const playPromise = new Promise<{ playback: PlaybackState }>((resolve) => {
      guestSocket.once(SOCKET_EVENTS.PLAYBACK_STATE, (data: { playback: PlaybackState }) => {
        resolve(data);
      });
    });

    hostSocket.emit(SOCKET_EVENTS.PLAYBACK_PLAY, { position: 10, playbackRate: 1.0 });
    const playResult = await playPromise;

    expect(playResult.playback.isPlaying).toBe(true);
    expect(playResult.playback.position).toBe(10);
  });

  it('8. Guest Cannot Control Playback: Unauthorized playback command from guest is rejected', async () => {
    const errorPromise = new Promise<{ message: string }>((resolve) => {
      guestSocket.once(SOCKET_EVENTS.ERROR, (err: { message: string }) => {
        resolve(err);
      });
    });

    guestSocket.emit(SOCKET_EVENTS.PLAYBACK_PAUSE, { position: 0 });
    const errorResult = await errorPromise;

    expect(errorResult.message).toBe('Only the host can control playback.');
  });

  it('9. Room Updates & Media Events: Room updates preserve host identity', async () => {
    const updatePromise = new Promise<{ room: any }>((resolve) => {
      hostSocket.once('room:updated', (data: { room: any }) => {
        resolve(data);
      });
    });

    hostSocket.emit(SOCKET_EVENTS.ROOM_UPDATE_SETTINGS, { allowGuestControl: true });
    const updateResult = await updatePromise;

    expect(updateResult.room.hostSessionId).toBe(hostSessionId);
    expect(updateResult.room.settings.allowGuestControl).toBe(true);
  });
});
