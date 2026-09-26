import path from "path";
import fs from "fs";
import { prisma } from "../../db.js";
import { mediaStorage } from "../mediaStorage.js";
import { roomManager } from "../roomManager.js";
import { syncEngine } from "../syncEngine.js";
import { analyzeMediaFile } from "./mediaAnalyzer.js";
import { evaluateMediaCompatibility, validatePlaybackFile } from "./mediaCompatibility.js";
import { transcodingService } from "./transcodingService.js";
import { SOCKET_EVENTS } from "@syncwatch/shared";
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
      logger.info("[MediaJobQueue] Cancelled active transcoding job for room", { jobId: activeJob.id, roomId });
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
    return isTranscodingCancelled;
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

      if (decision.action === "DIRECT_PLAY") {
        logger.info("Media eligible for DIRECT_PLAY", { roomId, filename, reason: decision.reason });

        if (!(await this.isRoomActive(roomId))) {
          logger.info("[MediaJobQueue] Aborting DIRECT_PLAY save for cancelled room", { jobId: job.id, roomId });
          return;
        }

        let savedMedia: { storageKey: string; size: number };
        if (sourceStorageKey) {
          // B2 object already exists in storage! No re-upload needed.
          savedMedia = {
            storageKey: sourceStorageKey,
            size: analysis.sizeBytes || sourceSize || inputSizeBytes,
          };
          if (sourceStorageInput && fs.existsSync(sourceStorageInput)) {
            tempFileLifecycle.unregisterActiveFile(sourceStorageInput);
            tempFileLifecycle.safeDeleteFile(sourceStorageInput, true);
            sourceStorageInput = null;
          }
        } else {
          // Save original local file to media storage
          savedMedia = await mediaStorage.saveFile(
            roomId,
            filename,
            actualSourcePath,
            decision.targetMimeType
          );
        }

        // Record ready media in DB
        const mediaRecord = await prisma.media.upsert({
          where: { roomId },
          create: {
            roomId,
            title: safeTitle,
            filename,
            mimeType: decision.targetMimeType,
            size: BigInt(analysis.sizeBytes || savedMedia.size),
            duration: analysis.duration || undefined,
            storageKey: savedMedia.storageKey,
            originalStorageKey: savedMedia.storageKey,
            playbackStorageKey: savedMedia.storageKey,
            status: "ready",
            transcodeProgress: 100,
            videoCodec: analysis.videoCodec || undefined,
            audioCodec: analysis.audioCodec || undefined,
            width: analysis.width || undefined,
            height: analysis.height || undefined,
          },
          update: {
            title: safeTitle,
            filename,
            mimeType: decision.targetMimeType,
            size: BigInt(analysis.sizeBytes || savedMedia.size),
            duration: analysis.duration || undefined,
            storageKey: savedMedia.storageKey,
            originalStorageKey: savedMedia.storageKey,
            playbackStorageKey: savedMedia.storageKey,
            status: "ready",
            transcodeProgress: 100,
            transcodeError: null,
            videoCodec: analysis.videoCodec || undefined,
            audioCodec: analysis.audioCodec || undefined,
            width: analysis.width || undefined,
            height: analysis.height || undefined,
          },
        });

        // Initialize sync engine state
        syncEngine.getOrCreateState(roomId);

        const roomInfo = await roomManager.getRoomInfo(roomId);
        if (roomInfo) {
          broadcastToRoom(roomId, SOCKET_EVENTS.MEDIA_READY, {
            roomId,
            media: roomInfo.media,
          });
          broadcastToRoom(roomId, "room:updated", {
            room: roomInfo,
          });
        }
        return;
      }

      // 3. REMUX or TRANSCODE required
      logger.info(`Media requires ${decision.action}`, { roomId, filename, reason: decision.reason });

      let savedOriginal: { storageKey: string; size: number };
      if (sourceStorageKey) {
        savedOriginal = {
          storageKey: sourceStorageKey,
          size: analysis.sizeBytes || sourceSize || inputSizeBytes,
        };
      } else {
        savedOriginal = await mediaStorage.saveFile(
          roomId,
          `source_${filename}`,
          actualSourcePath,
          decision.targetMimeType
        );
        actualSourcePath = mediaStorage.getLocalPath(savedOriginal.storageKey) || actualSourcePath;
      }

      // Create / update media record in PROCESSING state
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
          playbackStorageKey: null,
          status: "processing",
          transcodeProgress: 5,
          sourceMimeType: decision.targetMimeType,
          sourceSize: BigInt(analysis.sizeBytes || savedOriginal.size),
          videoCodec: analysis.videoCodec || undefined,
          audioCodec: analysis.audioCodec || undefined,
          width: analysis.width || undefined,
          height: analysis.height || undefined,
        },
        update: {
          title: safeTitle,
          filename,
          mimeType: decision.targetMimeType,
          size: BigInt(analysis.sizeBytes || savedOriginal.size),
          duration: analysis.duration || undefined,
          storageKey: savedOriginal.storageKey,
          originalStorageKey: savedOriginal.storageKey,
          playbackStorageKey: null,
          status: "processing",
          transcodeProgress: 5,
          transcodeError: null,
          videoCodec: analysis.videoCodec || undefined,
          audioCodec: analysis.audioCodec || undefined,
          width: analysis.width || undefined,
          height: analysis.height || undefined,
        },
      });

      broadcastToRoom(roomId, SOCKET_EVENTS.MEDIA_PROCESSING, {
        roomId,
        status: "processing",
        progress: 5,
      });

      // Prepare temp destination for converted MP4
      tempConvertedPath = path.join(tempDir, `converted_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.mp4`);
      tempFileLifecycle.registerActiveFile(tempConvertedPath);

      // 4. Run FFmpeg conversion with diagnostics logging
      logger.info("MEDIA_DIAGNOSTICS_START", {
        jobId: job.id,
        roomId,
        filename,
        sourceVideoCodec: analysis.videoCodec || "none",
        sourceAudioCodec: analysis.audioCodec || "none",
        resolution: analysis.width && analysis.height ? `${analysis.width}x${analysis.height}` : "unknown",
        durationSeconds: analysis.duration,
        sourceSizeBytes: analysis.sizeBytes,
        action: decision.action,
        reason: decision.reason,
        selectedAudioStreamIndex: decision.selectedAudioStreamIndex,
        isAudioCompatible: decision.isAudioCompatible,
      });

      const result = await transcodingService.processVideo(job.id, {
        inputPath: actualSourcePath,
        outputPath: tempConvertedPath,
        mode: (decision.action as "REMUX" | "TRANSCODE" | "AUDIO_TRANSCODE_VIDEO_COPY"),
        audioStreamIndex: decision.selectedAudioStreamIndex,
        isAudioCompatible: decision.isAudioCompatible,
        durationSeconds: analysis.duration,
        onProgress: async (progressPercent, speed, etaSeconds, stage) => {
          const scaledPercent = Math.min(99, 30 + Math.round(progressPercent * 0.69));
          await prisma.media.update({
            where: { roomId },
            data: { transcodeProgress: scaledPercent },
          }).catch(() => { });

          broadcastToRoom(roomId, SOCKET_EVENTS.MEDIA_PROGRESS, {
            roomId,
            status: "processing",
            progress: scaledPercent,
            speed,
            etaSeconds,
            stage: stage || (decision.action === "REMUX" ? "Remuxing container..." : decision.action === "AUDIO_TRANSCODE_VIDEO_COPY" ? "Converting audio (copying video)..." : "Re-encoding video..."),
          });
        },
      });

      logger.info("MEDIA_DIAGNOSTICS_COMPLETE", {
        jobId: job.id,
        roomId,
        action: decision.action,
        executionTimeMs: result.executionTimeMs,
        processingDurationSec: Math.round(result.executionTimeMs / 1000),
        outputSizeBytes: result.outputSize,
        processingSpeedRatio: (analysis.duration / Math.max(0.001, result.executionTimeMs / 1000)).toFixed(2) + "x",
      });

      // Check if room is still active before registering playback output
      if (!(await this.isRoomActive(roomId))) {
        logger.info("[MediaJobQueue] Room was cancelled during transcoding. Cleaning output and suppressing MEDIA_READY.", { jobId: job.id, roomId });
        if (result.outputPath) {
          tempFileLifecycle.safeDeleteFile(result.outputPath, true);
        }
        return;
      }

      // 5. Post-processing validation step per Section 17
      const verifiedAnalysis = await validatePlaybackFile(result.outputPath);

      // 6. Save converted playback file to media storage
      const convertedFilename = `${filename.replace(/\.[^/.]+$/, "")}.mp4`;
      const savedPlayback = await mediaStorage.saveFile(
        roomId,
        convertedFilename,
        result.outputPath,
        "video/mp4"
      );

      // 7. Update Media record to READY state with verified duration and metadata
      await prisma.media.update({
        where: { roomId },
        data: {
          filename: convertedFilename,
          mimeType: "video/mp4",
          size: BigInt(savedPlayback.size),
          duration: verifiedAnalysis.duration || analysis.duration,
          storageKey: savedPlayback.storageKey,
          playbackStorageKey: savedPlayback.storageKey,
          status: "ready",
          transcodeProgress: 100,
          transcodeError: null,
          videoCodec: "h264",
          audioCodec: "aac",
        },
      });

      logger.info("Media processing completed successfully", { roomId, filename: convertedFilename, size: savedPlayback.size });

      // Initialize sync engine state for converted video
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

      const cleanMsg = (err.message || "")
        .replace(/\/Users\/[^\s]+/g, "[path]")
        .replace(/\/app\/[^\s]+/g, "[path]")
        .replace(/[A-Za-z0-9_-]{24,}/g, "[REDACTED]");
      const userFacingError = (err.message && err.message.includes("Not enough temporary storage"))
        ? "Not enough temporary storage to prepare this video."
        : `Video processing failed (${cleanMsg.substring(0, 120)})`;

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
