import path from "path";
import fs from "fs";
import { prisma } from "../../db.js";
import { mediaStorage } from "../mediaStorage.js";
import { roomManager } from "../roomManager.js";
import { syncEngine } from "../syncEngine.js";
import { analyzeMediaFile } from "./mediaAnalyzer.js";
import { evaluateMediaCompatibility, validatePlaybackFile } from "./mediaCompatibility.js";
import { transcodingService } from "./transcodingService.js";
import { hlsPackager } from "./hlsPackager.js";
import { buildTrackManifest } from "./trackManifest.js";
import { SOCKET_EVENTS } from "@cineva/shared";
import { logger } from "../../utils/logger.js";
import { CONFIG } from "../../config.js";
import { tempFileLifecycle } from "./tempFileLifecycle.js";

let ioInstance: any = null;

export function setMediaSocketIO(io: any) {
  ioInstance = io;
}

function broadcastToRoom(roomId: string, event: string, payload: any) {
  if (ioInstance) {
    ioInstance.to(roomId).emit(event, payload);
  }
}

export interface MediaJob {
  id: string;
  roomId: string;
  localSourcePath?: string;
  sourceStorageKey?: string;
  sourceSize?: number;
  filename: string;
  title?: string;
  createdAt: number;
}

export class MediaJobQueue {
  private queue: MediaJob[] = [];
  private activeJobsCount = 0;
  private maxConcurrentTranscodes = 1;
  private activeJobMap = new Map<string, MediaJob>();
  private cancelledRoomIds = new Set<string>();

  constructor(maxConcurrent = 1) {
    this.maxConcurrentTranscodes = maxConcurrent;
  }

