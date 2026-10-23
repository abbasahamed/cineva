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
  VideoOfferSchema,
  VideoAnswerSchema,
  VideoIceCandidateSchema,
  VideoStateUpdateSchema,
  VideoParticipant,
} from '@syncwatch/shared';
import { CONFIG } from '../config.js';
import { logger } from '../utils/logger.js';
import { mediaJobQueue } from '../services/media/mediaJobQueue.js';

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

  interface ActiveVideoParticipant {
    socketId: string;
    participantId: string;
    displayName: string;
    isMuted: boolean;
    isCameraOff: boolean;
    joinedAt: number;
  }

  // Room active video participants: roomId -> (participantId -> ActiveVideoParticipant)
  const roomVideoParticipants = new Map<string, Map<string, ActiveVideoParticipant>>();
  // Room connected participant sockets: roomId -> (participantId -> { socketId, displayName })
  const roomParticipantSockets = new Map<string, Map<string, { socketId: string; displayName: string }>>();
  // Active sockets per session: `${roomId}:${sessionId}` -> Set<socketId>
  const activeSessionSockets = new Map<string, Set<string>>();
  const roomSubtitles = new Map<string, { filename: string; vttContent: string }>();
  const videoSignalingRateLimit = new Map<string, { count: number; resetTime: number }>();

  const isVideoSignalingAllowed = (socketId: string): boolean => {
    const now = Date.now();
    const record = videoSignalingRateLimit.get(socketId) || { count: 0, resetTime: now + 5000 };
    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + 5000;
    }
    record.count += 1;
    videoSignalingRateLimit.set(socketId, record);
    return record.count <= 100;
  };

  const cleanVideoParticipant = (roomId: string, participantId: string) => {
    const roomVideos = roomVideoParticipants.get(roomId);
    if (!roomVideos) return;
    if (roomVideos.has(participantId)) {
      roomVideos.delete(participantId);
      io.to(roomId).emit(SOCKET_EVENTS.VIDEO_PEER_LEFT, { participantId });
      logger.info('VIDEO_CALL_PARTICIPANT_LEFT', { roomId, participantId });
    }
    if (roomVideos.size === 0) {
      roomVideoParticipants.delete(roomId);
    }
  };

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

        // Clear any disconnect timer for this session & track active socket
        const timerKey = `${roomId}:${joinResult.sessionId}`;

        let sessionSocketsSet = activeSessionSockets.get(timerKey);
        if (!sessionSocketsSet) {
          sessionSocketsSet = new Set();
          activeSessionSockets.set(timerKey, sessionSocketsSet);
        }
        sessionSocketsSet.add(socket.id);

        if (disconnectTimers.has(timerKey)) {
          clearTimeout(disconnectTimers.get(timerKey)!);
          disconnectTimers.delete(timerKey);
        }

        // Join Socket.io room channel
        socket.join(roomId);

        // Track connected room participant socket for direct signaling
        let roomSockets = roomParticipantSockets.get(roomId);
        if (!roomSockets) {
          roomSockets = new Map();
          roomParticipantSockets.set(roomId, roomSockets);
        }
        roomSockets.set(joinResult.participant.id, {
          socketId: socket.id,
          displayName: joinResult.participant.displayName,
        });

        // Send full initial state snapshot to joining user
        const snapshot = await roomManager.getRoomSnapshot(roomId, joinResult.sessionId);
        if (snapshot) {
          socket.emit(SOCKET_EVENTS.ROOM_STATE, snapshot);
        }

        // Send current room subtitle if any
        const currentSubtitle = roomSubtitles.get(roomId);
        if (currentSubtitle) {
          socket.emit(SOCKET_EVENTS.SUBTITLE_STATE, currentSubtitle);
        }

        // Send current active video participants in room to joining user
        const activeVideos = roomVideoParticipants.get(roomId);
        if (activeVideos && activeVideos.size > 0) {
          const activeList: VideoParticipant[] = [];
          for (const p of activeVideos.values()) {
            if (p.participantId !== joinResult.participant.id) {
              activeList.push({
                participantId: p.participantId,
                displayName: p.displayName,
                isMuted: p.isMuted,
                isCameraOff: p.isCameraOff,
                joinedAt: p.joinedAt,
              });
            }
          }
          if (activeList.length > 0) {
            socket.emit(SOCKET_EVENTS.VIDEO_PARTICIPANTS, { participants: activeList });
          }
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

    socket.on(SOCKET_EVENTS.SUBTITLE_UPDATE, (payload: { filename?: string; vttContent?: string }) => {
      if (!socketData.roomId || !payload || typeof payload.vttContent !== 'string') return;
      // Cap at 1MB to prevent abuse
      if (payload.vttContent.length > 1024 * 1024) return;
      const subData = {
        filename: payload.filename || 'Subtitles.srt',
        vttContent: payload.vttContent,
      };
      roomSubtitles.set(socketData.roomId, subData);
      io.to(socketData.roomId).emit(SOCKET_EVENTS.SUBTITLE_STATE, subData);
      logger.info('ROOM_SUBTITLE_UPDATED', {
        roomId: socketData.roomId,
        filename: subData.filename,
        by: socketData.displayName,
      });
    });

    socket.on(SOCKET_EVENTS.ROOM_KICK_PARTICIPANT, async (payload: { participantId: string }) => {
      if (!socketData.roomId || !socketData.sessionId || !payload?.participantId) return;
      const isHost = await roomManager.isHost(socketData.roomId, socketData.sessionId);
      if (!isHost) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only the host can kick participants.' });
        return;
      }

      await roomManager.kickParticipant(socketData.roomId, payload.participantId);
      cleanVideoParticipant(socketData.roomId, payload.participantId);
      const participants = await roomManager.getParticipants(socketData.roomId);

      io.to(socketData.roomId).emit(SOCKET_EVENTS.PARTICIPANT_KICKED, {
        kickedParticipantId: payload.participantId,
        participants,
      });
    });

    socket.on(SOCKET_EVENTS.LEAVE_ROOM, async () => {
      if (!socketData.roomId || !socketData.sessionId) return;
      const roomId = socketData.roomId;
      const sessionId = socketData.sessionId;

      const isHost = await roomManager.isHost(roomId, sessionId).catch(() => false);
      if (isHost) {
        const timerKey = `${roomId}:${sessionId}`;
        if (disconnectTimers.has(timerKey)) {
          clearTimeout(disconnectTimers.get(timerKey)!);
          disconnectTimers.delete(timerKey);
        }
        roomVideoParticipants.delete(roomId);
        await roomManager.endRoom(roomId);
        logger.roomEnded(roomId);
        io.to(roomId).emit(SOCKET_EVENTS.ROOM_CANCELLED, {
          message: 'The host has left the room. This screening has ended.',
        });
      } else {
        await roomManager.setParticipantOnline(roomId, sessionId, false);
        const participants = await roomManager.getParticipants(roomId);
        socket.to(roomId).emit(SOCKET_EVENTS.PARTICIPANT_LEFT, {
          sessionId,
          participants,
        });
        if (socketData.displayName) {
          const sysMsg = await roomManager.saveChatMessage(
            roomId,
            'system',
            'System',
            `${socketData.displayName} left the room.`,
            true
          );
          io.to(roomId).emit(SOCKET_EVENTS.CHAT_MESSAGE, sysMsg);
        }
        socket.leave(roomId);
      }
    });

    socket.on(SOCKET_EVENTS.ROOM_END, async () => {
      if (!socketData.roomId || !socketData.sessionId) return;
      const isHost = await roomManager.isHost(socketData.roomId, socketData.sessionId);
      if (!isHost) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only the host can end the room.' });
        return;
      }

      const timerKey = `${socketData.roomId}:${socketData.sessionId}`;
      if (disconnectTimers.has(timerKey)) {
        clearTimeout(disconnectTimers.get(timerKey)!);
        disconnectTimers.delete(timerKey);
      }

      roomVideoParticipants.delete(socketData.roomId);
      await roomManager.endRoom(socketData.roomId);
      logger.roomEnded(socketData.roomId);
      io.to(socketData.roomId).emit(SOCKET_EVENTS.ROOM_CANCELLED, {
        message: 'The host has left the room. This screening has ended.',
      });
      io.to(socketData.roomId).emit(SOCKET_EVENTS.ROOM_ENDED, { message: 'The host has ended this watch room.' });
    });

    // Media Retry: host requests re-processing of current failed media
    socket.on(SOCKET_EVENTS.MEDIA_RETRY, async () => {
      if (!socketData.roomId || !socketData.sessionId) return;
      const isHost = await roomManager.isHost(socketData.roomId, socketData.sessionId);
      if (!isHost) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Only the host can retry media processing.' });
        return;
      }

      try {
        const room = await roomManager.getRoomById(socketData.roomId);
        if (!room || !room.media) {
          socket.emit(SOCKET_EVENTS.ERROR, { message: 'No media to retry.' });
          return;
        }

        const media = room.media;
        if (media.status !== 'failed') {
          socket.emit(SOCKET_EVENTS.ERROR, { message: 'Media is not in a failed state.' });
          return;
        }

        // Re-enqueue using the originalStorageKey (the file saved before FFmpeg processing)
        const sourceKey = (media as any).originalStorageKey || media.storageKey;
        if (!sourceKey) {
          socket.emit(SOCKET_EVENTS.ERROR, { message: 'No source file available to retry.' });
          return;
        }

        const { mediaStorage } = await import('../services/mediaStorage.js');
        const sourcePath = mediaStorage.getLocalPath(sourceKey);
        if (!sourcePath) {
          socket.emit(SOCKET_EVENTS.ERROR, { message: 'Source file not available for retry.' });
          return;
        }

        const fs = await import('fs');
        if (!fs.existsSync(sourcePath)) {
          socket.emit(SOCKET_EVENTS.ERROR, { message: 'Source file not found on disk.' });
          return;
        }

        // Extract original filename from the source storage key (removes 'source_' prefix)
        const filename = media.filename.replace(/^source_/, '');
        await mediaJobQueue.enqueueMediaProcessing(socketData.roomId, sourcePath, filename, media.title);
        logger.info('MEDIA_RETRY_ENQUEUED', { roomId: socketData.roomId, filename });
      } catch (err: any) {
        logger.error('MEDIA_RETRY_ERROR', { roomId: socketData.roomId, error: err.message });
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to retry media processing.' });
      }
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

    // 6. WebRTC Video Calling Signaling Handlers
    socket.on(SOCKET_EVENTS.VIDEO_JOIN, async () => {
      if (!socketData.roomId || !socketData.participantId || !socketData.displayName) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Must be in a room to join video call.' });
        return;
      }

      const roomId = socketData.roomId;
      const participantId = socketData.participantId;
      const displayName = socketData.displayName;

      let roomVideos = roomVideoParticipants.get(roomId);
      if (!roomVideos) {
        roomVideos = new Map();
        roomVideoParticipants.set(roomId, roomVideos);
      }

      // Collect existing participants currently in video call (excluding self)
      const existingList: VideoParticipant[] = [];
      for (const p of roomVideos.values()) {
        if (p.participantId !== participantId) {
          existingList.push({
            participantId: p.participantId,
            displayName: p.displayName,
            isMuted: p.isMuted,
            isCameraOff: p.isCameraOff,
            joinedAt: p.joinedAt,
          });
        }
      }

      const newParticipant: ActiveVideoParticipant = {
        socketId: socket.id,
        participantId,
        displayName,
        isMuted: false,
        isCameraOff: false,
        joinedAt: Date.now(),
      };
      roomVideos.set(participantId, newParticipant);

      // Send existing participants in call to joining user
      socket.emit(SOCKET_EVENTS.VIDEO_PARTICIPANTS, { participants: existingList });

      // Broadcast to other users in room that a peer joined video call
      socket.to(roomId).emit(SOCKET_EVENTS.VIDEO_PEER_JOINED, {
        participant: {
          participantId: newParticipant.participantId,
          displayName: newParticipant.displayName,
          isMuted: newParticipant.isMuted,
          isCameraOff: newParticipant.isCameraOff,
          joinedAt: newParticipant.joinedAt,
        },
      });

      logger.info('VIDEO_CALL_PARTICIPANT_JOINED', { roomId, participantId, displayName });
    });

    socket.on(SOCKET_EVENTS.VIDEO_LEAVE, () => {
      if (!socketData.roomId || !socketData.participantId) return;
      cleanVideoParticipant(socketData.roomId, socketData.participantId);
    });

    socket.on(SOCKET_EVENTS.VIDEO_OFFER, (payload: unknown) => {
      if (!socketData.roomId || !socketData.participantId || !socketData.displayName) return;
      if (!isVideoSignalingAllowed(socket.id)) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Video signaling rate limit exceeded. Please wait.' });
        return;
      }

      const parsed = VideoOfferSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: parsed.error.errors[0].message });
        return;
      }

      const { targetParticipantId, sdp } = parsed.data;
      if (targetParticipantId === socketData.participantId) return; // Prevent self-signaling

      const roomSockets = roomParticipantSockets.get(socketData.roomId);
      const roomVideos = roomVideoParticipants.get(socketData.roomId);
      const target = roomSockets?.get(targetParticipantId) || roomVideos?.get(targetParticipantId);
      if (!target) return;

      // Authoritative identity: sender cannot forge fromParticipantId
      io.to(target.socketId).emit(SOCKET_EVENTS.VIDEO_OFFER, {
        fromParticipantId: socketData.participantId,
        fromDisplayName: socketData.displayName,
        sdp,
      });
    });

    socket.on(SOCKET_EVENTS.VIDEO_ANSWER, (payload: unknown) => {
      if (!socketData.roomId || !socketData.participantId) return;
      if (!isVideoSignalingAllowed(socket.id)) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Video signaling rate limit exceeded. Please wait.' });
        return;
      }

      const parsed = VideoAnswerSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: parsed.error.errors[0].message });
        return;
      }

      const { targetParticipantId, sdp } = parsed.data;
      if (targetParticipantId === socketData.participantId) return;

      const roomSockets = roomParticipantSockets.get(socketData.roomId);
      const roomVideos = roomVideoParticipants.get(socketData.roomId);
      const target = roomSockets?.get(targetParticipantId) || roomVideos?.get(targetParticipantId);
      if (!target) return;

      io.to(target.socketId).emit(SOCKET_EVENTS.VIDEO_ANSWER, {
        fromParticipantId: socketData.participantId,
        sdp,
      });
    });

    socket.on(SOCKET_EVENTS.VIDEO_ICE_CANDIDATE, (payload: unknown) => {
      if (!socketData.roomId || !socketData.participantId) return;
      if (!isVideoSignalingAllowed(socket.id)) {
        return;
      }

      const parsed = VideoIceCandidateSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }

      const { targetParticipantId, candidate } = parsed.data;
      if (targetParticipantId === socketData.participantId) return;

      const roomSockets = roomParticipantSockets.get(socketData.roomId);
      const roomVideos = roomVideoParticipants.get(socketData.roomId);
      const target = roomSockets?.get(targetParticipantId) || roomVideos?.get(targetParticipantId);
      if (!target) return;

      logger.info('ICE_CANDIDATE_FORWARDED', {
        senderParticipantId: socketData.participantId,
        targetParticipantId,
      });

      io.to(target.socketId).emit(SOCKET_EVENTS.VIDEO_ICE_CANDIDATE, {
        fromParticipantId: socketData.participantId,
        candidate,
      });
    });

    socket.on(SOCKET_EVENTS.VIDEO_STATE_UPDATE, (payload: unknown) => {
      if (!socketData.roomId || !socketData.participantId) return;
      const parsed = VideoStateUpdateSchema.safeParse(payload);
      if (!parsed.success) return;

      const roomVideos = roomVideoParticipants.get(socketData.roomId);
      const current = roomVideos?.get(socketData.participantId);
      if (current) {
        if (typeof parsed.data.isMuted === 'boolean') current.isMuted = parsed.data.isMuted;
        if (typeof parsed.data.isCameraOff === 'boolean') current.isCameraOff = parsed.data.isCameraOff;

        socket.to(socketData.roomId).emit(SOCKET_EVENTS.VIDEO_PEER_STATE, {
          participantId: socketData.participantId,
          isMuted: current.isMuted,
          isCameraOff: current.isCameraOff,
        });
      }
    });

    // 7. Disconnect Handling with Grace Period
    socket.on('disconnect', () => {
      if (!socketData.roomId || !socketData.sessionId) return;

      const roomId = socketData.roomId;
      const sessionId = socketData.sessionId;
      const displayName = socketData.displayName;
      const participantId = socketData.participantId;
      const isHostSocket = socketData.isHost === true;
      const timerKey = `${roomId}:${sessionId}`;

      // Remove socket from activeSessionSockets
      const sessionSocketsSet = activeSessionSockets.get(timerKey);
      if (sessionSocketsSet) {
        sessionSocketsSet.delete(socket.id);
        if (sessionSocketsSet.size === 0) {
          activeSessionSockets.delete(timerKey);
        }
      }

      // Clean up video call immediately upon socket disconnect (no need to wait grace period for WebRTC P2P)
      if (participantId) {
        cleanVideoParticipant(roomId, participantId);
        const roomSockets = roomParticipantSockets.get(roomId);
        if (roomSockets) {
          roomSockets.delete(participantId);
          if (roomSockets.size === 0) {
            roomParticipantSockets.delete(roomId);
          }
        }
      }
      videoSignalingRateLimit.delete(socket.id);

      // If this session still has another active socket connected (e.g. from page reload or multi-tab), do NOT start a disconnect timer!
      if (activeSessionSockets.has(timerKey)) {
        return;
      }

      // Set grace-period timer before marking offline (2s for guests so audience list updates promptly on tab close)
      const gracePeriod = isHostSocket ? CONFIG.ROOM_GRACE_PERIOD_MS : 2000;
      const timer = setTimeout(async () => {
        try {
          // If session reconnected while timer was waiting, skip disconnect handling
          if (activeSessionSockets.has(timerKey)) {
            disconnectTimers.delete(timerKey);
            return;
          }

          // Check if room is still active before attempting DB operations
          const isActive = await roomManager.isRoomActive(roomId).catch(() => false);
          if (!isActive) {
            disconnectTimers.delete(timerKey);
            return;
          }

          await roomManager.setParticipantOnline(roomId, sessionId, false).catch(() => {});
          const participants = await roomManager.getParticipants(roomId).catch(() => []);

          io.to(roomId).emit(SOCKET_EVENTS.PARTICIPANT_LEFT, {
            sessionId,
            participants,
          });

          if (displayName) {
            try {
              const sysMsg = await roomManager.saveChatMessage(
                roomId,
                'system',
                'System',
                `${displayName} left the room.`,
                true
              );
              io.to(roomId).emit(SOCKET_EVENTS.CHAT_MESSAGE, sysMsg);
            } catch {}
          }

          // If the disconnected participant was the host, cancel the room for all guests
          if (isHostSocket) {
            const isStillHost = await roomManager.isHost(roomId, sessionId).catch(() => false);
            if (isStillHost) {
              roomVideoParticipants.delete(roomId);
              await roomManager.endRoom(roomId).catch(() => {});
              io.to(roomId).emit(SOCKET_EVENTS.ROOM_CANCELLED, {
                message: 'The host has left the room. This screening has ended.',
              });
              logger.info('ROOM_CANCELLED_HOST_DISCONNECT', { roomId, displayName });
            }
          }

          logger.participantDisconnected(roomId, displayName);
        } catch (err) {
          logger.warn('Grace-period timer error handled safely', { roomId, error: err });
        } finally {
          disconnectTimers.delete(timerKey);
        }
      }, gracePeriod);

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
