import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { app, server } from '../index.js';
import { prisma } from '../db.js';
import { evaluateMediaCompatibility } from '../services/media/mediaCompatibility.js';
import { mediaJobQueue } from '../services/media/mediaJobQueue.js';
import { MediaAnalysis } from '../services/media/mediaAnalyzer.js';

const execFileAsync = promisify(execFile);

describe('Universal Video Transcoding Layer Test Suite', () => {
  let serverUrl: string;
  let roomId: string;
  let roomCode: string;
  let hostSessionId: string;
  let didStartServer = false;
  const testFixturesDir = path.join(process.cwd(), 'scratch', 'test_fixtures');

  beforeAll(async () => {
    await prisma.$connect();

    if (!fs.existsSync(testFixturesDir)) {
      fs.mkdirSync(testFixturesDir, { recursive: true });
    }

    if (!server.listening) {
      await new Promise<void>((resolve) => {
        server.listen(4057, () => resolve());
      });
      didStartServer = true;
      serverUrl = 'http://localhost:4057';
    } else {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : 4000;
      serverUrl = `http://localhost:${port}`;
    }

    const res = await request(app)
      .post('/api/rooms')
      .send({ displayName: 'Transcode Host', roomName: 'Transcode Test Room' });

    expect(res.status).toBe(201);
    roomCode = res.body.room.roomCode;
    roomId = res.body.room.id;
    hostSessionId = res.body.hostSessionId;
  }, 15000);

  afterAll(async () => {
    if (didStartServer && server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Clean up scratch test fixtures
    if (fs.existsSync(testFixturesDir)) {
      fs.rmSync(testFixturesDir, { recursive: true, force: true });
    }
  });

  describe('1. Compatibility Decision Matrix Unit Tests', () => {
    it('1. Compatible MP4 (H.264/AAC) -> DIRECT_PLAY', () => {
      const analysis: MediaAnalysis = {
        formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
        container: 'mov,mp4,m4a,3gp,3g2,mj2',
        videoCodec: 'h264',
        audioCodec: 'aac',
        width: 1920,
        height: 1080,
        duration: 10,
        sizeBytes: 1048576,
        hasVideo: true,
        hasAudio: true,
        pixFmt: 'yuv420p',
        videoStreamsCount: 1,
        audioStreamsCount: 1,
        streams: [],
      };
      const decision = evaluateMediaCompatibility(analysis, 'movie.mp4');
      expect(decision.action).toBe('DIRECT_PLAY');
      expect(decision.targetMimeType).toBe('video/mp4');
    });

    it('2. Compatible WebM (VP8/Opus) -> DIRECT_PLAY', () => {
      const analysis: MediaAnalysis = {
        formatName: 'matroska,webm',
        container: 'matroska,webm',
        videoCodec: 'vp8',
        audioCodec: 'opus',
        width: 1280,
        height: 720,
        duration: 15,
        sizeBytes: 2097152,
        hasVideo: true,
        hasAudio: true,
        pixFmt: null,
        videoStreamsCount: 1,
        audioStreamsCount: 1,
        streams: [],
      };
      const decision = evaluateMediaCompatibility(analysis, 'clip.webm');
      expect(decision.action).toBe('DIRECT_PLAY');
      expect(decision.targetMimeType).toBe('video/webm');
    });

    it('3. MKV with H.264/AAC -> REMUX', () => {
      const analysis: MediaAnalysis = {
        formatName: 'matroska,webm',
        container: 'matroska,webm',
        videoCodec: 'h264',
        audioCodec: 'aac',
        width: 1920,
        height: 1080,
        duration: 20,
        sizeBytes: 5242880,
        hasVideo: true,
        hasAudio: true,
        pixFmt: null,
        videoStreamsCount: 1,
        audioStreamsCount: 1,
        streams: [],
      };
      const decision = evaluateMediaCompatibility(analysis, 'movie.mkv');
      expect(decision.action).toBe('REMUX');
      expect(decision.targetMimeType).toBe('video/mp4');
    });

    it('4. MKV with H.264 video + AC3 audio -> AUDIO_TRANSCODE_VIDEO_COPY (Stream Copy Video)', () => {
      const analysis: MediaAnalysis = {
        formatName: 'matroska,webm',
        container: 'matroska,webm',
        videoCodec: 'h264',
        audioCodec: 'ac3',
        width: 1920,
        height: 1080,
        duration: 60,
        sizeBytes: 52428800,
        hasVideo: true,
        hasAudio: true,
        pixFmt: 'yuv420p',
        videoStreamsCount: 1,
        audioStreamsCount: 1,
        streams: [{ index: 0, codecName: 'h264', codecType: 'video' }, { index: 1, codecName: 'ac3', codecType: 'audio' }],
      };
      const decision = evaluateMediaCompatibility(analysis, 'movie_ac3.mkv');
      expect(decision.action).toBe('AUDIO_TRANSCODE_VIDEO_COPY');
      expect(decision.targetMimeType).toBe('video/mp4');
      expect(decision.isAudioCompatible).toBe(false);
    });

    it('5. HEVC video + AAC audio -> TRANSCODE video with AUDIO COPY (isAudioCompatible: true)', () => {
      const analysis: MediaAnalysis = {
        formatName: 'matroska,webm',
        container: 'matroska,webm',
        videoCodec: 'hevc',
        audioCodec: 'aac',
        width: 3840,
        height: 2160,
        duration: 60,
        sizeBytes: 52428800,
        hasVideo: true,
        hasAudio: true,
        pixFmt: 'yuv420p',
        videoStreamsCount: 1,
        audioStreamsCount: 1,
        streams: [{ index: 0, codecName: 'hevc', codecType: 'video' }, { index: 1, codecName: 'aac', codecType: 'audio', profile: 'LC' }],
      };
      const decision = evaluateMediaCompatibility(analysis, 'movie_hevc_aac.mkv');
      expect(decision.action).toBe('TRANSCODE');
      expect(decision.targetMimeType).toBe('video/mp4');
      expect(decision.isAudioCompatible).toBe(true);
      expect(decision.selectedAudioStreamIndex).toBe(1);
    });

    it('6. HEVC video + E-AC3 audio -> FULL TRANSCODE (isAudioCompatible: false)', () => {
      const analysis: MediaAnalysis = {
        formatName: 'matroska,webm',
        container: 'matroska,webm',
        videoCodec: 'hevc',
        audioCodec: 'eac3',
        width: 3840,
        height: 2160,
        duration: 60,
        sizeBytes: 52428800,
        hasVideo: true,
        hasAudio: true,
        pixFmt: null,
        videoStreamsCount: 1,
        audioStreamsCount: 1,
        streams: [{ index: 0, codecName: 'hevc', codecType: 'video' }, { index: 1, codecName: 'eac3', codecType: 'audio' }],
      };
      const decision = evaluateMediaCompatibility(analysis, 'movie_hevc_eac3.mkv');
      expect(decision.action).toBe('TRANSCODE');
      expect(decision.targetMimeType).toBe('video/mp4');
      expect(decision.isAudioCompatible).toBe(false);
    });

    it('7. MKV container with H.264 does NOT force full video transcode (remux or audio-transcode video-copy)', () => {
      const analysis: MediaAnalysis = {
        formatName: 'matroska,webm',
        container: 'matroska,webm',
        videoCodec: 'h264',
        audioCodec: 'eac3',
        width: 1920,
        height: 1080,
        duration: 120,
        sizeBytes: 100000000,
        hasVideo: true,
        hasAudio: true,
        pixFmt: 'yuv420p',
        videoStreamsCount: 1,
        audioStreamsCount: 1,
        streams: [{ index: 0, codecName: 'h264', codecType: 'video' }, { index: 1, codecName: 'eac3', codecType: 'audio' }],
      };
      const decision = evaluateMediaCompatibility(analysis, 'large_movie.mkv');
      expect(decision.action).not.toBe('TRANSCODE');
      expect(decision.action).toBe('AUDIO_TRANSCODE_VIDEO_COPY');
    });

    it('8. Video without audio (Silent video) -> Handled cleanly', () => {
      const analysis: MediaAnalysis = {
        formatName: 'matroska,webm',
        container: 'matroska,webm',
        videoCodec: 'h264',
        audioCodec: null,
        width: 1280,
        height: 720,
        duration: 5,
        sizeBytes: 1048576,
        hasVideo: true,
        hasAudio: false,
        pixFmt: null,
        videoStreamsCount: 1,
        audioStreamsCount: 0,
        streams: [],
      };
      const decision = evaluateMediaCompatibility(analysis, 'silent.mkv');
      expect(decision.action).toBe('REMUX');
    });
  });

  describe('2. Real Local E2E Transcoding Integration Test', () => {
    it('Small MKV -> upload -> analyze -> transcode -> MP4 ready', async () => {
      const sampleMkvPath = path.join(testFixturesDir, 'sample_test.mkv');

      // Generate a tiny 1-second synthetic MKV file using ffmpeg
      try {
        await execFileAsync('ffmpeg', [
          '-y',
          '-f', 'lavfi',
          '-i', 'testsrc=duration=1:size=320x240:rate=10',
          '-f', 'lavfi',
          '-i', 'sine=frequency=440:duration=1',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          sampleMkvPath,
        ]);
      } catch (err) {
        console.warn('FFmpeg binary not available for synthetic file generation, skipping E2E render execution:', err);
        return;
      }

      expect(fs.existsSync(sampleMkvPath)).toBe(true);

      const freshRoomRes = await request(app)
        .post('/api/rooms')
        .send({ displayName: 'Transcode Host', roomName: 'Dedicated Transcode Room' });
      const testRoomId = freshRoomRes.body.room.id;
      const testHostSessionId = freshRoomRes.body.hostSessionId;

      // Upload MKV to watch room via POST /api/media/upload
      const uploadRes = await request(app)
        .post('/api/media/upload')
        .field('roomId', testRoomId)
        .field('sessionId', testHostSessionId)
        .attach('video', sampleMkvPath);

      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.status).toBe('processing');
      expect(uploadRes.body.filename).toBe('sample_test.mkv');

      // Poll database until media status transitions from 'processing' to 'ready'
      let mediaRecord = null;
      for (let attempt = 0; attempt < 80; attempt++) {
        await new Promise((r) => setTimeout(r, 400));
        mediaRecord = await prisma.media.findUnique({ where: { roomId: testRoomId } });
        if (mediaRecord && mediaRecord.status === 'ready') {
          break;
        }
      }

      expect(mediaRecord).not.toBeNull();
      expect(mediaRecord?.status).toBe('ready');
      expect(mediaRecord?.mimeType).toBe('video/mp4');
      expect(mediaRecord?.filename).toMatch(/\.mp4$/);
      expect(mediaRecord?.transcodeProgress).toBe(100);
      expect(mediaRecord?.playbackStorageKey).toBeTruthy();

      // Verify converted MP4 file can be streamed via HTTP 200/206
      const streamRes = await request(app)
        .get(`/media/${encodeURIComponent(mediaRecord!.playbackStorageKey!)}`)
        .set('Range', 'bytes=0-100');

      expect([200, 206]).toContain(streamRes.status);
      expect(streamRes.headers['content-type']).toBe('video/mp4');
    }, 45000);
  });
});
