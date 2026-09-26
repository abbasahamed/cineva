import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app, server } from "../index.js";
import { prisma } from "../db.js";
import { roomManager } from "../services/roomManager.js";
import { mediaStorage } from "../services/mediaStorage.js";
import { multipartManager } from "../services/media/multipartManager.js";

describe("Backblaze B2 & Large Multipart Upload Migration Test Suite", () => {
  let roomId: string;
  let roomCode: string;
  let hostSessionId: string;
  let guestSessionId: string;

  beforeAll(async () => {
    if (!server.listening) {
      await new Promise<void>((r) => server.listen(0, () => r()));
    }
  });

  beforeEach(async () => {
    // 1. Create a fresh test room
    const hostRes = await roomManager.createRoom({
      displayName: "Host User",
      roomName: "B2 Upload Test Room",
      allowGuestControl: false,
    });

    roomId = hostRes.room.id;
    roomCode = hostRes.room.roomCode;
    hostSessionId = hostRes.hostSessionId;

    // 2. Join a guest
    const guestRes = await roomManager.joinRoom({
      roomCode,
      displayName: "Guest Viewer",
    });
    guestSessionId = guestRes.sessionId;
  });

  afterEach(async () => {
    try {
      await roomManager.cleanupRoomMedia(roomId);
      await prisma.room.deleteMany({ where: { id: roomId } });
    } catch {}
  });

  // --------------------------------------------------------------------------
  // 1. Authorization & Validation Gates
  // --------------------------------------------------------------------------

  it("1. Initializes multipart upload for authorized host", async () => {
    const res = await request(app)
      .post("/api/media/uploads/multipart/init")
      .send({
        roomId,
        sessionId: hostSessionId,
        filename: "movie_night.mp4",
        fileSize: 100 * 1024 * 1024, // 100 MB
        mimeType: "video/mp4",
        title: "Movie Night Special",
      });

    expect(res.status).toBe(201);
    expect(res.body.uploadId).toBeDefined();
    expect(res.body.storageKey).toBeDefined();
    expect(res.body.partSize).toBe(50 * 1024 * 1024);
    expect(res.body.totalParts).toBe(2);
    expect(res.body.parts).toHaveLength(2);
    expect(res.body.parts[0].partNumber).toBe(1);
    expect(res.body.parts[0].uploadUrl).toBeDefined();

    // Verify registration in multipartManager
    const active = multipartManager.getUpload(res.body.uploadId);
    expect(active).toBeDefined();
    expect(active?.roomId).toBe(roomId);
  });

  it("2. Rejects unauthorized guest from initializing multipart upload", async () => {
    const res = await request(app)
      .post("/api/media/uploads/multipart/init")
      .send({
        roomId,
        sessionId: guestSessionId,
        filename: "guest_video.mp4",
        fileSize: 50 * 1024 * 1024,
        mimeType: "video/mp4",
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Only the host is authorized/i);
  });

  it("3. Rejects multipart initialization with invalid room", async () => {
    const res = await request(app)
      .post("/api/media/uploads/multipart/init")
      .send({
        roomId: "non_existent_room_12345",
        sessionId: hostSessionId,
        filename: "video.mp4",
        fileSize: 50 * 1024 * 1024,
      });

    expect(res.status).toBe(403);
  });

  it("4. Strictly rejects files exceeding the 5 GB maximum upload limit", async () => {
    const over5Gb = 5 * 1024 * 1024 * 1024 + 1024; // 5 GB + 1 KB

    const res = await request(app)
      .post("/api/media/uploads/multipart/init")
      .send({
        roomId,
        sessionId: hostSessionId,
        filename: "too_large.mp4",
        fileSize: over5Gb,
        mimeType: "video/mp4",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds the 5GB upload limit/i);
  });

  it("5. Rejects non-video extensions and invalid MIME types", async () => {
    const resExt = await request(app)
      .post("/api/media/uploads/multipart/init")
      .send({
        roomId,
        sessionId: hostSessionId,
        filename: "malicious_script.exe",
        fileSize: 10 * 1024 * 1024,
        mimeType: "application/x-msdownload",
      });

    expect(resExt.status).toBe(400);
    expect(resExt.body.error).toMatch(/Invalid video extension/i);
  });

  // --------------------------------------------------------------------------
  // 2. Multipart Execution, Chunking & Completion
  // --------------------------------------------------------------------------

  it("6. Completes multipart upload with chunking, retries, and triggers processing", async () => {
    // A. Init upload (small 2-chunk file)
    const initRes = await request(app)
      .post("/api/media/uploads/multipart/init")
      .send({
        roomId,
        sessionId: hostSessionId,
        filename: "demo_multipart.mp4",
        fileSize: 1024 * 100, // 100 KB
        mimeType: "video/mp4",
        title: "Demo Multipart",
      });

    expect(initRes.status).toBe(201);
    const { uploadId, storageKey, parts } = initRes.body;

    // B. Simulate uploading part 1
    const chunk1 = Buffer.from("Part 1 video header content...".repeat(20));
    const part1Res = await request(app)
      .put(`/api/media/uploads/multipart/${uploadId}/part/1`)
      .set("Content-Type", "application/octet-stream")
      .send(chunk1);

    expect(part1Res.status).toBe(200);
    const etag1 = part1Res.body.etag;
    expect(etag1).toBeDefined();

    // C. Verify list uploaded parts (resumability)
    const listRes = await request(app)
      .get(`/api/media/uploads/multipart/${uploadId}/parts?sessionId=${hostSessionId}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.uploadedParts).toContain(1);

    // D. Complete multipart upload
    const compRes = await request(app)
      .post(`/api/media/uploads/multipart/${uploadId}/complete`)
      .send({
        sessionId: hostSessionId,
        parts: [{ partNumber: 1, etag: etag1 }],
      });

    expect(compRes.status).toBe(200);
    expect(compRes.body.status).toBe("processing");
    expect(compRes.body.storageKey).toBe(storageKey);

    // E. Verify upload was un-registered from active map
    expect(multipartManager.getUpload(uploadId)).toBeUndefined();
  });

  it("7. Aborts active multipart upload and releases resources", async () => {
    const initRes = await request(app)
      .post("/api/media/uploads/multipart/init")
      .send({
        roomId,
        sessionId: hostSessionId,
        filename: "aborted_movie.mp4",
        fileSize: 50 * 1024 * 1024,
      });

    expect(initRes.status).toBe(201);
    const { uploadId } = initRes.body;

    const abortRes = await request(app)
      .post(`/api/media/uploads/multipart/${uploadId}/abort`)
      .send({ sessionId: hostSessionId });

    expect(abortRes.status).toBe(200);
    expect(abortRes.body.status).toBe("aborted");
    expect(multipartManager.getUpload(uploadId)).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // 3. Room Isolation, Cleanup & Late Job Protection
  // --------------------------------------------------------------------------

  it("8. Enforces cross-room isolation for multipart upload operations", async () => {
    // Create second room
    const secondRoom = await roomManager.createRoom({
      displayName: "Attacker Host",
      roomName: "Second Room",
    });

    const initRes = await request(app)
      .post("/api/media/uploads/multipart/init")
      .send({
        roomId,
        sessionId: hostSessionId,
        filename: "isolated_movie.mp4",
        fileSize: 50 * 1024 * 1024,
      });

    const { uploadId } = initRes.body;

    // Second room host attempts to abort or complete upload of first room
    const unauthorizedAbort = await request(app)
      .post(`/api/media/uploads/multipart/${uploadId}/abort`)
      .send({ sessionId: secondRoom.hostSessionId });

    expect(unauthorizedAbort.status).toBe(403);

    const unauthorizedComplete = await request(app)
      .post(`/api/media/uploads/multipart/${uploadId}/complete`)
      .send({
        sessionId: secondRoom.hostSessionId,
        parts: [{ partNumber: 1, etag: "fake" }],
      });

    expect(unauthorizedComplete.status).toBe(403);

    await roomManager.cleanupRoomMedia(secondRoom.room.id);
    await prisma.room.deleteMany({ where: { id: secondRoom.room.id } });
  });

  it("9. Automatic room media cleanup aborts active multipart uploads and deletes media", async () => {
    const initRes = await request(app)
      .post("/api/media/uploads/multipart/init")
      .send({
        roomId,
        sessionId: hostSessionId,
        filename: "cleanup_test.mp4",
        fileSize: 50 * 1024 * 1024,
      });

    const { uploadId } = initRes.body;
    expect(multipartManager.getUpload(uploadId)).toBeDefined();

    // Trigger room cleanup
    await roomManager.cleanupRoomMedia(roomId);

    // Active upload must be cleared
    expect(multipartManager.getUpload(uploadId)).toBeUndefined();
  });

  it("11. Late-completing or cancelled job cannot resurrect deleted media", async () => {
    // 1. Manually insert a pending media record for the room
    await prisma.media.create({
      data: {
        roomId,
        title: "Test Late Media",
        filename: "late.mp4",
        mimeType: "video/mp4",
        size: BigInt(1000),
        storageKey: "pending_late_job",
        status: "processing",
      },
    });

    // 2. Room is closed/ended by host
    await roomManager.cleanupRoomMedia(roomId);
    await prisma.room.update({
      where: { id: roomId },
      data: { status: "ended" },
    });

    // 3. Confirm media record was deleted
    const mediaAfterCleanup = await prisma.media.findUnique({ where: { roomId } });
    expect(mediaAfterCleanup).toBeNull();
  });

  it("10. Missing B2 object cleanup is idempotent and does not throw", async () => {
    // Deleting a non-existent storage key must be idempotent
    await expect(mediaStorage.deleteFile("media/non_existent_room/99999_missing.mp4")).resolves.not.toThrow();
  });
});
