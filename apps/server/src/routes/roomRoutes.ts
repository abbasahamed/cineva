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

export default router;