  /**
   * Cancels all queued and active media processing jobs for a specific room.
   * Ensures late-completing jobs cannot publish MEDIA_READY or register media.
   */
  async cancelJobsForRoom(roomId: string): Promise<void> {
    this.cancelledRoomIds.add(roomId);

    // 1. Remove and cleanup all queued jobs for this room
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].roomId === roomId) {
        const [cancelledJob] = this.queue.splice(i, 1);
        if (cancelledJob) {
          if (cancelledJob.localSourcePath) {
            tempFileLifecycle.unregisterActiveFile(cancelledJob.localSourcePath);
            tempFileLifecycle.safeDeleteFile(cancelledJob.localSourcePath, true);
            tempFileLifecycle.safeDeleteFile(`${cancelledJob.localSourcePath}_storage.tmp`, true);
          }
          logger.info("[MediaJobQueue] Cancelled queued job for room", { jobId: cancelledJob.id, roomId });
        }
      }
    }

    // 2. Kill FFmpeg if currently processing for this room
    const activeJob = this.activeJobMap.get(roomId);
    if (activeJob) {
      transcodingService.cancelJob(activeJob.id);
      hlsPackager.cancelJob(activeJob.id);
      logger.info("[MediaJobQueue] Cancelled active transcoding/HLS job for room", { jobId: activeJob.id, roomId });
    }
  }

  /**
   * Enqueues an uploaded file or stored object for analysis, compatibility evaluation, and background transcoding.
   */
  async enqueueMediaProcessing(
    roomId: string,
    source: string | { storageKey: string; filename?: string; size?: number },
    filename: string,
    title?: string
  ): Promise<void> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const isStorageKey = typeof source === "object";
    const job: MediaJob = {
      id: jobId,
      roomId,
      localSourcePath: isStorageKey ? undefined : source,
      sourceStorageKey: isStorageKey ? source.storageKey : undefined,
      sourceSize: isStorageKey ? source.size : undefined,
      filename,
      title,
      createdAt: Date.now(),
    };

    const safeTitle = title || filename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
    const initialStorageKey = isStorageKey ? source.storageKey : `pending_${jobId}`;

    // 1. Immediately create/update media record in DB with status "processing"
    const mediaRecord = await prisma.media.upsert({
      where: { roomId },
      create: {
        roomId,
        title: safeTitle,
        filename,
        mimeType: "video/mp4",
        size: BigInt(isStorageKey && source.size ? source.size : 0),
        storageKey: initialStorageKey,
        originalStorageKey: initialStorageKey,
        status: "processing",
        transcodeProgress: 5,
      },
      update: {
        title: safeTitle,
        filename,
        storageKey: initialStorageKey,
        originalStorageKey: initialStorageKey,
        status: "processing",
        transcodeProgress: 5,
        transcodeError: null,
      },
    });

    // 2. Broadcast MEDIA_PROCESSING socket event immediately to room channel
    broadcastToRoom(roomId, SOCKET_EVENTS.MEDIA_PROCESSING, {
      roomId,
      status: "processing",
      progress: 5,
      media: {
        ...mediaRecord,
        size: mediaRecord.size.toString(),
        url: mediaRecord.storageKey ? mediaStorage.getUrl(mediaRecord.storageKey) : "",
      },
    });

    if (job.localSourcePath) {
      tempFileLifecycle.registerActiveFile(job.localSourcePath);
    }

    this.queue.push(job);
    this.processNext();
  }

  /**
   * Cancels a job by jobId (whether queued or currently executing).
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const queuedIdx = this.queue.findIndex((j) => j.id === jobId);
    if (queuedIdx !== -1) {
      const [cancelledJob] = this.queue.splice(queuedIdx, 1);
      if (cancelledJob && cancelledJob.localSourcePath) {
        tempFileLifecycle.unregisterActiveFile(cancelledJob.localSourcePath);
        tempFileLifecycle.safeDeleteFile(cancelledJob.localSourcePath, true);
        tempFileLifecycle.safeDeleteFile(`${cancelledJob.localSourcePath}_storage.tmp`, true);
      }
      return true;
    }

    const isTranscodingCancelled = transcodingService.cancelJob(jobId);
    const isHlsCancelled = hlsPackager.cancelJob(jobId);
    return isTranscodingCancelled || isHlsCancelled;
  }

  private async isRoomActive(roomId: string): Promise<boolean> {
    if (this.cancelledRoomIds.has(roomId)) return false;
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    return !!room && room.status === "active";
  }

  private async processNext() {
    if (this.activeJobsCount >= this.maxConcurrentTranscodes || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeJobsCount++;
    try {
      await this.runJob(job);
    } catch (err: any) {
      logger.error("Media processing job unhandled error", { jobId: job.id, message: err.message });
    } finally {
      this.activeJobsCount--;
      this.processNext();
    }
  }

  private async runJob(job: MediaJob) {
    const { roomId, localSourcePath, sourceStorageKey, sourceSize, filename, title } = job;
    logger.info("Starting media processing job", { jobId: job.id, roomId, filename, sourceStorageKey });

    this.activeJobMap.set(roomId, job);

    let tempConvertedPath: string | null = null;
    let sourceStorageInput: string | null = null;
    let actualSourcePath: string | null = null;

    if (localSourcePath) {
      tempFileLifecycle.registerActiveFile(localSourcePath);
      actualSourcePath = localSourcePath;
    }

    try {
      // Pre-execution check: abort if room is no longer active / cancelled
      if (!(await this.isRoomActive(roomId))) {
        logger.info("[MediaJobQueue] Aborting job start for cancelled room", { jobId: job.id, roomId });
        return;
      }

      const tempDir = path.join(CONFIG.MEDIA_STORAGE_PATH, "temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // If source is already in storage (e.g. Backblaze B2 direct multipart upload):
      if (sourceStorageKey) {
        const localPath = mediaStorage.getLocalPath(sourceStorageKey);
        if (localPath && fs.existsSync(localPath)) {
          actualSourcePath = localPath;
        } else {
          sourceStorageInput = path.join(
            tempDir,
            `b2_source_${Date.now()}_${path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_")}`
          );
          tempFileLifecycle.registerActiveFile(sourceStorageInput);
          logger.info("[MediaJobQueue] Downloading source object from storage for analysis", {
            jobId: job.id,
            sourceStorageKey,
          });
          await mediaStorage.downloadToFile(sourceStorageKey, sourceStorageInput, async (downloaded, total) => {
            const dlPercent = Math.min(25, 5 + Math.round((downloaded / total) * 20));
            const dlMB = (downloaded / (1024 * 1024)).toFixed(0);
            const totalMB = (total / (1024 * 1024)).toFixed(0);
            const stage = `Retrieving video from storage (${dlMB}/${totalMB} MB)...`;

            await prisma.media.update({
              where: { roomId },
              data: { transcodeProgress: dlPercent },
            }).catch(() => {});

            broadcastToRoom(roomId, SOCKET_EVENTS.MEDIA_PROGRESS, {
              roomId,
              status: "processing",
              progress: dlPercent,
              stage,
            });
          });
          actualSourcePath = sourceStorageInput;
        }
      }

      if (!actualSourcePath || !fs.existsSync(actualSourcePath)) {
        throw new Error("Source media file could not be located on disk for analysis");
      }

      // Emit analysis stage
      broadcastToRoom(roomId, SOCKET_EVENTS.MEDIA_PROGRESS, {
        roomId,
        status: "processing",
        progress: 26,
        stage: "Analyzing media streams...",
      });

      // 1. Analyze media using ffprobe first to know action and size
      const analysis = await analyzeMediaFile(actualSourcePath);
      const decision = evaluateMediaCompatibility(analysis, filename);
      const safeTitle = title || filename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");

      const inputStat = fs.existsSync(actualSourcePath) ? fs.statSync(actualSourcePath) : null;
      const inputSizeBytes = inputStat ? inputStat.size : (analysis.sizeBytes || sourceSize || 0);

      // Realistic required output space: 1.2x input size + 200MB buffer for transcoded output
      const requiredBytes = Math.ceil(inputSizeBytes * 1.2) + 200 * 1024 * 1024;
      const diskCheck = tempFileLifecycle.checkDiskSpace(tempDir, requiredBytes);
      if (!diskCheck.hasEnoughSpace) {
        throw new Error("Not enough temporary storage to prepare this video.");
      }

      const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, "_");
      let savedOriginal: { storageKey: string; size: number };
      if (sourceStorageKey) {
        savedOriginal = {
          storageKey: sourceStorageKey,
          size: analysis.sizeBytes || sourceSize || inputSizeBytes,
        };
        if (sourceStorageInput && fs.existsSync(sourceStorageInput)) {
          tempFileLifecycle.unregisterActiveFile(sourceStorageInput);
          tempFileLifecycle.safeDeleteFile(sourceStorageInput, true);
          sourceStorageInput = null;
        }
      } else {
        savedOriginal = await mediaStorage.saveFile(
          roomId,
          `source_${filename}`,
          actualSourcePath,
          decision.targetMimeType
        );
        actualSourcePath = mediaStorage.getLocalPath(savedOriginal.storageKey) || actualSourcePath;
      }

      // Check if room was cancelled while saving source
      if (!(await this.isRoomActive(roomId))) {
        logger.info("[MediaJobQueue] Aborting job for cancelled room", { jobId: job.id, roomId });
        return;
      }

      const hlsMasterStorageKey = path.join(safeRoomId, "hls", "master.m3u8");
      const hlsOutputDir = path.join(CONFIG.MEDIA_STORAGE_PATH, safeRoomId, "hls");

      // Build initial track manifest
      const initialManifest = buildTrackManifest(analysis, {
        isHls: true,
        hlsMasterUrl: mediaStorage.getUrl(hlsMasterStorageKey),
        mp4FallbackUrl: mediaStorage.getUrl(savedOriginal.storageKey),
      });

      // 2. Create / update media record in PROCESSING state with initial track manifest
      await prisma.media.upsert({
        where: { roomId },
        create: {
          roomId,
          title: safeTitle,
          filename,
          mimeType: decision.targetMimeType,
          size: BigInt(analysis.sizeBytes || savedOriginal.size),
          duration: analysis.duration || undefined,
          storageKey: savedOriginal.storageKey,
          originalStorageKey: savedOriginal.storageKey,
          playbackStorageKey: hlsMasterStorageKey,
          status: "processing",
          transcodeProgress: 5,
          sourceMimeType: decision.targetMimeType,
          sourceSize: BigInt(analysis.sizeBytes || savedOriginal.size),
          videoCodec: analysis.videoCodec || undefined,
          audioCodec: analysis.audioCodec || undefined,
          width: analysis.width || undefined,
          height: analysis.height || undefined,
          trackManifest: JSON.stringify(initialManifest),
        },
        update: {
          title: safeTitle,
          filename,
          mimeType: decision.targetMimeType,
          size: BigInt(analysis.sizeBytes || savedOriginal.size),
          duration: analysis.duration || undefined,
          storageKey: savedOriginal.storageKey,
          originalStorageKey: savedOriginal.storageKey,
          playbackStorageKey: hlsMasterStorageKey,
          status: "processing",
          transcodeProgress: 5,
          transcodeError: null,
          videoCodec: analysis.videoCodec || undefined,
          audioCodec: analysis.audioCodec || undefined,
          width: analysis.width || undefined,
          height: analysis.height || undefined,
          trackManifest: JSON.stringify(initialManifest),
        },
      });

      broadcastToRoom(roomId, SOCKET_EVENTS.MEDIA_PROCESSING, {
        roomId,
        status: "processing",
        progress: 5,
        stage: "Host is preparing the movie, 5%",
        media: (await roomManager.getRoomInfo(roomId))?.media,
      });

      // Prepare clean HLS output directory
      if (fs.existsSync(hlsOutputDir)) {
        fs.rmSync(hlsOutputDir, { recursive: true, force: true });
      }
      fs.mkdirSync(hlsOutputDir, { recursive: true });

      // 3. Package to HLS with multi-audio, subtitle extraction, and early playback
      let finalManifest = initialManifest;
      let earlyPlaybackTriggered = false;

      try {
        const hlsResult = await hlsPackager.packageToHls(job.id, {
          inputPath: actualSourcePath,
          outputDir: hlsOutputDir,
          analysis,
          onProgress: async (progressPercent, speed, etaSeconds, stage) => {
            const scaledPercent = Math.min(99, Math.max(5, progressPercent));
            await prisma.media.update({
              where: { roomId },
              data: { transcodeProgress: scaledPercent },
            }).catch(() => {});

            broadcastToRoom(roomId, SOCKET_EVENTS.MEDIA_PROGRESS, {
              roomId,
              status: "processing",
              progress: scaledPercent,
              speed,
              etaSeconds,
              stage: `Host is preparing the movie, ${scaledPercent}%`,
            });
          },
          onInitialSegmentsReady: async () => {
            if (!earlyPlaybackTriggered) {
              earlyPlaybackTriggered = true;
              logger.info("[MediaJobQueue] Initial HLS segments ready, broadcasting early playback", { roomId });
              const earlyRoom = await roomManager.getRoomInfo(roomId);
              if (earlyRoom && earlyRoom.media) {
                syncEngine.getOrCreateState(roomId);
                broadcastToRoom(roomId, SOCKET_EVENTS.MEDIA_READY, {
                  roomId,
                  status: "ready",
                  progress: 25,
                  media: earlyRoom.media,
                });
                broadcastToRoom(roomId, "room:updated", {
                  room: earlyRoom,
                });
              }
            }
          },
        });

        finalManifest = hlsResult.trackManifest;

        const convertedFilename = `${filename.replace(/\.[^/.]+$/, "")}.mp4`;
        // Update DB to READY state with finalized VOD manifest
        await prisma.media.update({
          where: { roomId },
          data: {
            filename: convertedFilename,
            mimeType: "video/mp4",
            playbackStorageKey: hlsMasterStorageKey,
            status: "ready",
            transcodeProgress: 100,
            transcodeError: null,
            trackManifest: JSON.stringify(finalManifest),
          },
        });

        logger.info("[MediaJobQueue] HLS packaging completed successfully", {
          roomId,
          executionTimeMs: hlsResult.executionTimeMs,
          audioTracks: finalManifest.audioTracks.length,
          subtitleTracks: finalManifest.subtitleTracks.length,
        });
      } catch (hlsErr: any) {
        logger.warn("[MediaJobQueue] HLS packaging failed; attempting progressive MP4 fallback", {
          roomId,
          error: hlsErr.message,
        });

        // 4. Fallback: Progressive MP4
        tempConvertedPath = path.join(tempDir, `converted_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.mp4`);
        tempFileLifecycle.registerActiveFile(tempConvertedPath);

        const mp4Result = await transcodingService.processVideo(job.id, {
          inputPath: actualSourcePath,
          outputPath: tempConvertedPath,
          mode: (decision.action as any) || "TRANSCODE",
          audioStreamIndex: decision.selectedAudioStreamIndex,
          isAudioCompatible: decision.isAudioCompatible,
          durationSeconds: analysis.duration,
          onProgress: async (progressPercent, speed, etaSeconds, stage) => {
            const scaledPercent = Math.min(99, 10 + Math.round(progressPercent * 0.89));
            await prisma.media.update({
              where: { roomId },
              data: { transcodeProgress: scaledPercent },
            }).catch(() => {});

            broadcastToRoom(roomId, SOCKET_EVENTS.MEDIA_PROGRESS, {
              roomId,
              status: "processing",
              progress: scaledPercent,
              speed,
              etaSeconds,
              stage: stage || `Converting video for fallback playback (${scaledPercent}%)...`,
            });
          },
        });

        const verifiedAnalysis = await validatePlaybackFile(mp4Result.outputPath);
        const convertedFilename = `${filename.replace(/\.[^/.]+$/, "")}.mp4`;
        const savedFallback = await mediaStorage.saveFile(
          roomId,
          convertedFilename,
          mp4Result.outputPath,
          "video/mp4"
        );

        // Mark that only primary audio track is switchable in progressive MP4 fallback
        const fallbackManifest = buildTrackManifest(analysis, {
          isHls: false,
          mp4FallbackUrl: mediaStorage.getUrl(savedFallback.storageKey),
        });
        fallbackManifest.audioTracks.forEach((t, i) => {
          if (i > 0) {
            (t as any).supported = false;
            (t as any).unsupportedReason = "HLS packaging failed; progressive MP4 fallback exposes only primary audio track.";
          }
        });

        await prisma.media.update({
          where: { roomId },
          data: {
            filename: convertedFilename,
            mimeType: "video/mp4",
            size: BigInt(savedFallback.size),
            duration: verifiedAnalysis.duration || analysis.duration,
            storageKey: savedFallback.storageKey,
            playbackStorageKey: savedFallback.storageKey,
            status: "ready",
            transcodeProgress: 100,
            transcodeError: null,
            videoCodec: "h264",
            audioCodec: "aac",
            trackManifest: JSON.stringify(fallbackManifest),
          },
        });
      }

      // Check if room was cancelled while packaging/transcoding
      if (!(await this.isRoomActive(roomId))) {
        logger.info("[MediaJobQueue] Room was cancelled during packaging. Suppressing MEDIA_READY.", { jobId: job.id, roomId });
        return;
      }

      // Initialize sync engine state
      syncEngine.getOrCreateState(roomId);

      const roomInfo = await roomManager.getRoomInfo(roomId);
      if (roomInfo) {
        broadcastToRoom(roomId, SOCKET_EVENTS.MEDIA_READY, {
          roomId,
          status: "ready",
          progress: 100,
          media: roomInfo.media,
        });
        broadcastToRoom(roomId, "room:updated", {
          room: roomInfo,
        });
      }
    } catch (err: any) {
      logger.error("Media processing job failed", { roomId, filename, error: err.message });

      transcodingService.cancelJob(job.id);
      hlsPackager.cancelJob(job.id);

      const cleanMsg = (err.message || "")
        .replace(/\/Users\/[^\s]+/g, "[path]")
        .replace(/\/app\/[^\s]+/g, "[path]")
        .replace(/[A-Za-z0-9_-]{24,}/g, "[REDACTED]");
      let userFacingError: string;
      if (err.message && err.message.includes("cap exceeded")) {
        userFacingError = "Video processing failed: Storage provider download limit reached (Backblaze B2 Bandwidth/Class B cap exceeded). Please check Caps & Alerts in your B2 console.";
      } else if (err.message && err.message.includes("Not enough temporary storage")) {
        userFacingError = "Not enough temporary storage to prepare this video.";
      } else {
        userFacingError = `Video processing failed (${cleanMsg.substring(0, 120)})`;
      }

      if (await this.isRoomActive(roomId)) {
        await prisma.media.update({
          where: { roomId },
          data: {
            status: "failed",
            transcodeProgress: 0,
            transcodeError: userFacingError,
          },
        }).catch(() => { });

        broadcastToRoom(roomId, SOCKET_EVENTS.MEDIA_FAILED, {
          roomId,
          status: "failed",
          progress: 0,
          error: userFacingError,
        });
      }
    } finally {
      this.activeJobMap.delete(roomId);
      if (tempConvertedPath) {
        tempFileLifecycle.unregisterActiveFile(tempConvertedPath);
        tempFileLifecycle.safeDeleteFile(tempConvertedPath, true);
      }
      if (sourceStorageInput) {
        tempFileLifecycle.unregisterActiveFile(sourceStorageInput);
        tempFileLifecycle.safeDeleteFile(sourceStorageInput, true);
      }
      if (localSourcePath) {
        tempFileLifecycle.unregisterActiveFile(localSourcePath);
        tempFileLifecycle.safeDeleteFile(localSourcePath, true);
      }
    }
  }
}

export const mediaJobQueue = new MediaJobQueue(1);
