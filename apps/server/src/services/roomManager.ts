import fs from 'fs';
import path from 'path';
import { prisma } from '../db.js';
import { generateRoomCode, generateSessionId } from '../utils/idGenerator.js';
import { syncEngine } from './syncEngine.js';
import { mediaStorage } from './mediaStorage.js';
import { mediaJobQueue } from './media/mediaJobQueue.js';
import { multipartManager } from './media/multipartManager.js';
import {
  CreateRoomInput,
  JoinRoomInput,
  RoomInfo,
  ParticipantInfo,
  RoomStateSnapshot,
  ChatMessage,
} from '@cineva/shared';
import { CONFIG } from '../config.js';
import { logger } from '../utils/logger.js';

export class RoomManager {
  /**
   * Creates a new watch room.
   */
  async createRoom(input: CreateRoomInput, hostSessionId?: string): Promise<{ room: RoomInfo; hostSessionId: string; hostParticipantId: string }> {
    const roomCode = generateRoomCode();
    const sessionId = hostSessionId || generateSessionId();

    const room = await prisma.room.create({
      data: {
        roomCode,
        name: input.roomName,
        hostParticipantId: '', // updated right after participant creation
        hostSessionId: sessionId,
        allowGuestControl: input.allowGuestControl || false,
        expiresAt: new Date(Date.now() + CONFIG.ROOM_EXPIRATION_HOURS * 3600 * 1000),
      },
    });

    const hostParticipant = await prisma.participant.create({
      data: {
        roomId: room.id,
        displayName: input.displayName,
        sessionId,
        isHost: true,
        isOnline: true,
      },
    });

    await prisma.room.update({
      where: { id: room.id },
      data: { hostParticipantId: hostParticipant.id },
    });

    // Initialize sync state
    syncEngine.getOrCreateState(room.id);

    const roomInfo = await this.getRoomInfo(room.id);
    if (!roomInfo) throw new Error('Failed to retrieve created room');

    logger.info('ROOM CREATED', {
      roomId: room.id,
      roomCode: room.roomCode,
      hostId: hostParticipant.id,
      hostSessionId: sessionId,
      participantId: hostParticipant.id,
      userId: sessionId,
    });

    return {
      room: roomInfo,
      hostSessionId: sessionId,
      hostParticipantId: hostParticipant.id,
    };
  }

  /**
   * Creates an instant Demo Room with pre-populated sample video for testing.
   */
  async createDemoRoom(displayName: string = 'Host'): Promise<{ room: RoomInfo; hostSessionId: string; hostParticipantId: string }> {
    const result = await this.createRoom({
      displayName,
      roomName: '🎬 Demo Watch Room',
      allowGuestControl: false,
    });

    // Create or attach demo media
    const demoMedia = mediaStorage.ensureDemoMedia();
    await this.attachMedia(result.room.id, {
      title: 'Big Buck Bunny (Sample HD)',
      filename: demoMedia.filename,
      mimeType: demoMedia.mimeType,
      size: demoMedia.size,
      storageKey: demoMedia.storageKey,
      duration: 60,
    });

    const updatedRoom = await this.getRoomInfo(result.room.id);
    return {
      room: updatedRoom!,
      hostSessionId: result.hostSessionId,
      hostParticipantId: result.hostParticipantId,
    };
  }

