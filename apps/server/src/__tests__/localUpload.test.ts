import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import path from "path";
import fs from "fs";
import { app, server } from "../index.js";
import { prisma } from "../db.js";
import { roomManager } from "../services/roomManager.js";
import { mediaStorage } from "../services/mediaStorage.js";
import { CONFIG } from "../config.js";

describe("Exclusive Local Storage & Direct Upload Test Suite", () => {
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
    const hostRes = await roomManager.createRoom({
      displayName: "Host User",
      roomName: "Local Upload Test Room",
      allowGuestControl: false,
    });

    roomId = hostRes.room.id;
    roomCode = hostRes.room.roomCode;
    hostSessionId = hostRes.hostSessionId;

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

  describe("1. Cloud Storage Removal Verification", () => {
    it("returns 404 for obsolete multipart upload routes", async () => {
      const res = await request(app)
        .post("/api/media/uploads/multipart/init")
        .send({ roomId, sessionId: hostSessionId, filename: "video.mp4" });
      expect(res.status).toBe(404);
    });

    it("returns 404 for obsolete request-upload-url route", async () => {
      const res = await request(app)
        .post("/api/media/request-upload-url")
        .send({ roomId, sessionId: hostSessionId, filename: "video.mp4" });
      expect(res.status).toBe(404);
    });

    it("returns 404 for obsolete record-direct-upload route", async () => {
      const res = await request(app)
        .post("/api/media/record-direct-upload")
        .send({ roomId, sessionId: hostSessionId, storageKey: "some/key", filename: "video.mp4" });
      expect(res.status).toBe(404);
    });

    it("returns 404 for obsolete presigned-get-url route", async () => {
      const res = await request(app)
        .post("/api/media/presigned-get-url")
        .send({ storageKey: "some/key" });
      expect(res.status).toBe(404);
    });

    it("confirms STORAGE_DRIVER is strictly local", () => {
      expect(CONFIG.STORAGE_DRIVER).toBe("local");
    });
  });

  describe("2. Local Media Upload Gate & Authorization", () => {
    it("rejects guest upload attempt with 403 Forbidden", async () => {
      const dummyBuffer = Buffer.from("fake video content for test");
      const res = await request(app)
        .post("/api/media/upload")
        .field("roomId", roomId)
        .field("sessionId", guestSessionId)
        .attach("video", dummyBuffer, "guest_movie.mp4");

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Only the host is authorized/i);
    });

    it("rejects upload with missing room or session credentials", async () => {
      const dummyBuffer = Buffer.from("fake video content");
      const res = await request(app)
        .post("/api/media/upload")
        .attach("video", dummyBuffer, "orphan.mp4");

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing roomId or sessionId/i);
    });

    it("rejects nested multipart field names", async () => {
      const res = await request(app)
        .post("/api/media/upload")
        .field("roomId", roomId)
        .field("sessionId", hostSessionId)
        .field("metadata[nested]", "value");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Field name nesting too deep");
    });

    it("rejects invalid non-video file formats", async () => {
      const dummyBuffer = Buffer.from("plain text not video");
      const res = await request(app)
        .post("/api/media/upload")
        .field("roomId", roomId)
        .field("sessionId", hostSessionId)
        .attach("video", dummyBuffer, "payload.exe");

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid video extension/i);
    });
  });

  describe("3. Local Storage Lifecycle & File Serving", () => {
    it("saves uploaded file locally and returns 201 processing status", async () => {
      const dummyHeader = Buffer.from(
        "AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQAAAAhmcmVlAAAGpm1kYXQAAAAAAA",
        "base64"
      );
      const testVideo = Buffer.concat([dummyHeader, Buffer.alloc(1024)]);

      const res = await request(app)
        .post("/api/media/upload")
        .field("roomId", roomId)
        .field("sessionId", hostSessionId)
        .field("title", "My Local Movie Night")
        .attach("video", testVideo, "sample_test_movie.mp4");

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("processing");
      expect(res.body.roomId).toBe(roomId);
      expect(res.body.filename).toBe("sample_test_movie.mp4");
    });

    it("saves and streams local media with HTTP 206 byte-range support", async () => {
      const testBuffer = Buffer.from("0123456789abcdefghijklmnopqrstuvwxyz");
      const saved = await mediaStorage.saveFile(roomId, "stream_test.mp4", testBuffer, "video/mp4");

      expect(saved.storageKey).toBeDefined();
      expect(saved.size).toBe(testBuffer.length);

      const localPath = mediaStorage.getLocalPath(saved.storageKey);
      expect(localPath).toBeTruthy();
      expect(fs.existsSync(localPath!)).toBe(true);

      // Verify full stream
      const getRes = await request(app).get(saved.url);
      expect(getRes.status).toBe(200);
      expect(getRes.headers["accept-ranges"]).toBe("bytes");
      expect(getRes.headers["content-type"]).toBe("video/mp4");
      expect(getRes.body.length).toBe(testBuffer.length);

      // Verify partial content byte range request
      const rangeRes = await request(app)
        .get(saved.url)
        .set("Range", "bytes=0-9");

      expect(rangeRes.status).toBe(206);
      expect(rangeRes.headers["content-range"]).toBe(`bytes 0-9/${testBuffer.length}`);
      expect((rangeRes.text || rangeRes.body).toString()).toBe("0123456789");

      // Verify cleanup
      await mediaStorage.deleteFile(saved.storageKey);
      expect(fs.existsSync(localPath!)).toBe(false);
    });

    it("prevents directory traversal attacks via storage keys", () => {
      expect(() => {
        (mediaStorage as any).getSafeFilePath("/etc/passwd");
      }).toThrow(/Access denied: Path traversal attempt detected/i);
    });
  });
});
