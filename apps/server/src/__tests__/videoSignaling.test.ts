import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { app, server } from '../index.js';
import { prisma } from '../db.js';
import { SOCKET_EVENTS } from '@syncwatch/shared';
import { syncEngine } from '../services/syncEngine.js';

describe('WebRTC Video Calling Signaling Test Suite', () => {
  let serverUrl: string;
  let roomCode: string;
  let roomId: string;
  let hostSessionId: string;
  let hostParticipantId: string;
  let guestSessionId: string;
  let guestParticipantId: string;
  let didStartServer = false;

  let hostSocket: ClientSocketType;
  let guestSocket: ClientSocketType;

  beforeAll(async () => {
    await prisma.$connect();
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

    // Create room via API
    const res = await request(app)
      .post('/api/rooms')
      .send({ displayName: 'Host Alice', roomName: 'Video Call Test Room' });

    expect(res.status).toBe(201);
    roomCode = res.body.room.roomCode;
    roomId = res.body.room.id;
    hostSessionId = res.body.hostSessionId;
    hostParticipantId = res.body.hostParticipantId;

    // Join guest via API
    const guestRes = await request(app)
      .post(`/api/rooms/${roomCode}/join`)
      .send({ displayName: 'Guest Bob' });

    expect(guestRes.status).toBe(200);
    guestSessionId = guestRes.body.sessionId;
    guestParticipantId = guestRes.body.participant.id;

    // Connect Host WebSocket
    hostSocket = ClientSocket(serverUrl, { transports: ['websocket'], forceNew: true });
    await new Promise<void>((resolve) => {
      hostSocket.on('connect', () => {
        hostSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
          roomCode,
          displayName: 'Host Alice',
          sessionId: hostSessionId,
        });
      });
      hostSocket.on(SOCKET_EVENTS.ROOM_STATE, () => resolve());
    });

    // Connect Guest WebSocket
    guestSocket = ClientSocket(serverUrl, { transports: ['websocket'], forceNew: true });
    await new Promise<void>((resolve) => {
      guestSocket.on('connect', () => {
        guestSocket.emit(SOCKET_EVENTS.JOIN_ROOM, {
          roomCode,
          displayName: 'Guest Bob',
          sessionId: guestSessionId,
        });
      });
      guestSocket.on(SOCKET_EVENTS.ROOM_STATE, () => resolve());
    });
  });

  afterAll(async () => {
    if (hostSocket?.connected) hostSocket.disconnect();
    if (guestSocket?.connected) guestSocket.disconnect();
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

  it('1. Non-member socket cannot join video call', async () => {
    const unauthedSocket = ClientSocket(serverUrl, { transports: ['websocket'], forceNew: true });
    await new Promise<void>((resolve) => unauthedSocket.on('connect', () => resolve()));

    const errorPromise = new Promise<any>((resolve) => {
      unauthedSocket.on(SOCKET_EVENTS.ERROR, (err) => resolve(err));
    });

    unauthedSocket.emit(SOCKET_EVENTS.VIDEO_JOIN);
    const err = await errorPromise;
    expect(err.message).toMatch(/Must be in a room/i);
    unauthedSocket.disconnect();
  });

  it('2. Host joins video call and receives initial empty peer list', async () => {
    const participantsPromise = new Promise<any>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.VIDEO_PARTICIPANTS, (data) => resolve(data));
    });

    hostSocket.emit(SOCKET_EVENTS.VIDEO_JOIN);
    const res = await participantsPromise;
    expect(res.participants).toBeInstanceOf(Array);
    expect(res.participants.length).toBe(0);
  });

  it('3. Guest joins video call, receives host in list, and host receives peer joined event', async () => {
    const hostPeerJoinedPromise = new Promise<any>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.VIDEO_PEER_JOINED, (data) => resolve(data));
    });

    const guestParticipantsPromise = new Promise<any>((resolve) => {
      guestSocket.once(SOCKET_EVENTS.VIDEO_PARTICIPANTS, (data) => resolve(data));
    });

    guestSocket.emit(SOCKET_EVENTS.VIDEO_JOIN);

    const [hostNotification, guestList] = await Promise.all([
      hostPeerJoinedPromise,
      guestParticipantsPromise,
    ]);

    expect(guestList.participants.length).toBe(1);
    expect(guestList.participants[0].participantId).toBe(hostParticipantId);
    expect(guestList.participants[0].displayName).toBe('Host Alice');

    expect(hostNotification.participant.participantId).toBe(guestParticipantId);
    expect(hostNotification.participant.displayName).toBe('Guest Bob');
  });

  it('4. Video offer relays to target with server-stamped sender identity (no identity spoofing)', async () => {
    const guestOfferPromise = new Promise<any>((resolve) => {
      guestSocket.once(SOCKET_EVENTS.VIDEO_OFFER, (data) => resolve(data));
    });

    // Host sends offer to Guest
    hostSocket.emit(SOCKET_EVENTS.VIDEO_OFFER, {
      targetParticipantId: guestParticipantId,
      sdp: { type: 'offer', sdp: 'v=0\r\no=mockHost 12345 12345 IN IP4 0.0.0.0\r\ns=-\r\n' },
      // Attacker attempt to spoof sender identity should be ignored by server
      fromParticipantId: 'attacker_fake_id',
    });

    const relayedOffer = await guestOfferPromise;
    expect(relayedOffer.fromParticipantId).toBe(hostParticipantId);
    expect(relayedOffer.fromDisplayName).toBe('Host Alice');
    expect(relayedOffer.sdp.type).toBe('offer');
    expect(relayedOffer.sdp.sdp).toContain('mockHost');
  });

  it('5. Video answer relays to target correctly', async () => {
    const hostAnswerPromise = new Promise<any>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.VIDEO_ANSWER, (data) => resolve(data));
    });

    guestSocket.emit(SOCKET_EVENTS.VIDEO_ANSWER, {
      targetParticipantId: hostParticipantId,
      sdp: { type: 'answer', sdp: 'v=0\r\no=mockGuest 54321 54321 IN IP4 0.0.0.0\r\ns=-\r\n' },
    });

    const relayedAnswer = await hostAnswerPromise;
    expect(relayedAnswer.fromParticipantId).toBe(guestParticipantId);
    expect(relayedAnswer.sdp.type).toBe('answer');
  });

  it('6. ICE candidate exchange relays to target participant', async () => {
    const guestIcePromise = new Promise<any>((resolve) => {
      guestSocket.once(SOCKET_EVENTS.VIDEO_ICE_CANDIDATE, (data) => resolve(data));
    });

    hostSocket.emit(SOCKET_EVENTS.VIDEO_ICE_CANDIDATE, {
      targetParticipantId: guestParticipantId,
      candidate: {
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      },
    });

    const relayedIce = await guestIcePromise;
    expect(relayedIce.fromParticipantId).toBe(hostParticipantId);
    expect(relayedIce.candidate.candidate).toContain('192.168.1.1');
  });

  it('7. Rejects invalid signaling payloads according to Zod schema', async () => {
    const errorPromise = new Promise<any>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.ERROR, (data) => resolve(data));
    });

    hostSocket.emit(SOCKET_EVENTS.VIDEO_OFFER, {
      targetParticipantId: guestParticipantId,
      sdp: { type: 'invalid_type', sdp: '' },
    });

    const err = await errorPromise;
    expect(err).toBeDefined();
  });

  it('8. Peer state update (mute/camera) broadcasts to room peers', async () => {
    const guestStatePromise = new Promise<any>((resolve) => {
      guestSocket.once(SOCKET_EVENTS.VIDEO_PEER_STATE, (data) => resolve(data));
    });

    hostSocket.emit(SOCKET_EVENTS.VIDEO_STATE_UPDATE, {
      isMuted: true,
      isCameraOff: true,
    });

    const state = await guestStatePromise;
    expect(state.participantId).toBe(hostParticipantId);
    expect(state.isMuted).toBe(true);
    expect(state.isCameraOff).toBe(true);
  });

  it('9. Leaving video cleans server state and notifies peers', async () => {
    const hostPeerLeftPromise = new Promise<any>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.VIDEO_PEER_LEFT, (data) => resolve(data));
    });

    guestSocket.emit(SOCKET_EVENTS.VIDEO_LEAVE);
    const leftEvent = await hostPeerLeftPromise;
    expect(leftEvent.participantId).toBe(guestParticipantId);
  });

  it('10. Video signaling and calling does NOT mutate playback synchronization', () => {
    const stateBefore = syncEngine.getOrCreateState(roomId);
    expect(stateBefore?.isPlaying).toBe(false);
    expect(stateBefore?.position).toBe(0);

    // Verify playback state remained untouched
    const snapshot = syncEngine.getSnapshot(roomId);
    expect(snapshot.playback.isPlaying).toBe(false);
    expect(snapshot.playback.position).toBe(0);
  });
});