  /**
   * Attaches or updates media for a room.
   */
  async attachMedia(roomId: string, mediaData: {
    title: string;
    filename: string;
    mimeType: string;
    size: number | bigint | string;
    storageKey: string;
    duration?: number;
  }) {
    // Clean old storage files for existing media record if any
    const existingMedia = await prisma.media.findMany({ where: { roomId } });
    for (const m of existingMedia) {
      if (m.storageKey && !m.storageKey.startsWith('pending_') && m.storageKey !== mediaData.storageKey) {
        await mediaStorage.deleteFile(m.storageKey).catch(() => {});
      }
      if (m.originalStorageKey && m.originalStorageKey !== mediaData.storageKey) {
        await mediaStorage.deleteFile(m.originalStorageKey).catch(() => {});
      }
      if (m.playbackStorageKey && m.playbackStorageKey !== mediaData.storageKey) {
        await mediaStorage.deleteFile(m.playbackStorageKey).catch(() => {});
      }
    }
    await prisma.media.deleteMany({ where: { roomId } });

    const bigSize = typeof mediaData.size === 'bigint'
      ? mediaData.size
      : BigInt(mediaData.size);

    return await prisma.media.create({
      data: {
        roomId,
        title: mediaData.title,
        filename: mediaData.filename,
        mimeType: mediaData.mimeType,
        size: bigSize,
        duration: mediaData.duration,
        storageKey: mediaData.storageKey,
      },
    });
  }

  /**
   * Updates media display title.
   */
  async updateMediaTitle(roomId: string, title: string) {
    const media = await prisma.media.findUnique({ where: { roomId } });
    if (media) {
      await prisma.media.update({
        where: { roomId },
        data: { title },
      });
    }
  }

  /**
   * Updates room settings.
   */
  async updateRoomSettings(roomId: string, settings: { allowGuestControl?: boolean }) {
    return await prisma.room.update({
      where: { id: roomId },
      data: {
        ...(settings.allowGuestControl !== undefined ? { allowGuestControl: settings.allowGuestControl } : {}),
      },
    });
  }

  /**
   * Finds room by ID or Room Code.
   */
  async getRoomByCode(roomCode: string) {
    return await prisma.room.findUnique({
      where: { roomCode: roomCode.trim().toUpperCase() },
      include: {
        media: true,
        participants: true,
      },
    });
  }

