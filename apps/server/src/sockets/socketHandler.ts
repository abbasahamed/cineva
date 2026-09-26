import { Server as SocketIOServer, Socket } from 'socket.io';
import { roomManager } from '../services/roomManager.js';
import { syncEngine } from '../services/syncEngine.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import {
  SOCKET_EVENTS,
  JoinRoomSchema,
  SendChatMessageSchema,
  SeekPayloadSchema,
  RatePayloadSchema,
  UpdateMediaTitleSchema,
  ClockSyncPing,
  formatTime,
  PlaybackActivityType,
} from '@syncwatch/shared';
import { CONFIG } from '../config.js';
import { logger } from '../utils/logger.js';

interface SocketData {
  roomId?: string;
  sessionId?: string;
  participantId?: string;
  displayName?: string;
  isHost?: boolean;
}

interface PendingSeek {
  roomId: string;
  participantId: string;
  displayName: string;
  position: number;
  timer: NodeJS.Timeout;
  timestamp: number;
}

export function setupSocketHandlers(io: SocketIOServer) {
  // Rate limiting for chat messages per socket
  const chatRateLimit = new Map<string, { count: number; resetTime: number }>();
  const playbackActivityRateLimit = new Map<string, { count: number; resetTime: number }>();
  const disconnectTimers = new Map<string, NodeJS.Timeout>();
  const pendingSeeks = new Map<string, PendingSeek>();

  const isPlaybackActivityAllowed = (socketId: string): boolean => {
    const now = Date.now();
    const record = playbackActivityRateLimit.get(socketId) || { count: 0, resetTime: now + 2000 };
    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + 2000;
    }
    record.count += 1;
    playbackActivityRateLimit.set(socketId, record);
    return record.count <= 6;
  };

  const broadcastPlaybackActivity = async (
    roomId: string,
    participantId: string,
    displayName: string,
    type: PlaybackActivityType,
    position: number,
    customMessage?: string
  ) => {
    let msgText = customMessage;
    if (!msgText) {
      const timeStr = formatTime(position);
      if (type === 'PLAY') {
        msgText = `${displayName} started playing from ${timeStr}.`;
      } else if (type === 'PAUSE') {
        msgText = `${displayName} paused the movie.`;
      } else if (type === 'SEEK') {
        msgText = `${displayName} jumped to ${timeStr}.`;
      }
    }

    if (!msgText) return;

    // Save as system chat message in database
    const sysMsg = await roomManager.saveChatMessage(
      roomId,
      'system',
      'System',
      msgText,
      true
    );

    // Emit to room as regular chat message (integrates into Cinema Chat stream)
    io.to(roomId).emit(SOCKET_EVENTS.CHAT_MESSAGE, sysMsg);

    // Also emit dedicated playback:activity event
    io.to(roomId).emit(SOCKET_EVENTS.PLAYBACK_ACTIVITY, {
      type,
      participantId,
      displayName,
      currentTime: position,
      message: msgText,
      timestamp: Date.now(),
    });
  };

  io.on('connection', (socket: Socket) => {
    const socketData: SocketData = {};

    // 1. Clock Sync Ping / Pong (High-frequency, lightweight)
    socket.on(SOCKET_EVENTS.PING, (data: ClockSyncPing) => {
      socket.emit(SOCKET_EVENTS.PONG, {
        clientTime: data.clientTime,
        serverTime: Date.now(),
      });
    });

    // 2. Join Room
    socket.on(SOCKET_EVENTS.JOIN_ROOM, async (payload: unknown) => {
      try {
        const parsed = JoinRoomSchema.safeParse(payload);
        if (!parsed.success) {
          socket.emit(SOCKET_EVENTS.ERROR, { message: parsed.error.errors[0].message });
          return;
        }

        const { roomCode, displayName, sessionId } = parsed.data;
        const joinResult = await roomManager.joinRoom({
          roomCode,
          displayName,
          sessionId,
        });

        const roomId = joinResult.room.id;
        socketData.roomId = roomId;
        socketData.sessionId = joinResult.sessionId;
        socketData.participantId = joinResult.participant.id;
        socketData.displayName = joinResult.participant.displayName;
        socketData.isHost = joinResult.participant.isHost;

        // Clear any disconnect timer for this session
        const timerKey = `${roomId}:${joinResult.sessionId}`;
        if (disconnectTimers.has(timerKey)) {
          clearTimeout(disconnectTimers.get(timerKey)!);
          disconnectTimers.delete(timerKey);
        }

        // Join Socket.io room channel
        socket.join(roomId);

        // Send full initial state snapshot to joining user
        const snapshot = await roomManager.getRoomSnapshot(roomId, joinResult.sessionId);
        if (snapshot) {
          socket.emit(SOCKET_EVENTS.ROOM_STATE, snapshot);
        }

        // Send recent chat history
        const chatHistory = await roomManager.getRecentChat(roomId);
        socket.emit(SOCKET_EVENTS.CHAT_HISTORY, chatHistory);

        // Notify room about participant presence
        const participants = await roomManager.getParticipants(roomId);
        io.to(roomId).emit(SOCKET_EVENTS.PARTICIPANT_JOINED, {
          participant: joinResult.participant,
          participants,
        });

        if (joinResult.isNew) {
          const sysMsg = await roomManager.saveChatMessage(
            roomId,
            'system',
            'System',
            `${displayName} joined the room.`,
            true
          );
          io.to(roomId).emit(SOCKET_EVENTS.CHAT_MESSAGE, sysMsg);
        }

        logger.info('HOST IDENTITY RESOLVED ON SOCKET JOIN', {
          socketId: socket.id,
          roomId,
          roomCode,
          clientSessionId: joinResult.sessionId,
          roomHostSessionId: joinResult.room.hostSessionId,
          participantId: joinResult.participant.id,
          isHost: joinResult.participant.isHost,
          displayName,
        });

        logger.participantJoined(roomCode, displayName, joinResult.participant.isHost);
      } catch (err: any) {
        logger.socketError('join_room', err.message || 'Failed to join room');
        socket.emit(SOCKET_EVENTS.ROOM_NOT_FOUND, { message: err.message || 'Failed to join room' });
      }
    });

    // 3. Playback Controls
    socket.on(SOCKET_EVENTS.PLAYBACK_PLAY, async (payload: { position?: number; playbackRate?: number }) => {
      if (!socketData.roomId || !socketData.sessionId || !socketData.displayName || !socketData.participantId) return;
      const canControl = socketData.isHost ? true : (await roomManager.canControlPlayback(socketData.roomId, socketData.sessionId));
      if (!canControl) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only the host can control playback.' });
        return;
      }

      const now = Date.now();
      const newState = syncEngine.play(socketData.roomId, payload?.position, payload?.playbackRate, now);

      io.to(socketData.roomId).emit(SOCKET_EVENTS.PLAYBACK_STATE, {
        playback: newState,
        serverTimestamp: now,
      });

      const seekKey = `${socketData.roomId}:${socketData.sessionId}`;
      if (pendingSeeks.has(seekKey)) {
        const pending = pendingSeeks.get(seekKey)!;
        clearTimeout(pending.timer);
        pendingSeeks.delete(seekKey);
      }

      if (isPlaybackActivityAllowed(socket.id)) {
        const effectivePos = Number.isFinite(newState.position) ? newState.position : (payload?.position ?? 0);
        await broadcastPlaybackActivity(
          socketData.roomId,
          socketData.participantId,
          socketData.displayName,
          'PLAY',
          effectivePos
        );
      }
    });

    socket.on(SOCKET_EVENTS.PLAYBACK_PAUSE, async (payload: { position?: number }) => {
      if (!socketData.roomId || !socketData.sessionId || !socketData.displayName || !socketData.participantId) return;
      const canControl = socketData.isHost ? true : (await roomManager.canControlPlayback(socketData.roomId, socketData.sessionId));
      if (!canControl) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only the host can control playback.' });
        return;
      }

      const now = Date.now();
      const newState = syncEngine.pause(socketData.roomId, payload?.position, now);

      io.to(socketData.roomId).emit(SOCKET_EVENTS.PLAYBACK_STATE, {
        playback: newState,
        serverTimestamp: now,
      });

      const seekKey = `${socketData.roomId}:${socketData.sessionId}`;
      if (pendingSeeks.has(seekKey)) {
        const pending = pendingSeeks.get(seekKey)!;
        clearTimeout(pending.timer);
        pendingSeeks.delete(seekKey);
      }

      if (isPlaybackActivityAllowed(socket.id)) {
        const effectivePos = Number.isFinite(newState.position) ? newState.position : (payload?.position ?? 0);
        await broadcastPlaybackActivity(
          socketData.roomId,
          socketData.participantId,
          socketData.displayName,
          'PAUSE',
          effectivePos
        );
      }
    });

    socket.on(SOCKET_EVENTS.PLAYBACK_SEEK, async (payload: unknown) => {
      if (!socketData.roomId || !socketData.sessionId || !socketData.displayName || !socketData.participantId) return;
      const parsed = SeekPayloadSchema.safeParse(payload);
      if (!parsed.success) return;

      const canControl = socketData.isHost ? true : (await roomManager.canControlPlayback(socketData.roomId, socketData.sessionId));
      if (!canControl) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only the host can seek playback.' });
        return;
      }

      const now = Date.now();
      const newState = syncEngine.seek(socketData.roomId, parsed.data.position, now);

      io.to(socketData.roomId).emit(SOCKET_EVENTS.PLAYBACK_STATE, {
        playback: newState,
        serverTimestamp: now,
      });

      if (!isPlaybackActivityAllowed(socket.id)) {
        return;
      }

      const seekKey = `${socketData.roomId}:${socketData.sessionId}`;
      if (pendingSeeks.has(seekKey)) {
        clearTimeout(pendingSeeks.get(seekKey)!.timer);
      }

      const roomId = socketData.roomId;
      const participantId = socketData.participantId;
      const displayName = socketData.displayName;
      const targetPos = parsed.data.position;

      const timer = setTimeout(async () => {
        pendingSeeks.delete(seekKey);
        await broadcastPlaybackActivity(roomId, participantId, displayName, 'SEEK', targetPos);
      }, 350);

      pendingSeeks.set(seekKey, {
        roomId,
        participantId,
        displayName,
        position: targetPos,
        timer,
        timestamp: now,
      });
    });

    socket.on(SOCKET_EVENTS.PLAYBACK_RATE, async (payload: unknown) => {
      if (!socketData.roomId || !socketData.sessionId) return;
      const parsed = RatePayloadSchema.safeParse(payload);
      if (!parsed.success) return;

      const canControl = socketData.isHost ? true : (await roomManager.canControlPlayback(socketData.roomId, socketData.sessionId));
      if (!canControl) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only the host can change playback speed.' });
        return;
      }

      const now = Date.now();
      const newState = syncEngine.setPlaybackRate(socketData.roomId, parsed.data.playbackRate, now);

      io.to(socketData.roomId).emit(SOCKET_EVENTS.PLAYBACK_STATE, {
        playback: newState,
        serverTimestamp: now,
      });
    });

    // 4. Room Management & Settings
    socket.on(SOCKET_EVENTS.ROOM_UPDATE_SETTINGS, async (payload: { allowGuestControl?: boolean }) => {
      if (!socketData.roomId || !socketData.sessionId) return;
      const isHost = await roomManager.isHost(socketData.roomId, socketData.sessionId);
      if (!isHost) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only the host can modify room settings.' });
        return;
      }

      await roomManager.updateRoomSettings(socketData.roomId, payload);
      const roomInfo = await roomManager.getRoomInfo(socketData.roomId);

      const sysMsg = await roomManager.saveChatMessage(
        socketData.roomId,
        'system',
        'System',
        payload.allowGuestControl
          ? 'Host enabled guest playback controls.'
          : 'Host restricted playback controls to host-only.',
        true
      );

      io.to(socketData.roomId).emit(SOCKET_EVENTS.CHAT_MESSAGE, sysMsg);
      io.to(socketData.roomId).emit('room:updated', { room: roomInfo });
    });

    socket.on(SOCKET_EVENTS.ROOM_UPDATE_TITLE, async (payload: unknown) => {
      if (!socketData.roomId || !socketData.sessionId) return;
      const parsed = UpdateMediaTitleSchema.safeParse(payload);
      if (!parsed.success) return;

      const isHost = await roomManager.isHost(socketData.roomId, socketData.sessionId);
      if (!isHost) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only the host can edit media title.' });
        return;
      }

      await roomManager.updateMediaTitle(socketData.roomId, parsed.data.title);
      const roomInfo = await roomManager.getRoomInfo(socketData.roomId);
      io.to(socketData.roomId).emit('room:updated', { room: roomInfo });
    });

    socket.on(SOCKET_EVENTS.ROOM_KICK_PARTICIPANT, async (payload: { participantId: string }) => {
      if (!socketData.roomId || !socketData.sessionId || !payload?.participantId) return;
      const isHost = await roomManager.isHost(socketData.roomId, socketData.sessionId);
      if (!isHost) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only the host can kick participants.' });
        return;
      }

      await roomManager.kickParticipant(socketData.roomId, payload.participantId);
      const participants = await roomManager.getParticipants(socketData.roomId);

      io.to(socketData.roomId).emit(SOCKET_EVENTS.PARTICIPANT_KICKED, {
        kickedParticipantId: payload.participantId,
        participants,
      });
    });

    socket.on(SOCKET_EVENTS.ROOM_END, async () => {
      if (!socketData.roomId || !socketData.sessionId) return;
      const isHost = await roomManager.isHost(socketData.roomId, socketData.sessionId);
      if (!isHost) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only the host can end the room.' });
        return;
      }

      await roomManager.endRoom(socketData.roomId);
      logger.roomEnded(socketData.roomId);
      io.to(socketData.roomId).emit(SOCKET_EVENTS.ROOM_ENDED, { message: 'The host has ended this watch room.' });
    });

    // 5. Chat Messaging
    socket.on(SOCKET_EVENTS.CHAT_SEND, async (payload: unknown) => {
      if (!socketData.roomId || !socketData.participantId || !socketData.displayName) return;

      const parsed = SendChatMessageSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: parsed.error.errors[0].message });
        return;
      }

      // Basic Rate Limiting (max 5 messages per 3 seconds)
      const now = Date.now();
      const rateKey = socket.id;
      const record = chatRateLimit.get(rateKey) || { count: 0, resetTime: now + 3000 };
      if (now > record.resetTime) {
        record.count = 0;
        record.resetTime = now + 3000;
      }
      record.count += 1;
      chatRateLimit.set(rateKey, record);

      if (record.count > 5) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'You are sending messages too fast. Please slow down.' });
        return;
      }

      const sanitized = sanitizeHtml(parsed.data.message);
      const chatMessage = await roomManager.saveChatMessage(
        socketData.roomId,
        socketData.participantId,
        socketData.displayName,
        sanitized,
        false
      );

      io.to(socketData.roomId).emit(SOCKET_EVENTS.CHAT_MESSAGE, chatMessage);
    });

    // 6. Disconnect Handling with Grace Period
    socket.on('disconnect', () => {
      if (!socketData.roomId || !socketData.sessionId) return;

      const roomId = socketData.roomId;
      const sessionId = socketData.sessionId;
      const displayName = socketData.displayName;
      const timerKey = `${roomId}:${sessionId}`;

      // Set grace-period timer before marking offline
      const timer = setTimeout(async () => {
        await roomManager.setParticipantOnline(roomId, sessionId, false);
        const participants = await roomManager.getParticipants(roomId);

        io.to(roomId).emit(SOCKET_EVENTS.PARTICIPANT_LEFT, {
          sessionId,
          participants,
        });

        if (displayName) {
          const sysMsg = await roomManager.saveChatMessage(
            roomId,
            'system',
            'System',
            `${displayName} left the room.`,
            true
          );
          io.to(roomId).emit(SOCKET_EVENTS.CHAT_MESSAGE, sysMsg);
        }

        logger.participantDisconnected(roomId, displayName);
        disconnectTimers.delete(timerKey);
      }, CONFIG.ROOM_GRACE_PERIOD_MS);

      const seekKey = `${roomId}:${sessionId}`;
      if (pendingSeeks.has(seekKey)) {
        clearTimeout(pendingSeeks.get(seekKey)!.timer);
        pendingSeeks.delete(seekKey);
      }

      disconnectTimers.set(timerKey, timer);
      chatRateLimit.delete(socket.id);
      playbackActivityRateLimit.delete(socket.id);
    });
  });
}
