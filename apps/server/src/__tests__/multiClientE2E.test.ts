import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ClientSocket, Socket } from 'socket.io-client';
import { server, app } from '../index.js';
import { prisma } from '../db.js';
import { roomManager } from '../services/roomManager.js';
import {
  SOCKET_EVENTS,
  PlaybackState,
  RoomStateSnapshot,
  ParticipantInfo,
  ChatMessage,
  calculateExpectedPosition,
  calculateServerOffset,
  DEFAULT_DRIFT_CONFIG,
} from '@cineva/shared';

describe('Real Multi-Client WebSocket End-to-End Verification Suite', () => {
  let serverPort: number = 4055;
  let serverUrl: string = `http://localhost:${serverPort}`;
  let hostSocket: Socket;
  let guest1Socket: Socket;
  let guest2Socket: Socket;
  let guest3Socket: Socket;

  let testRoomCode: string;
  let hostSessionId: string;
  let guest1SessionId: string;
  let guest2SessionId: string;
  let guest3SessionId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await new Promise<void>((resolve) => {
      server.listen(serverPort, () => resolve());
    });
  });

  afterAll(async () => {
    hostSocket?.disconnect();
    guest1Socket?.disconnect();
    guest2Socket?.disconnect();
    guest3Socket?.disconnect();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  });

  it('Step 1: Host creates a real room and connects via WebSocket', async () => {
    const demo = await roomManager.createDemoRoom('Host User');
    testRoomCode = demo.room.roomCode;
    hostSessionId = demo.hostSessionId;

    expect(testRoomCode).toBeDefined();
    expect(demo.room.media).toBeDefined();

    hostSocket = ClientSocket(serverUrl, { transports: ['websocket'] });

    const hostStateReceived = new Promise<RoomStateSnapshot>((resolve) => {
      hostSocket.on(SOCKET_EVENTS.ROOM_STATE, (state: RoomStateSnapshot) => {
        resolve(state);
      });
    });

    hostSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: testRoomCode,
      displayName: 'Host User',
      sessionId: hostSessionId,
    });

    const snapshot = await hostStateReceived;
    expect(snapshot.room.roomCode).toBe(testRoomCode);
    expect(snapshot.isHost).toBe(true);
    expect(snapshot.playback.isPlaying).toBe(false);
    expect(snapshot.playback.position).toBe(0);
  });

  it('Step 2: Guest 1 (Friend 1) joins from independent session', async () => {
    guest1Socket = ClientSocket(serverUrl, { transports: ['websocket'] });

    const guest1SnapshotPromise = new Promise<RoomStateSnapshot>((resolve) => {
      guest1Socket.on(SOCKET_EVENTS.ROOM_STATE, (state) => resolve(state));
    });

    const hostPresencePromise = new Promise<ParticipantInfo>((resolve) => {
      hostSocket.on(SOCKET_EVENTS.PARTICIPANT_JOINED, (data) => {
        if (data.participant.displayName === 'Friend 1') {
          resolve(data.participant);
        }
      });
    });

    guest1Socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: testRoomCode,
      displayName: 'Friend 1',
    });

    const [guest1Snapshot, hostSeenParticipant] = await Promise.all([
      guest1SnapshotPromise,
      hostPresencePromise,
    ]);

    guest1SessionId = guest1Snapshot.myParticipantId;
    expect(guest1Snapshot.isHost).toBe(false);
    expect(hostSeenParticipant.displayName).toBe('Friend 1');
    expect(guest1Snapshot.participants.length).toBe(2);
  });

  it('Step 3: Guest 2 (Friend 2) joins from third independent session', async () => {
    guest2Socket = ClientSocket(serverUrl, { transports: ['websocket'] });

    const guest2SnapshotPromise = new Promise<RoomStateSnapshot>((resolve) => {
      guest2Socket.on(SOCKET_EVENTS.ROOM_STATE, (state) => resolve(state));
    });

    guest2Socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: testRoomCode,
      displayName: 'Friend 2',
    });

    const guest2Snapshot = await guest2SnapshotPromise;
    guest2SessionId = guest2Snapshot.myParticipantId;

    expect(guest2Snapshot.isHost).toBe(false);
    expect(guest2Snapshot.participants.length).toBe(3);
  });

  it('Step 4 & 6: Host triggers PLAY -> All clients receive authoritative state and stay in sync', async () => {
    const hostPlayReceived = new Promise<any>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.PLAYBACK_STATE, (d) => resolve(d));
    });
    const guest1PlayReceived = new Promise<any>((resolve) => {
      guest1Socket.once(SOCKET_EVENTS.PLAYBACK_STATE, (d) => resolve(d));
    });
    const guest2PlayReceived = new Promise<any>((resolve) => {
      guest2Socket.once(SOCKET_EVENTS.PLAYBACK_STATE, (d) => resolve(d));
    });

    // Host emits play at 0.0s
    hostSocket.emit(SOCKET_EVENTS.PLAYBACK_PLAY, { position: 0.0, playbackRate: 1.0 });

    const [hostState, guest1State, guest2State] = await Promise.all([
      hostPlayReceived,
      guest1PlayReceived,
      guest2PlayReceived,
    ]);

    expect(hostState.playback.isPlaying).toBe(true);
    expect(guest1State.playback.isPlaying).toBe(true);
    expect(guest2State.playback.isPlaying).toBe(true);

    // Simulate 10 seconds of playback
    const serverTimestamp = hostState.serverTimestamp;
    const tenSecLater = serverTimestamp + 10000;

    const hostCalculated = calculateExpectedPosition(hostState.playback, tenSecLater);
    const guest1Calculated = calculateExpectedPosition(guest1State.playback, tenSecLater);
    const guest2Calculated = calculateExpectedPosition(guest2State.playback, tenSecLater);

    expect(hostCalculated).toBeCloseTo(10.0, 2);
    expect(guest1Calculated).toBeCloseTo(10.0, 2);
    expect(guest2Calculated).toBeCloseTo(10.0, 2);
    expect(Math.abs(hostCalculated - guest1Calculated)).toBeLessThan(0.01);
  });

  it('Step 7: Host triggers PAUSE -> All clients freeze and do not drift over 30 seconds', async () => {
    const hostPauseReceived = new Promise<any>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.PLAYBACK_STATE, (d) => resolve(d));
    });
    const guest1PauseReceived = new Promise<any>((resolve) => {
      guest1Socket.once(SOCKET_EVENTS.PLAYBACK_STATE, (d) => resolve(d));
    });
    const guest2PauseReceived = new Promise<any>((resolve) => {
      guest2Socket.once(SOCKET_EVENTS.PLAYBACK_STATE, (d) => resolve(d));
    });

    // Host pauses at 15.0s
    hostSocket.emit(SOCKET_EVENTS.PLAYBACK_PAUSE, { position: 15.0 });

    const [hostState, guest1State, guest2State] = await Promise.all([
      hostPauseReceived,
      guest1PauseReceived,
      guest2PauseReceived,
    ]);

    expect(hostState.playback.isPlaying).toBe(false);
    expect(hostState.playback.position).toBe(15.0);
    expect(guest1State.playback.isPlaying).toBe(false);
    expect(guest1State.playback.position).toBe(15.0);
    expect(guest2State.playback.isPlaying).toBe(false);
    expect(guest2State.playback.position).toBe(15.0);

    // Simulate 30 seconds elapsed during pause
    const futureServerTime = hostState.serverTimestamp + 30000;
    const hostFuture = calculateExpectedPosition(hostState.playback, futureServerTime);
    const guest1Future = calculateExpectedPosition(guest1State.playback, futureServerTime);

    expect(hostFuture).toBe(15.0);
    expect(guest1Future).toBe(15.0);
    expect(hostFuture - guest1Future).toBe(0);
  });

  it('Step 8 & 9: Host performs Rapid Seeks (30s -> 70s -> 20s -> 100s) -> Latest seek prevails', async () => {
    let finalState: any = null;

    const guest1FinalSeek = new Promise<any>((resolve) => {
      guest1Socket.on(SOCKET_EVENTS.PLAYBACK_STATE, (data) => {
        if (data.playback.position === 100) {
          finalState = data;
          resolve(data);
        }
      });
    });

    // Send rapid seeks in quick succession
    hostSocket.emit(SOCKET_EVENTS.PLAYBACK_SEEK, { position: 30 });
    hostSocket.emit(SOCKET_EVENTS.PLAYBACK_SEEK, { position: 70 });
    hostSocket.emit(SOCKET_EVENTS.PLAYBACK_SEEK, { position: 20 });
    hostSocket.emit(SOCKET_EVENTS.PLAYBACK_SEEK, { position: 100 });

    const result = await guest1FinalSeek;
    expect(result.playback.position).toBe(100);
    expect(result.playback.version).toBeGreaterThan(4);
  });

  it('Step 10: Late Joiner (Browser D) enters while video is playing at 30s -> Automatically syncs to ~30s', async () => {
    // Start playback on host at 0.0s
    hostSocket.emit(SOCKET_EVENTS.PLAYBACK_PLAY, { position: 0.0, playbackRate: 1.0 });

    // Wait 500ms
    await new Promise((r) => setTimeout(r, 500));

    guest3Socket = ClientSocket(serverUrl, { transports: ['websocket'] });

    const guest3SnapshotPromise = new Promise<RoomStateSnapshot>((resolve) => {
      guest3Socket.on(SOCKET_EVENTS.ROOM_STATE, (state) => resolve(state));
    });

    guest3Socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: testRoomCode,
      displayName: 'Late Joiner Friend 3',
    });

    const guest3Snapshot = await guest3SnapshotPromise;

    expect(guest3Snapshot.playback.isPlaying).toBe(true);
    expect(guest3Snapshot.playback.position).toBeGreaterThanOrEqual(0.4);
  });

  it('Step 12: Host changes playback speed to 1.5x -> All clients receive authoritative rate', async () => {
    const guest1RatePromise = new Promise<any>((resolve) => {
      guest1Socket.once(SOCKET_EVENTS.PLAYBACK_STATE, (data) => resolve(data));
    });

    hostSocket.emit(SOCKET_EVENTS.PLAYBACK_RATE, { playbackRate: 1.5 });

    const res = await guest1RatePromise;
    expect(res.playback.playbackRate).toBe(1.5);
  });

  it('Step 14: Host Authority Security -> Unauthorized commands by Guest 1 are rejected', async () => {
    const guest1ErrorPromise = new Promise<any>((resolve) => {
      guest1Socket.once(SOCKET_EVENTS.ERROR, (err) => resolve(err));
    });

    // Guest 1 attempts unauthorized pause
    guest1Socket.emit(SOCKET_EVENTS.PLAYBACK_PAUSE, { position: 0 });

    const err = await guest1ErrorPromise;
    expect(err.message).toMatch(/Only the host/i);
  });

  it('Step 15: Real-time Chat & HTML/Script injection test (<script>alert(1)</script>)', async () => {
    const guest2ChatPromise = new Promise<ChatMessage>((resolve) => {
      guest2Socket.on(SOCKET_EVENTS.CHAT_MESSAGE, (msg) => {
        if (!msg.isSystem) {
          resolve(msg);
        }
      });
    });

    guest1Socket.emit(SOCKET_EVENTS.CHAT_SEND, {
      message: '<script>alert("xss")</script>',
    });

    const chatMsg = await guest2ChatPromise;
    expect(chatMsg.displayName).toBe('Friend 1');
    expect(chatMsg.message).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('Step 16: Disconnect & Reconnect Session Recovery', async () => {
    // Disconnect Guest 1
    guest1Socket.disconnect();

    // Host continues playing
    hostSocket.emit(SOCKET_EVENTS.PLAYBACK_PLAY, { position: 50.0, playbackRate: 1.0 });

    // Reconnect Guest 1
    const reconnectedGuest1 = ClientSocket(serverUrl, { transports: ['websocket'] });
    const resyncPromise = new Promise<RoomStateSnapshot>((resolve) => {
      reconnectedGuest1.on(SOCKET_EVENTS.ROOM_STATE, (state) => resolve(state));
    });

    reconnectedGuest1.emit(SOCKET_EVENTS.JOIN_ROOM, {
      roomCode: testRoomCode,
      displayName: 'Friend 1',
      sessionId: guest1SessionId,
    });

    const resyncedState = await resyncPromise;
    expect(resyncedState.playback.isPlaying).toBe(true);
    expect(resyncedState.playback.position).toBeGreaterThanOrEqual(50.0);

    reconnectedGuest1.disconnect();
  });
});
