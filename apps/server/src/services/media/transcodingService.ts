import { getFfmpegPath } from './binaryResolver.js';
import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logger } from '../../utils/logger.js';

import { tempFileLifecycle } from './tempFileLifecycle.js';

export interface TranscodeOptions {
  inputPath: string;
  outputPath: string;
  mode: 'REMUX' | 'AUDIO_TRANSCODE_VIDEO_COPY' | 'TRANSCODE';
  audioStreamIndex?: number;
  isAudioCompatible?: boolean;
  durationSeconds?: number;
  onProgress?: (progressPercent: number, speed?: string, etaSeconds?: number, stage?: string) => void;
}

export interface TranscodeResult {
  outputPath: string;
  outputSize: number;
  mode: string;
  executionTimeMs: number;
}

export class TranscodingService {
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private activeJobOutputs: Map<string, string> = new Map();
  private hasHardwareVideoToolbox: boolean | null = null;

  /**
   * Checks whether Apple VideoToolbox hardware H.264 encoder is available on macOS.
   */
  private checkHardwareAcceleration(): boolean {
    if (this.hasHardwareVideoToolbox !== null) {
      return this.hasHardwareVideoToolbox;
    }
    try {
      if (process.platform === 'darwin') {
        const stdout = execSync(`"${getFfmpegPath()}" -encoders`, { encoding: 'utf-8', timeout: 3000 });
        if (stdout.includes('h264_videotoolbox')) {
          this.hasHardwareVideoToolbox = true;
          logger.info('VideoToolbox H.264 hardware acceleration detected and enabled');
          return true;
        }
      }
    } catch {
      // Ignore check errors
    }
    this.hasHardwareVideoToolbox = false;
    return false;
  }

  /**
   * Pre-checks available disk space to prevent crash mid-transcode for large 5 GB files.
   */
  private checkDiskSpace(directory: string, requiredBytes: number): void {
    const check = tempFileLifecycle.checkDiskSpace(directory, requiredBytes);
    if (!check.hasEnoughSpace) {
      throw new Error('Not enough temporary storage to prepare this video.');
    }
  }

  /**
   * Performs remuxing, video stream copying + audio transcoding, or full transcoding using FFmpeg.
   * Spawns ffmpeg safely with argument arrays (no shell string execution).
   */
  async processVideo(jobId: string, options: TranscodeOptions): Promise<TranscodeResult> {
    const { inputPath, outputPath, mode, audioStreamIndex, isAudioCompatible, durationSeconds, onProgress } = options;

    const absInput = path.resolve(inputPath);
    const absOutput = path.resolve(outputPath);

    // Verify input file existence and size
    if (!fs.existsSync(absInput)) {
      throw new Error(`Input media file not found: ${absInput}`);
    }

    const inputStat = fs.statSync(absInput);
    const outDir = path.dirname(absOutput);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Disk space pre-check: ensure at least input size + 500 MB free space
    this.checkDiskSpace(outDir, inputStat.size + 500 * 1024 * 1024);

    let args: string[] = [];
    let stageDescription = 'Processing media...';

    const aMap = audioStreamIndex !== undefined ? `0:${audioStreamIndex}` : '0:a:0?';

    if (mode === 'REMUX') {
      stageDescription = audioStreamIndex !== undefined
        ? `Remuxing container (copying video & AAC track #${audioStreamIndex})...`
        : 'Remuxing container (copying streams)...';

      args = [
        '-y',
        '-progress',
        'pipe:1',
        '-nostats',
        '-i',
        absInput,
        '-map',
        '0:v:0',
        '-map',
        aMap,
        '-c:v',
        'copy',
        '-c:a',
        'copy',
        '-movflags',
        '+faststart',
        absOutput,
      ];
    } else if (mode === 'AUDIO_TRANSCODE_VIDEO_COPY') {
      stageDescription = 'Copying video & converting audio to AAC...';
      args = [
        '-y',
        '-progress',
        'pipe:1',
        '-nostats',
        '-i',
        absInput,
        '-map',
        '0:v:0',
        '-map',
        aMap,
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-ac',
        '2',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        absOutput,
      ];
    } else {
      // Mode: TRANSCODE
      const audioCodecArgs = isAudioCompatible
        ? ['-c:a', 'copy']
        : ['-c:a', 'aac', '-b:a', '192k'];

      stageDescription = isAudioCompatible
        ? 'Transcoding video (copying audio stream)...'
        : 'Transcoding video & audio...';

      const useHw = this.checkHardwareAcceleration();
      const approxBitrate = (inputStat.size && durationSeconds)
        ? Math.round((inputStat.size * 8) / durationSeconds)
        : 8_000_000;
      const targetBitrate = Math.max(6_000_000, Math.min(14_000_000, Math.round(approxBitrate * 0.9)));
      const maxRate = Math.round(targetBitrate * 1.5);
      const bufSize = Math.round(targetBitrate * 2.0);

      if (useHw) {
        args = [
          '-y',
          '-progress',
          'pipe:1',
          '-nostats',
          '-i',
          absInput,
          '-map',
          '0:v:0',
          '-map',
          aMap,
          '-c:v',
          'h264_videotoolbox',
          '-b:v',
          `${targetBitrate}`,
          '-maxrate',
          `${maxRate}`,
          '-bufsize',
          `${bufSize}`,
          '-profile:v',
          'high',
          '-level',
          '4.2',
          '-pix_fmt',
          'yuv420p',
          '-colorspace',
          'bt709',
          '-color_primaries',
          'bt709',
          '-color_trc',
          'bt709',
          ...audioCodecArgs,
          '-movflags',
          '+faststart',
          absOutput,
        ];
      } else {
        // High quality software encoder: libx264 -crf 18 -preset veryfast -profile:v high -level 4.2
        args = [
          '-y',
          '-progress',
          'pipe:1',
          '-nostats',
          '-i',
          absInput,
          '-map',
          '0:v:0',
          '-map',
          aMap,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '18',
          '-profile:v',
          'high',
          '-level',
          '4.2',
          '-pix_fmt',
          'yuv420p',
          '-colorspace',
          'bt709',
          '-color_primaries',
          'bt709',
          '-color_trc',
          'bt709',
          ...audioCodecArgs,
          '-movflags',
          '+faststart',
          absOutput,
        ];
      }
    }

    const startTimeMs = Date.now();

    return new Promise<TranscodeResult>((resolve, reject) => {
      const ffmpeg = spawn(getFfmpegPath(), args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.activeProcesses.set(jobId, ffmpeg);
      this.activeJobOutputs.set(jobId, absOutput);
      tempFileLifecycle.registerActiveFile(absOutput);

      let lastEmittedPercent = -1;
      let lastEmittedSpeed = '';
      let currentSpeed = '1.0x';
      let currentOutTimeSec = 0;
      let lastProgressTime = Date.now();

      // Stall detection monitor
      const stallMonitor = setInterval(() => {
        const idleMs = Date.now() - lastProgressTime;
        if (idleMs > 30000) {
          logger.warn('Transcoding progress stall detected', {
            jobId,
            mode,
            idleMs,
            outTimeSec: currentOutTimeSec,
          });
        }
      }, 15000);

      ffmpeg.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        const lines = text.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('out_time_ms=')) {
            const msStr = trimmed.split('=')[1]?.trim();
            if (msStr && durationSeconds && durationSeconds > 0) {
              currentOutTimeSec = parseInt(msStr, 10) / 1000000;
              const pct = Math.min(99, Math.max(1, Math.round((currentOutTimeSec / durationSeconds) * 100)));

              let etaSec: number | undefined = undefined;
              const speedNum = parseFloat(currentSpeed.replace('x', ''));
              if (speedNum > 0 && durationSeconds > currentOutTimeSec) {
                etaSec = Math.round((durationSeconds - currentOutTimeSec) / speedNum);
              }

              const now = Date.now();
              if (pct !== lastEmittedPercent || (currentSpeed !== lastEmittedSpeed && now - lastProgressTime > 300)) {
                lastEmittedPercent = pct;
                lastEmittedSpeed = currentSpeed;
                lastProgressTime = now;
                if (onProgress) {
                  const currentStage = pct >= 98 ? 'Finalizing movie for streaming...' : stageDescription;
                  onProgress(pct, currentSpeed, etaSec, currentStage);
                }
              }
            }
          } else if (trimmed.startsWith('speed=')) {
            const speedVal = trimmed.split('=')[1]?.trim();
            if (speedVal) {
              currentSpeed = speedVal;
            }
          }
        }
      });