  async getRoomById(roomId: string) {
    return await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        media: true,
        participants: true,
      },
    });
  }

  /**
   * Formats room record to RoomInfo.
   */
  async getRoomInfo(roomId: string): Promise<RoomInfo | null> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { media: true },
    });

    if (!room) return null;

    return {
      id: room.id,
      roomCode: room.roomCode,
      name: room.name,
      hostParticipantId: room.hostParticipantId,
      hostSessionId: room.hostSessionId,
      settings: {
        allowGuestControl: room.allowGuestControl,
        maxParticipants: room.maxParticipants,
      },
      status: room.status as 'active' | 'ended' | 'expired',
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
      expiresAt: room.expiresAt?.toISOString(),
      media: room.media
        ? {
            id: room.media.id,
            roomId: room.media.roomId,
            title: room.media.title,
            filename: room.media.filename,
            mimeType: room.media.mimeType,
            size: room.media.size.toString(),
            duration: room.media.duration || undefined,
            url: (room.media.status === 'ready' || room.media.playbackStorageKey)
              ? mediaStorage.getUrl(room.media.playbackStorageKey || room.media.storageKey)
              : '',
            status: (room.media.status as any) || 'ready',
            transcodeProgress: room.media.transcodeProgress,
            transcodeError: room.media.transcodeError || undefined,
            videoCodec: room.media.videoCodec || undefined,
            audioCodec: room.media.audioCodec || undefined,
            width: room.media.width || undefined,
            height: room.media.height || undefined,
            createdAt: room.media.createdAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * Handles user join or rejoin (reconnect).
   */
  async joinRoom(input: JoinRoomInput): Promise<{
    room: RoomInfo;
    participant: ParticipantInfo;
    sessionId: string;
    isNew: boolean;
  }> {
    const room = await this.getRoomByCode(input.roomCode);

    if (!room) {
      throw new Error('Room not found. Please verify the room code.');
    }
    if (room.status === 'ended') {
      throw new Error('This watch room has ended.');
    }
    if (room.status === 'expired' || (room.expiresAt && room.expiresAt < new Date())) {
      throw new Error('This watch room has expired.');
    }

    const sessionId = input.sessionId || generateSessionId();

    // Check if participant already exists with this sessionId in this room
    let participant = await prisma.participant.findUnique({
      where: {
        roomId_sessionId: {
          roomId: room.id,
          sessionId,
        },
      },
    });

    let isNew = false;

    if (participant) {
      // Re-connecting existing participant
      const isHost = room.hostSessionId === sessionId || participant.isHost;
      participant = await prisma.participant.update({
        where: { id: participant.id },
        data: {
          isOnline: true,
          isHost,
          lastSeenAt: new Date(),
          displayName: input.displayName || participant.displayName,
        },
      });
    } else {
      isNew = true;
      // Check capacity
      const activeCount = await prisma.participant.count({
        where: { roomId: room.id, isOnline: true },
      });
      if (activeCount >= room.maxParticipants) {
        throw new Error('Room is currently full.');
      }

      const isHost = room.hostSessionId === sessionId;

      participant = await prisma.participant.create({
        data: {
          roomId: room.id,
          displayName: input.displayName,
          sessionId,
          isHost,
          isOnline: true,
        },
      });
    }

    const roomInfo = await this.getRoomInfo(room.id);

    return {
      room: roomInfo!,
      participant: {
        id: participant.id,
        sessionId: participant.sessionId,
        displayName: participant.displayName,
        isHost: participant.isHost,
        joinedAt: participant.joinedAt.toISOString(),
        lastSeenAt: participant.lastSeenAt.toISOString(),
        isOnline: participant.isOnline,
      },
      sessionId,
      isNew,
    };
  }

  /**
   * Retrieves active participants list for a room.
   */
  async getParticipants(roomId: string): Promise<ParticipantInfo[]> {
    const participants = await prisma.participant.findMany({
      where: { roomId },
      orderBy: [{ isHost: 'desc' }, { joinedAt: 'asc' }],
    });

    return participants.map((p) => ({
      id: p.id,
      sessionId: p.sessionId,
      displayName: p.displayName,
      isHost: p.isHost,
      joinedAt: p.joinedAt.toISOString(),
      lastSeenAt: p.lastSeenAt.toISOString(),
      isOnline: p.isOnline,
    }));
  }

  /**
   * Marks a participant as offline.
   */
  async setParticipantOnline(roomId: string, sessionId: string, isOnline: boolean) {
    try {
      await prisma.participant.updateMany({
        where: { roomId, sessionId },
        data: {
          isOnline,
          lastSeenAt: new Date(),
        },
      });
    } catch (err) {
      console.error('Error updating participant online status:', err);
    }
  }

  /**
   * Removes/kicks a participant from the room.
   */
  async kickParticipant(roomId: string, participantId: string) {
    await prisma.participant.deleteMany({
      where: { roomId, id: participantId, isHost: false },
    });
  }

  /**
   * Checks if a session has playback control permissions.
   */
  async canControlPlayback(roomId: string, sessionId: string): Promise<boolean> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });
    if (!room) return false;
    if (room.hostSessionId === sessionId) return true;
    return room.allowGuestControl;
  }

  /**
   * Checks if session belongs to the host.
   */
  async isHost(roomId: string, sessionId: string): Promise<boolean> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });
    return !!room && room.hostSessionId === sessionId;
  }

  /**
   * Automatically cleans up all media files and database records associated with a room.
   * Strictly scoped to the specified roomId. Idempotent and safe against missing files.
   */
  async cleanupRoomMedia(roomId: string): Promise<void> {
    logger.info(`[MediaCleanup] Starting cleanup for room ${roomId}`);

    try {
      // 1. Cancel any active or queued media jobs for this room
      await mediaJobQueue.cancelJobsForRoom(roomId);
      await multipartManager.abortUploadsForRoom(roomId);

      // 2. Fetch all media records associated ONLY with this room
      const mediaList = await prisma.media.findMany({
        where: { roomId },
      });

      // 3. Collect and deduplicate all storage keys for this room's media
      const storageKeys = new Set<string>();
      for (const media of mediaList) {
        if (media.storageKey && !media.storageKey.startsWith('pending_')) {
          storageKeys.add(media.storageKey);
        }
        if (media.originalStorageKey && !media.originalStorageKey.startsWith('pending_')) {
          storageKeys.add(media.originalStorageKey);
        }
        if (media.playbackStorageKey && !media.playbackStorageKey.startsWith('pending_')) {
          storageKeys.add(media.playbackStorageKey);
        }
      }

      // 4. Delete physical/object storage files using storage abstraction
      for (const key of storageKeys) {
        try {
          await mediaStorage.deleteFile(key);
          logger.info(`[MediaCleanup] Deleted storage key ${key}`);
        } catch (err: any) {
          logger.error(`[MediaCleanup] Error deleting storage key ${key}: ${err.message}`);
        }
      }

      // 5. If local storage, safely remove the room's dedicated upload directory if empty or containing leftover files
      const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const roomDirPath = mediaStorage.getLocalPath(safeRoomId);
      if (roomDirPath && fs.existsSync(roomDirPath)) {
        try {
          const files = await fs.promises.readdir(roomDirPath);
          for (const file of files) {
            const filePath = path.join(roomDirPath, file);
            await fs.promises.unlink(filePath).catch(() => {});
          }
          await fs.promises.rmdir(roomDirPath).catch(() => {});
          logger.info(`[MediaCleanup] Cleaned room directory ${safeRoomId}`);
        } catch (err: any) {
          logger.error(`[MediaCleanup] Error removing room directory ${safeRoomId}: ${err.message}`);
        }
      }

      // 6. Delete Media records from Database
      if (mediaList.length > 0) {
        await prisma.media.deleteMany({
          where: { roomId },
        });
        logger.info(`[MediaCleanup] Deleted ${mediaList.length} media DB records for room ${roomId}`);
      }

      logger.info(`[MediaCleanup] Cleanup completed for room ${roomId}`);
    } catch (err: any) {
      logger.error(`[MediaCleanup] Failed to clean up media for room ${roomId}: ${err.message}`);
    }
  }

  /**
   * Ends a room and automatically cleans up all associated media files and jobs.
   */
  async endRoom(roomId: string) {
    await prisma.room.update({
      where: { id: roomId },
      data: { status: 'ended' },
    });
    syncEngine.removeRoom(roomId);
    await this.cleanupRoomMedia(roomId);
  }

  async isRoomActive(roomId: string): Promise<boolean> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { status: true },
    });
    return !!room && room.status !== 'ended';
  }

  /**
   * Saves and retrieves chat messages.
   */
  async saveChatMessage(roomId: string, participantId: string, displayName: string, message: string, isSystem: boolean = false): Promise<ChatMessage> {
    const chat = await prisma.chatMessage.create({
      data: {
        roomId,
        participantId,
        displayName,
        message,
        isSystem,
      },
    });

    return {
      id: chat.id,
      roomId: chat.roomId,
      participantId: chat.participantId,
      displayName: chat.displayName,
      message: chat.message,
      createdAt: chat.createdAt.toISOString(),
      isSystem: chat.isSystem,
    };
  }

  async getRecentChat(roomId: string, limit: number = 50): Promise<ChatMessage[]> {
    const messages = await prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return messages.map((m) => ({
      id: m.id,
      roomId: m.roomId,
      participantId: m.participantId,
      displayName: m.displayName,
      message: m.message,
      createdAt: m.createdAt.toISOString(),
      isSystem: m.isSystem,
    }));
  }

  /**
   * Generates full room state snapshot for clients.
   */
  async getRoomSnapshot(roomId: string, sessionId: string): Promise<RoomStateSnapshot | null> {
    const room = await this.getRoomInfo(roomId);
    if (!room) return null;

    const participants = await this.getParticipants(roomId);
    const me = participants.find((p) => p.sessionId === sessionId);
    const now = Date.now();
    const { playback } = syncEngine.getSnapshot(roomId, now);

    return {
      room,
      participants,
      playback,
      serverTimestamp: now,
      myParticipantId: me?.id || '',
      isHost: room.hostSessionId === sessionId,
    };
  }
}

export const roomManager = new RoomManager();
