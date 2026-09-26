import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ClientSocket, Socket } from 'socket.io-client';
import { server } from '../index.js';
import { prisma } from '../db.js';
import { roomManager } from '../services/roomManager.js';
import {
  SOCKET_EVENTS,
  ChatMessage,
  PlaybackActivityPayload,
  RoomStateSnapshot,
} from '@syncwatch/shared';

describe('Playback Activity in Cinema Chat Verification Suite', () => {
  let serverUrl = 'http://localhost:4065';
  let didStartServer = false;
  let hostSocket: Socket;
  let guestSocket: Socket;
  let testRoomCode: string;
  let hostSessionId: string;

  beforeAll(async () => {
    await prisma.$connect();
    if (!server.listening) {
      await new Promise<void>((resolve) => {
        server.listen(4065, () => resolve());
      });
      didStartServer = true;
      serverUrl = 'http://localhost:4065';
    } else {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : 4000;
      serverUrl = `http://localhost:${port}`;
    }
  });

  afterAll(async () => {
    hostSocket?.disconnect();
    guestSocket?.disconnect();
    if (didStartServer) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    await prisma.$disconnect();
  });

  it('Setup: Host and Guest join room', async () => {
    const demo = await roomManager.createDemoRoom('Abbas');
    testRoomCode = demo.room.roomCode;
    hostSessionId = demo.hostSessionId;

    hostSocket = ClientSocket(serverUrl, { transports: ['websocket'] });
    guestSocket = ClientSocket(serverUrl, { transports: ['websocket'] });

    const hostReady = new Promise<RoomStateSnapshot>((resolve) => {
      hostSocket.on(SOCKET_EVENTS.ROOM_STATE, (state) => resolve(state));
    });

    hostSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: testRoomCode,
      displayName: 'Abbas',
      sessionId: hostSessionId,
    });

    await hostReady;

    const guestReady = new Promise<RoomStateSnapshot>((resolve) => {
      guestSocket.on(SOCKET_EVENTS.ROOM_STATE, (state) => resolve(state));
    });

    guestSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: testRoomCode,
      displayName: 'Rahul',
    });

    await guestReady;
    expect(testRoomCode).toBeTruthy();
  });

  it('1. User Play → exactly one system chat event received by Host and Guest', async () => {
    const hostReceived: ChatMessage[] = [];
    const guestReceived: ChatMessage[] = [];
    const activityReceived: PlaybackActivityPayload[] = [];

    const hostHandler = (msg: ChatMessage) => {
      if (msg.isSystem && msg.message.includes('started playing')) hostReceived.push(msg);
    };
    const guestHandler = (msg: ChatMessage) => {
      if (msg.isSystem && msg.message.includes('started playing')) guestReceived.push(msg);
    };
    const activityHandler = (act: PlaybackActivityPayload) => {
      if (act.type === 'PLAY') activityReceived.push(act);
    };

    hostSocket.on(SOCKET_EVENTS.CHAT_MESSAGE, hostHandler);
    guestSocket.on(SOCKET_EVENTS.CHAT_MESSAGE, guestHandler);
    guestSocket.on(SOCKET_EVENTS.PLAYBACK_ACTIVITY, activityHandler);

    // Host emits play from 00:00 (or 0s)
    hostSocket.emit(SOCKET_EVENTS.PLAYBACK_PLAY, { position: 0 });

    await new Promise((r) => setTimeout(r, 200));

    expect(hostReceived.length).toBe(1);
    expect(guestReceived.length).toBe(1);
    expect(hostReceived[0].message).toBe('Abbas started playing from 00:00.');
    expect(guestReceived[0].message).toBe('Abbas started playing from 00:00.');
    expect(hostReceived[0].isSystem).toBe(true);
    expect(activityReceived.length).toBe(1);
    expect(activityReceived[0].displayName).toBe('Abbas');

    hostSocket.off(SOCKET_EVENTS.CHAT_MESSAGE, hostHandler);
    guestSocket.off(SOCKET_EVENTS.CHAT_MESSAGE, guestHandler);
    guestSocket.off(SOCKET_EVENTS.PLAYBACK_ACTIVITY, activityHandler);
  });

  it('2. User Pause → exactly one system chat event received', async () => {
    const guestReceived: ChatMessage[] = [];
    const guestHandler = (msg: ChatMessage) => {
      if (msg.isSystem && msg.message.includes('paused')) guestReceived.push(msg);
    };
    guestSocket.on(SOCKET_EVENTS.CHAT_MESSAGE, guestHandler);

    hostSocket.emit(SOCKET_EVENTS.PLAYBACK_PAUSE, { position: 15 });

    await new Promise((r) => setTimeout(r, 200));

    expect(guestReceived.length).toBe(1);
    expect(guestReceived[0].message).toBe('Abbas paused the movie.');
    expect(guestReceived[0].isSystem).toBe(true);

    guestSocket.off(SOCKET_EVENTS.CHAT_MESSAGE, guestHandler);
  });

  it('3. User Seek (while paused) → exactly one SEEK event after coalescing window', async () => {
    const guestReceived: ChatMessage[] = [];
    const guestHandler = (msg: ChatMessage) => {
      if (msg.isSystem && msg.message.includes('jumped to')) guestReceived.push(msg);
    };
    guestSocket.on(SOCKET_EVENTS.CHAT_MESSAGE, guestHandler);

    // Host seeks to 84s (01:24)
    hostSocket.emit(SOCKET_EVENTS.PLAYBACK_SEEK, { position: 84 });

    // Wait for 350ms seek coalescing timer to fire
    await new Promise((r) => setTimeout(r, 500));

    expect(guestReceived.length).toBe(1);
    expect(guestReceived[0].message).toBe('Abbas jumped to 01:24.');
    expect(guestReceived[0].isSystem).toBe(true);

    guestSocket.off(SOCKET_EVENTS.CHAT_MESSAGE, guestHandler);
  });

  it('4. Seek + immediate Play → correctly coalesced into single "started playing from" event', async () => {
    const guestReceived: ChatMessage[] = [];
    const guestHandler = (msg: ChatMessage) => {
      if (msg.isSystem && (msg.message.includes('jumped to') || msg.message.includes('started playing'))) {
        guestReceived.push(msg);
      }
    };
    guestSocket.on(SOCKET_EVENTS.CHAT_MESSAGE, guestHandler);

    // 1. Seek to 01:24:18 (5058s)
    hostSocket.emit(SOCKET_EVENTS.PLAYBACK_SEEK, { position: 5058 });
    // 2. Immediate Play within 50ms (< 350ms window)
    await new Promise((r) => setTimeout(r, 50));
    hostSocket.emit(SOCKET_EVENTS.PLAYBACK_PLAY, { position: 5058 });

    // Wait for event delivery
    await new Promise((r) => setTimeout(r, 500));

    // Must NOT produce both "jumped to" and "started playing"
    const jumpedMsgs = guestReceived.filter((m) => m.message.includes('jumped to'));
    const playMsgs = guestReceived.filter((m) => m.message.includes('started playing'));

    expect(jumpedMsgs.length).toBe(0);
    expect(playMsgs.length).toBe(1);
    expect(playMsgs[0].message).toBe('Abbas started playing from 01:24:18.');

    guestSocket.off(SOCKET_EVENTS.CHAT_MESSAGE, guestHandler);
  });

  it('5. Unauthorized guest control without permission is rejected', async () => {
    const guestReceived: ChatMessage[] = [];
    const guestHandler = (msg: ChatMessage) => {
      if (msg.isSystem && msg.message.includes('Rahul')) guestReceived.push(msg);
    };
    guestSocket.on(SOCKET_EVENTS.CHAT_MESSAGE, guestHandler);

    // Guest attempts to play without room permission
    guestSocket.emit(SOCKET_EVENTS.PLAYBACK_PLAY, { position: 100 });

    await new Promise((r) => setTimeout(r, 200));

    expect(guestReceived.length).toBe(0);

    guestSocket.off(SOCKET_EVENTS.CHAT_MESSAGE, guestHandler);
  });

  it('6. Invalid currentTime (negative) is rejected by schema', async () => {
    const guestReceived: ChatMessage[] = [];
    const guestHandler = (msg: ChatMessage) => {
      if (msg.isSystem && msg.message.includes('jumped to')) guestReceived.push(msg);
    };
    guestSocket.on(SOCKET_EVENTS.CHAT_MESSAGE, guestHandler);

    // Invalid negative position
    hostSocket.emit(SOCKET_EVENTS.PLAYBACK_SEEK, { position: -50 });

    await new Promise((r) => setTimeout(r, 450));

    expect(guestReceived.length).toBe(0);

    guestSocket.off(SOCKET_EVENTS.CHAT_MESSAGE, guestHandler);
  });

  it('7. Rate Limiting prevents chat flooding from rapid seek spam', async () => {
    const guestReceived: ChatMessage[] = [];
    const guestHandler = (msg: ChatMessage) => {
      if (msg.isSystem && msg.message.includes('jumped to')) guestReceived.push(msg);
    };
    guestSocket.on(SOCKET_EVENTS.CHAT_MESSAGE, guestHandler);

    // Rapidly emit 12 seeks
    for (let i = 0; i < 12; i++) {
      hostSocket.emit(SOCKET_EVENTS.PLAYBACK_SEEK, { position: 10 + i });
      await new Promise((r) => setTimeout(r, 20));
    }

    // Wait for timers to resolve
    await new Promise((r) => setTimeout(r, 600));

    // Rate limiter caps rapid seek spam
    expect(guestReceived.length).toBeLessThanOrEqual(6);

    guestSocket.off(SOCKET_EVENTS.CHAT_MESSAGE, guestHandler);
  });
});