      let stderrOutput = '';
      ffmpeg.stderr.on('data', (chunk: Buffer) => {
        stderrOutput += chunk.toString('utf-8');
      });

      ffmpeg.on('error', (err) => {
        clearInterval(stallMonitor);
        this.activeProcesses.delete(jobId);
        this.activeJobOutputs.delete(jobId);
        tempFileLifecycle.unregisterActiveFile(absOutput);
        tempFileLifecycle.safeDeleteFile(absOutput, true);
        reject(new Error(`FFmpeg process failed to start: ${err.message}`));
      });

      ffmpeg.on('close', (code) => {
        clearInterval(stallMonitor);
        this.activeProcesses.delete(jobId);
        this.activeJobOutputs.delete(jobId);
        tempFileLifecycle.unregisterActiveFile(absOutput);

        const executionTimeMs = Date.now() - startTimeMs;

        if (code === 0 && fs.existsSync(absOutput)) {
          const stat = fs.statSync(absOutput);
          if (onProgress) onProgress(100, currentSpeed, 0, 'Ready');
          logger.info('Media conversion completed successfully', {
            jobId,
            mode,
            executionTimeMs,
            outputSizeBytes: stat.size,
          });
          resolve({
            outputPath: absOutput,
            outputSize: stat.size,
            mode,
            executionTimeMs,
          });
        } else {
          tempFileLifecycle.safeDeleteFile(absOutput, true);
          const errSnippet = stderrOutput.substring(stderrOutput.length - 500);
          reject(new Error(`FFmpeg exited with code ${code}. Details: ${errSnippet || 'Unknown error'}`));
        }
      });
    });
  }

  /**
   * Cancels a running transcoding job and cleans up partial output.
   */
  cancelJob(jobId: string): boolean {
    const proc = this.activeProcesses.get(jobId);
    const outputPath = this.activeJobOutputs.get(jobId);
    if (proc) {
      proc.kill('SIGKILL');
      this.activeProcesses.delete(jobId);
      this.activeJobOutputs.delete(jobId);
      if (outputPath) {
        tempFileLifecycle.unregisterActiveFile(outputPath);
        tempFileLifecycle.safeDeleteFile(outputPath, true);
      }
      return true;
    }
    return false;
  }

  cancelAllJobs(): void {
    for (const jobId of Array.from(this.activeProcesses.keys())) {
      this.cancelJob(jobId);
    }
  }
}

export const transcodingService = new TranscodingService();
