import { prisma } from "../db.js";
import { Router, Request, Response } from 'express';
import { roomManager } from '../services/roomManager.js';
import { CreateRoomSchema, JoinRoomSchema } from '@syncwatch/shared';

const router = Router();

// POST /api/rooms - Create Room
router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = CreateRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const result = await roomManager.createRoom(parsed.data);
    res.status(201).json(result);
  } catch (err: any) {
    console.error('Error creating room:', err);
    res.status(500).json({ error: err.message || 'Failed to create room' });
  }
});

// POST /api/rooms/demo - Create Demo Room
router.post('/demo', async (req: Request, res: Response) => {
  try {
    const displayName = req.body?.displayName || 'Host';
    const result = await roomManager.createDemoRoom(displayName);
    res.status(201).json(result);
  } catch (err: any) {
    console.error('Error creating demo room:', err);
    res.status(500).json({ error: err.message || 'Failed to create demo room' });
  }
});

// GET /api/rooms/:roomCode - Get Room Details
router.get('/:roomCode', async (req: Request, res: Response) => {
  try {
    const rawCode = req.params.roomCode;
    const roomCode = Array.isArray(rawCode) ? rawCode[0] : rawCode;
    const room = await roomManager.getRoomByCode(roomCode);

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
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
      res.status(400).json({ error: parsed.error.errors[0].message });
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

    // If body was parsed as urlencoded / json object
    if (req.body && typeof req.body === "object") {
      const bodyRoomId = req.body.roomId;
      if (bodyRoomId && typeof bodyRoomId === "string") {
        if (roomId && bodyRoomId !== roomId) {
          res.status(400).json({ error: "Room ID mismatch between URL and body" });
          return;
        }
        if (!roomId) roomId = bodyRoomId;
      }
    }

    // Fallback if body is a raw string
    if (!sessionId && typeof req.body === "string") {
      try {
        const parsed = new URLSearchParams(req.body);
        sessionId = parsed.get("sessionId") || "";
        const bodyRoomId = parsed.get("roomId");
        if (bodyRoomId && roomId && bodyRoomId !== roomId) {
          res.status(400).json({ error: "Room ID mismatch between URL and body" });
          return;
        }
        if (!roomId && bodyRoomId) roomId = bodyRoomId;
      } catch {}
    }

    if (!roomId || !sessionId) {
      res.status(400).json({ error: "Missing roomId or sessionId" });
      return;
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      // Room was already deleted or aborted (idempotent cleanup)
      await roomManager.cleanupRoomMedia(roomId);
      res.json({ success: true, message: "Room already cleaned up" });
      return;
    }

    if (room.hostSessionId !== sessionId) {
      res.status(403).json({ error: "Only the room host can abort the room" });
      return;
    }

    // 1. Clean up media and abort any active B2 multipart uploads
    await roomManager.cleanupRoomMedia(roomId);

    // 2. End room state and delete from DB
    await prisma.room.delete({
      where: { id: roomId },
    }).catch(() => {});

    res.json({ success: true, message: "Room and uploads aborted successfully" });
  } catch (err: any) {
    console.error("Error aborting room:", err);
    res.status(500).json({ error: "Failed to abort room" });
  }
});

export default router;
