import { prisma } from "../db.js";
import { Router, Request, Response } from 'express';
import { roomManager } from '../services/roomManager.js';
import { mediaStorage } from '../services/mediaStorage.js';
import { CreateRoomSchema, JoinRoomSchema } from '@cineva/shared';

const router = Router();

// POST /api/rooms - Create Room
router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = CreateRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const result = await roomManager.createRoom(parsed.data);
    res.status(201).json(result);
  } catch (err: any) {
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    res.status(status).json({ error: err.message || 'Failed to create room' });
  }
});

// POST /api/rooms/demo - Create Demo Room
router.post('/demo', async (req: Request, res: Response) => {
  try {
    const displayName = req.body?.displayName || 'Host';
    const result = await roomManager.createDemoRoom(displayName);
    res.status(201).json(result);
  } catch (err: any) {
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    res.status(status).json({ error: err.message || 'Failed to create demo room' });
  }
});

// POST /api/rooms/:roomCode/sample-media - Attach demo media to room
router.post('/:roomCode/sample-media', async (req: Request, res: Response) => {
  try {
    const rawCode = req.params.roomCode;
    const roomCode = Array.isArray(rawCode) ? rawCode[0] : rawCode;
    const room = await roomManager.getRoomByCode(roomCode);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    const demoMedia = mediaStorage.ensureDemoMedia();
    await roomManager.attachMedia(room.id, {
      title: 'Big Buck Bunny (Sample HD)',
      filename: demoMedia.filename,
      mimeType: demoMedia.mimeType,
      size: demoMedia.size,
      storageKey: demoMedia.storageKey,
      duration: 60,
    });
    const updated = await roomManager.getRoomInfo(room.id);
    res.json({ success: true, room: updated });
  } catch (err: any) {
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    res.status(status).json({ error: err.message || 'Failed to attach sample media' });
  }
});


// GET /api/rooms/:roomCode - Get Room Details or Privacy-Safe Check
router.get('/:roomCode', async (req: Request, res: Response) => {
  try {
    const rawCode = req.params.roomCode;
    const roomCode = Array.isArray(rawCode) ? rawCode[0] : rawCode;
    const room = await roomManager.getRoomByCode(roomCode);

    if (!room) {
      res.status(404).json({ error: 'Room not found', exists: false, joinable: false });
      return;
    }

    if (req.query.check === 'true') {
      const isEnded = room.status === 'ended' || room.status === 'expired';
      const participants = await prisma.participant.count({
        where: { roomId: room.id, isOnline: true },
      });
      const isFull = participants >= room.maxParticipants;
      const joinable = !isEnded && !isFull;

      res.json({
        exists: true,
        joinable,
        status: room.status,
        isFull,
      });
      return;
    }

    const roomInfo = await roomManager.getRoomInfo(room.id);
    res.json(roomInfo);
  } catch (err: any) {
    console.error('Error fetching room:', err);
    res.status(500).json({ error: 'Failed to fetch room details' });
  }
});

// POST /api/rooms/:roomCode/join - Join Room
router.post('/:roomCode/join', async (req: Request, res: Response) => {
  try {
    const parsed = JoinRoomSchema.safeParse({
      ...req.body,
      roomCode: req.params.roomCode,
    });

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const result = await roomManager.joinRoom(parsed.data);
    res.json(result);
  } catch (err: any) {
    console.error('Error joining room:', err);
    res.status(400).json({ error: err.message || 'Failed to join room' });
  }
});


// POST /api/rooms/:roomId/abort - Abort room creation and clean up any media / uploads
router.post("/:roomId/abort", async (req: Request, res: Response) => {
  try {
    const rawId = req.params.roomId;
    let roomId = Array.isArray(rawId) ? rawId[0] : rawId;
    let sessionId = (req.body?.sessionId as string) || (req.headers["x-session-id"] as string);

    const room = await prisma.room.findFirst({
      where: {
        OR: [{ id: roomId }, { roomCode: roomId }],
      },
    });

    if (!room) {
      // Room was already deleted or aborted (idempotent cleanup)
      await roomManager.cleanupRoomMedia(roomId);
      res.json({ success: true, message: "Room already cleaned up" });
      return;
    }

    // Allow cleanup if the body matches the room's ID or roomCode
    const bodyRoomMatches = !req.body?.roomId || req.body.roomId === room.id || req.body.roomId === room.roomCode;
    if (!bodyRoomMatches) {
      res.status(400).json({ error: "Room ID mismatch between URL and body" });
      return;
    }

    if (room.hostSessionId !== sessionId) {
      res.status(403).json({ error: "Only the room host can abort the room" });
      return;
    }

    // 1. End room state and clean up local media
    await roomManager.endRoom(room.id);

    // 2. End room state and delete from DB
    await prisma.room.delete({
      where: { id: room.id },
    }).catch(() => {});

    res.json({ success: true, message: "Room and uploads aborted successfully" });
  } catch (err: any) {
    console.error("Error aborting room:", err);
    res.status(500).json({ error: "Failed to abort room" });
  }
});

export default router;
