import { getFfmpegPath } from './binaryResolver.js';
import { spawn, ChildProcess, execSync, execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import util from 'util';
import { logger } from '../../utils/logger.js';
import { tempFileLifecycle } from './tempFileLifecycle.js';
import { MediaAnalysis, MediaStreamInfo } from './mediaAnalyzer.js';
import { buildTrackManifest, formatLanguageName } from './trackManifest.js';
import { TrackManifest, AudioTrackInfo, SubtitleTrackInfo } from '@cineva/shared';

const execFilePromise = util.promisify(execFile);

export interface HlsPackageOptions {
  inputPath: string;
  outputDir: string;
  analysis: MediaAnalysis;
  onProgress?: (progressPercent: number, speed?: string, etaSeconds?: number, stage?: string) => void;
  onInitialSegmentsReady?: () => void;
}

export interface HlsPackageResult {
  outputDir: string;
  masterPlaylistPath: string;
  masterPlaylistContent: string;
  trackManifest: TrackManifest;
  executionTimeMs: number;
  totalSizeBytes: number;
}

export class HlsPackager {
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private hasHardwareVideoToolbox: boolean | null = null;

  /**
   * Checks whether Apple VideoToolbox hardware H.264 encoder is available.
   */
  checkHardwareAcceleration(): boolean {
    if (this.hasHardwareVideoToolbox !== null) {
      return this.hasHardwareVideoToolbox;
    }
    try {
      if (process.platform === 'darwin') {
        const stdout = execSync(`"${getFfmpegPath()}" -encoders`, { encoding: 'utf-8', timeout: 3000 });
        if (stdout.includes('h264_videotoolbox')) {
          this.hasHardwareVideoToolbox = true;
          logger.info('[HlsPackager] VideoToolbox H.264 hardware acceleration detected and enabled');
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
   * Extracts a single text subtitle track to a standalone WebVTT (.vtt) file.
   */
  async extractSubtitleTrack(
    inputPath: string,
    streamIndex: number,
    outputPath: string
  ): Promise<boolean> {
    try {
      const args = [
        '-y',
        '-nostdin',
        '-v',
        'warning',
        '-i',
        inputPath,
        '-map',
        `0:${streamIndex}`,
        '-c:s',
        'webvtt',
        outputPath,
      ];
      await execFilePromise(getFfmpegPath(), args, { timeout: 30000 });
      return fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
    } catch (err: any) {
      logger.warn('[HlsPackager] Subtitle extraction failed for stream', { streamIndex, message: err.message });
      return false;
    }
  }

  /**
   * Packages a video file into fMP4 HLS with independent audio streams and subtitle extraction.
   */
  async packageToHls(
    jobId: string,
    options: HlsPackageOptions
  ): Promise<HlsPackageResult> {
    const { inputPath, outputDir, analysis, onProgress, onInitialSegmentsReady } = options;
    const startTimeMs = Date.now();

    const absInput = path.resolve(inputPath);
    const absOutputDir = path.resolve(outputDir);

    if (!fs.existsSync(absInput)) {
      throw new Error(`Input media file not found: ${absInput}`);
    }

    if (!fs.existsSync(absOutputDir)) {
      fs.mkdirSync(absOutputDir, { recursive: true });
    }

    // 1. Extract all text subtitle tracks first
    const subtitleStreams = analysis.streams.filter((s) => s.codecType === 'subtitle');
    const extractedSubtitles: Array<{ streamIndex: number; filename: string; vttPath: string; subTrack: SubtitleTrackInfo }> = [];
    const subtitleManifestUrls: Record<number, string> = {};

    const initialManifest = buildTrackManifest(analysis);

    for (const subTrack of initialManifest.subtitleTracks) {
      if (subTrack.supported) {
        const vttFilename = `sub_${subTrack.streamIndex}_${subTrack.language}.vtt`;
        const vttPath = path.join(absOutputDir, vttFilename);
        const ok = await this.extractSubtitleTrack(absInput, subTrack.streamIndex, vttPath);
        if (ok) {
          extractedSubtitles.push({
            streamIndex: subTrack.streamIndex,
            filename: vttFilename,
            vttPath,
            subTrack,
          });
          subtitleManifestUrls[subTrack.streamIndex] = vttFilename;
        }
      }
    }

    // 2. Determine Video Encoding Strategy
    // Browser-safe: H.264, High profile <= 4.2, 8-bit, yuv420p, <= 1080p
    const vStream = analysis.streams.find((s) => s.codecType === 'video');
    const isH264 = vStream && (vStream.codecName === 'h264' || vStream.codecName === 'avc1');
    const isYuv420p = !vStream?.pixFmt || vStream.pixFmt === 'yuv420p';
    const isWithin1080p = (vStream?.width || 0) <= 1920 && (vStream?.height || 0) <= 1080;
    const is8Bit = !vStream?.bitsPerRawSample || vStream.bitsPerRawSample === 8;
    const profile = (vStream?.profile || '').toLowerCase();
    const isSupportedProfile = !profile || profile.includes('high') || profile.includes('main') || profile.includes('baseline');
    const isSupportedLevel = !vStream?.level || vStream.level <= 42;
    const canCopyVideo = isH264 && isYuv420p && isWithin1080p && is8Bit && isSupportedProfile && isSupportedLevel;

    const videoArgs: string[] = [];
    const sourceBitrate = vStream?.bitrate || (analysis.sizeBytes && analysis.duration ? Math.round((analysis.sizeBytes * 8) / analysis.duration) : 8000000);

    if (canCopyVideo) {
      videoArgs.push('-c:v', 'copy', '-b:v', `${sourceBitrate}`);
    } else {
      const targetBitrate = Math.max(6000000, Math.min(14000000, Math.round(sourceBitrate * 0.9)));
      const maxRate = Math.round(targetBitrate * 1.5);
      const bufSize = Math.round(targetBitrate * 2.0);

      const useHw = this.checkHardwareAcceleration();
      if (useHw) {
        videoArgs.push(
          '-c:v', 'h264_videotoolbox',
          '-b:v', `${targetBitrate}`,
          '-maxrate', `${maxRate}`,
          '-bufsize', `${bufSize}`,
          '-profile:v', 'high',
          '-level', '4.2',
          '-allow_sw', '0'
        );
      } else {
        videoArgs.push(
          '-c:v', 'libx264',
          '-crf', '18',
          '-preset', 'veryfast',
          '-profile:v', 'high',
          '-level', '4.2'
        );
      }
      videoArgs.push('-pix_fmt', 'yuv420p');

      // Tone-map HDR to SDR if source is HDR
      const isHdr = vStream?.colorSpace === 'bt2020nc' ||
                    (vStream?.colorTransfer && (vStream.colorTransfer.includes('smpte2084') || vStream.colorTransfer.includes('arib')));

      if (isHdr) {
        videoArgs.push('-vf', "scale='min(1920,iw)':min'(1080,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,tonemap=mobius,format=yuv420p");
      } else {
        videoArgs.push('-vf', "scale='min(1920,iw)':min'(1080,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p");
      }

      // Tag BT.709 color metadata
      videoArgs.push('-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709');

      // Force keyframes at 4-second segment boundaries
      const fps = Math.round(vStream?.fps || 24);
      videoArgs.push('-g', `${fps * 4}`, '-keyint_min', `${fps * 4}`, '-sc_threshold', '0', '-force_key_frames', 'expr:gte(t,n_forced*4)');
    }

    // 3. Audio Streams Mapping
    const audioStreams = analysis.streams.filter((s) => s.codecType === 'audio');
    const audioMaps: string[] = [];
    const audioCodecArgs: string[] = [];
    const varStreamMapParts: string[] = [];

    if (vStream) {
      audioMaps.push('-map', `0:${vStream.index}`);
    }

    if (audioStreams.length > 0) {
      // Setup var_stream_map for video referencing audio group
      varStreamMapParts.push('v:0,agroup:audio');

      audioStreams.forEach((aStream, idx) => {
        audioMaps.push('-map', `0:${aStream.index}`);
        const isAac = (aStream.codecName || '').toLowerCase() === 'aac';
        if (isAac && canCopyVideo) {
          // Can stream copy AAC
          audioCodecArgs.push(`-c:a:${idx}`, 'copy');
        } else {
          // Re-encode other audio codecs to AAC 256k stereo (5.1 downmix default)
          audioCodecArgs.push(`-c:a:${idx}`, 'aac', `-ac:${idx}`, '2', `-b:a:${idx}`, '256k');
        }

        const lang = aStream.language || 'und';
        const rawName = formatLanguageName(lang);
        const isDefault = idx === 0 ? 'YES' : 'NO';
        varStreamMapParts.push(`a:${idx},agroup:audio,language:${lang},name:${rawName},default:${isDefault}`);
      });
    } else {
      varStreamMapParts.push('v:0');
    }

    const varStreamMap = varStreamMapParts.join(' ');
    const masterPlaylistPath = path.join(absOutputDir, 'master.m3u8');

    const hlsArgs: string[] = [
      '-y',
      '-nostdin',
      '-progress',
      'pipe:1',
      '-nostats',
      '-i',
      absInput,
      ...audioMaps,
      ...videoArgs,
      ...audioCodecArgs,
      '-movflags',
      '+frag_keyframe+empty_moov+default_base_moof',
      '-f',
      'hls',
      '-hls_time',
      '4',
      '-hls_playlist_type',
      'event',
      '-hls_segment_type',
      'fmp4',
      '-hls_flags',
      'independent_segments',
      '-master_pl_name',
      'master.m3u8',
      '-var_stream_map',
      varStreamMap,
      path.join(absOutputDir, 'stream_%v.m3u8'),
    ];

    logger.info('[HlsPackager] Starting FFmpeg HLS packaging', {
      jobId,
      canCopyVideo,
      audioTracksCount: audioStreams.length,
      subtitleTracksCount: extractedSubtitles.length,
    });

    let initialSegmentsTriggered = false;
    const durationSeconds = analysis.duration || 1;

    // Check for initial segment readiness periodically
    const startupInterval = setInterval(() => {
      if (!initialSegmentsTriggered) {
        const initVideo = path.join(absOutputDir, 'init_0.mp4');
        const seg0 = path.join(absOutputDir, 'stream_00.m4s');
        if (fs.existsSync(initVideo) && fs.existsSync(seg0)) {
          initialSegmentsTriggered = true;
          logger.info('[HlsPackager] Initial fMP4 segments ready for playback', { jobId });
          if (onInitialSegmentsReady) {
            onInitialSegmentsReady();
          }
        }
      }
    }, 250);

    return new Promise<HlsPackageResult>((resolve, reject) => {
      const ffmpeg = spawn(getFfmpegPath(), hlsArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.activeProcesses.set(jobId, ffmpeg);

      let lastEmittedPercent = -1;
      let currentSpeed = '1.0x';

      ffmpeg.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        const lines = text.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('out_time_ms=')) {
            const msStr = trimmed.split('=')[1]?.trim();
            if (msStr && durationSeconds > 0) {
              const currentOutTimeSec = parseInt(msStr, 10) / 1000000;
              const pct = Math.min(99, Math.max(1, Math.round((currentOutTimeSec / durationSeconds) * 100)));

              let etaSec: number | undefined = undefined;
              const speedNum = parseFloat(currentSpeed.replace('x', ''));
              if (speedNum > 0 && durationSeconds > currentOutTimeSec) {
                etaSec = Math.round((durationSeconds - currentOutTimeSec) / speedNum);
              }

              if (pct !== lastEmittedPercent) {
                lastEmittedPercent = pct;
                if (onProgress) {
                  onProgress(pct, currentSpeed, etaSec, 'Packaging multi-audio HLS...');
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
        clearInterval(startupInterval);
        this.activeProcesses.delete(jobId);
        reject(new Error(`FFmpeg HLS packaging failed to start: ${err.message}`));
      });

      ffmpeg.on('close', async (code) => {
        clearInterval(startupInterval);
        this.activeProcesses.delete(jobId);

        if (code !== 0 || !fs.existsSync(masterPlaylistPath)) {
          const errSnippet = stderrOutput.substring(stderrOutput.length - 600);
          return reject(new Error(`FFmpeg HLS packaging failed with exit code ${code}: ${errSnippet || 'Unknown'}`));
        }

        try {
          // 4. Generate Subtitle Playlists and format Master Playlist
          const formattedMaster = await this.finalizeMasterPlaylist(
            absOutputDir,
            analysis,
            extractedSubtitles
          );

          fs.writeFileSync(masterPlaylistPath, formattedMaster, 'utf-8');

          // Compute total size of all generated HLS artifacts
          let totalSizeBytes = 0;
          const files = fs.readdirSync(absOutputDir);
          for (const f of files) {
            const fStat = fs.statSync(path.join(absOutputDir, f));
            totalSizeBytes += fStat.size;
          }

          const trackManifest = buildTrackManifest(analysis, {
            hlsMasterUrl: 'master.m3u8',
            isHls: true,
            subtitleUrls: subtitleManifestUrls,
          });

          const executionTimeMs = Date.now() - startTimeMs;
          if (onProgress) {
            onProgress(100, currentSpeed, 0, 'Ready');
          }

          logger.info('[HlsPackager] HLS packaging completed successfully', {
            jobId,
            executionTimeMs,
            totalSizeBytes,
            audioTracksCount: trackManifest.audioTracks.length,
            subtitleTracksCount: trackManifest.subtitleTracks.length,
          });

          resolve({
            outputDir: absOutputDir,
            masterPlaylistPath,
            masterPlaylistContent: formattedMaster,
            trackManifest,
            executionTimeMs,
            totalSizeBytes,
          });
        } catch (postErr: any) {
          reject(new Error(`Post-processing HLS master playlist failed: ${postErr.message}`));
        }
      });
    });
  }

  /**
   * Post-processes master.m3u8 to inject human-friendly audio track names
   * and #EXT-X-MEDIA:TYPE=SUBTITLES with companion subtitle playlists.
   */
  private async finalizeMasterPlaylist(
    outputDir: string,
    analysis: MediaAnalysis,
    subtitles: Array<{ streamIndex: number; filename: string; vttPath: string; subTrack: SubtitleTrackInfo }>
  ): Promise<string> {
    const masterPath = path.join(outputDir, 'master.m3u8');
    let rawContent = fs.existsSync(masterPath) ? fs.readFileSync(masterPath, 'utf-8') : '';

    const lines = rawContent.split('\n');
    const audioStreams = analysis.streams.filter((s) => s.codecType === 'audio');
    const processedLines: string[] = [];

    let audioIndex = 0;
    const subtitleGroup = 'subs';

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Format audio tags with friendly names
      if (line.startsWith('#EXT-X-MEDIA:TYPE=AUDIO')) {
        const aStream = audioStreams[audioIndex];
        if (aStream) {
          const lang = aStream.language || 'und';
          const langName = formatLanguageName(lang);
          let title = aStream.title || langName;
          if (aStream.channels === 6 && !title.includes('5.1')) title += ' (5.1)';
          if (aStream.channels === 1 && !title.includes('Mono')) title += ' (Mono)';

          // Replace NAME="audio_X" with title
          line = line.replace(/NAME="[^"]+"/, `NAME="${title}"`);
          // Ensure correct LANGUAGE attribute
          if (!line.includes('LANGUAGE=')) {
            line = line.replace('DEFAULT=', `LANGUAGE="${lang}",DEFAULT=`);
          }
        }
        audioIndex++;
      }

      // Attach SUBTITLES="subs" to #EXT-X-STREAM-INF if subtitles exist
      if (line.startsWith('#EXT-X-STREAM-INF:') && subtitles.length > 0) {
        if (!line.includes('SUBTITLES=')) {
          line += `,SUBTITLES="${subtitleGroup}"`;
        }
      }

      processedLines.push(line);
    }

    // Insert subtitle tracks if any were extracted
    if (subtitles.length > 0) {
      const subLines: string[] = [];

      for (let sIdx = 0; sIdx < subtitles.length; sIdx++) {
        const sub = subtitles[sIdx];
        const subPlFilename = `sub_${sub.streamIndex}.m3u8`;
        const subPlPath = path.join(outputDir, subPlFilename);

        // Write VTT playlist
        const vttPlaylistContent = [
          '#EXTM3U',
          '#EXT-X-VERSION:3',
          `#EXT-X-TARGETDURATION:${Math.ceil(analysis.duration || 10)}`,
          '#EXT-X-MEDIA-SEQUENCE:0',
          `#EXTINF:${(analysis.duration || 5).toFixed(3)},`,
          sub.filename,
          '#EXT-X-ENDLIST',
          '',
        ].join('\n');

        fs.writeFileSync(subPlPath, vttPlaylistContent, 'utf-8');

        const isDefault = sIdx === 0 && sub.subTrack.isDefault ? 'YES' : 'NO';
        const isForced = sub.subTrack.isForced ? 'YES' : 'NO';
        const autoSelect = isDefault;

        subLines.push(
          `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="${subtitleGroup}",NAME="${sub.subTrack.title}",DEFAULT=${isDefault},AUTOSELECT=${autoSelect},FORCED=${isForced},LANGUAGE="${sub.subTrack.language}",URI="${subPlFilename}"`
        );
      }

      // Find index right after #EXT-X-VERSION or audio media definitions
      let insertIdx = processedLines.findIndex((l) => l.startsWith('#EXT-X-STREAM-INF'));
      if (insertIdx === -1) insertIdx = processedLines.length;

      processedLines.splice(insertIdx, 0, ...subLines);
    }

    // Fallback: If FFmpeg did not output an #EXT-X-STREAM-INF line (e.g. older versions when copying video),
    // ensure the primary video rendition is included in master.m3u8
    const hasStreamInf = processedLines.some((l) => l.startsWith('#EXT-X-STREAM-INF'));
    if (!hasStreamInf && fs.existsSync(path.join(outputDir, 'stream_0.m3u8'))) {
      const vStream = analysis.streams.find((s) => s.codecType === 'video');
      const vWidth = vStream?.width || analysis.width || 1920;
      const vHeight = vStream?.height || analysis.height || 1080;
      const vBitrate = vStream?.bitrate || (analysis.sizeBytes && analysis.duration ? Math.round((analysis.sizeBytes * 8) / analysis.duration) : 2500000);
      const subAttr = subtitles.length > 0 ? `,SUBTITLES="${subtitleGroup}"` : '';
      const audioAttr = audioStreams.length > 0 ? ',AUDIO="group_audio"' : '';
      processedLines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${Math.round(vBitrate * 1.2)},AVERAGE-BANDWIDTH=${vBitrate},RESOLUTION=${vWidth}x${vHeight},CODECS="avc1.640028,mp4a.40.2"${audioAttr}${subAttr}`,
        'stream_0.m3u8'
      );
    }

    // Switch stream playlists from EVENT to VOD now that packaging is complete
    try {
      const plFiles = fs.readdirSync(outputDir).filter((f) => f.startsWith('stream_') && f.endsWith('.m3u8'));
      for (const plFile of plFiles) {
        const plPath = path.join(outputDir, plFile);
        let plContent = fs.readFileSync(plPath, 'utf-8');
        plContent = plContent.replace('#EXT-X-PLAYLIST-TYPE:EVENT', '#EXT-X-PLAYLIST-TYPE:VOD');
        if (!plContent.includes('#EXT-X-ENDLIST')) {
          plContent = plContent.trim() + '\n#EXT-X-ENDLIST\n';
        }
        fs.writeFileSync(plPath, plContent, 'utf-8');
      }
    } catch (e: any) {
      logger.warn('[HlsPackager] Error converting stream playlists to VOD', { error: e.message });
    }

    return processedLines.filter(Boolean).join('\n') + '\n';
  }

  /**
   * Generates lower renditions (720p ~3.5M, 480p ~1.2M) in background with low CPU priority.
   */
  async generateAdaptiveRenditionsInBackground(
    jobId: string,
    inputPath: string,
    outputDir: string,
    analysis: MediaAnalysis,
    onRenditionReady?: (rendition: { name: string; resolution: string; bandwidth: number; url: string }) => void
  ): Promise<void> {
    const vStream = analysis.streams.find((s) => s.codecType === 'video');
    const srcW = vStream?.width || analysis.width || 1920;
    const srcH = vStream?.height || analysis.height || 1080;

    const targets: Array<{
      label: string;
      maxW: number;
      maxH: number;
      bitrate: string;
      bandwidth: number;
      avgBandwidth: number;
    }> = [
      { label: '720p', maxW: 1280, maxH: 720, bitrate: '3500k', bandwidth: 4200000, avgBandwidth: 3500000 },
      { label: '480p', maxW: 854, maxH: 480, bitrate: '1200k', bandwidth: 1500000, avgBandwidth: 1200000 },
    ];

    // Filter out renditions at or above source resolution
    const renditionsToBuild = targets.filter((t) => srcW > t.maxW || srcH > t.maxH);
    if (renditionsToBuild.length === 0) {
      return;
    }

    const masterPath = path.join(outputDir, 'master.m3u8');

    for (const r of renditionsToBuild) {
      if (!this.activeProcesses.has(jobId) && !this.activeProcesses.has(`${jobId}_${r.label}`)) {
        // Check if job was cancelled
        if (this.cancelledJobs && this.cancelledJobs.has(jobId)) break;
      }

      const calcW = Math.min(r.maxW, srcW);
      const calcH = Math.round((srcH * calcW) / srcW);
      const targetW = calcW % 2 === 0 ? calcW : calcW - 1;
      const targetH = calcH % 2 === 0 ? calcH : calcH - 1;

      const streamM3u8 = `stream_${r.label}.m3u8`;
      const streamPath = path.join(outputDir, streamM3u8);

      const ffmpegArgs = [
        '-y',
        '-nostdin',
        '-i', inputPath,
        '-vf', `scale='min(${targetW},iw)':min'(${targetH},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-b:v', r.bitrate,
        '-maxrate', `${Math.round(parseInt(r.bitrate, 10) * 1.3)}k`,
        '-bufsize', `${Math.round(parseInt(r.bitrate, 10) * 2.0)}k`,
        '-profile:v', 'high',
        '-level', '4.1',
        '-an',
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_playlist_type', 'vod',
        '-hls_segment_type', 'fmp4',
        '-hls_flags', 'independent_segments',
        '-hls_segment_filename', path.join(outputDir, `stream_${r.label}_%03d.m4s`),
        streamPath,
      ];

      try {
        const proc = spawn(getFfmpegPath(), ffmpegArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
        const procKey = `${jobId}_${r.label}`;
        this.activeProcesses.set(procKey, proc);

        await new Promise<void>((resolve, reject) => {
          proc.on('close', (code) => {
            this.activeProcesses.delete(procKey);
            if (code === 0 && fs.existsSync(streamPath)) resolve();
            else reject(new Error(`FFmpeg lower rendition ${r.label} failed with code ${code}`));
          });
          proc.on('error', (err) => {
            this.activeProcesses.delete(procKey);
            reject(err);
          });
        });

        // Inject stream entry into master.m3u8 if not already present
        if (fs.existsSync(masterPath)) {
          let masterContent = fs.readFileSync(masterPath, 'utf-8');
          if (!masterContent.includes(streamM3u8)) {
            const streamEntry = `\n#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},AVERAGE-BANDWIDTH=${r.avgBandwidth},RESOLUTION=${targetW}x${targetH},CODECS="avc1.640028,mp4a.40.2",AUDIO="group_audio",SUBTITLES="subs"\n${streamM3u8}\n`;
            masterContent = masterContent.trim() + streamEntry;
            fs.writeFileSync(masterPath, masterContent, 'utf-8');
          }
        }

        logger.info(`[HlsPackager] Background rendition ${r.label} completed (${targetW}x${targetH})`, { jobId });
        if (onRenditionReady) {
          onRenditionReady({
            name: r.label,
            resolution: `${targetW}x${targetH}`,
            bandwidth: r.bandwidth,
            url: streamM3u8,
          });
        }
      } catch (renditionErr: any) {
        logger.warn(`[HlsPackager] Background rendition ${r.label} skipped or failed`, { error: renditionErr.message });
      }
    }
  }

  private cancelledJobs: Set<string> = new Set();

  /**
   * Cancels an active HLS packaging job.
   */
  cancelJob(jobId: string): boolean {
    this.cancelledJobs.add(jobId);
    let cancelled = false;
    for (const [key, proc] of this.activeProcesses.entries()) {
      if (key === jobId || key.startsWith(`${jobId}_`)) {
        try {
          proc.kill('SIGKILL');
          cancelled = true;
        } catch {}
        this.activeProcesses.delete(key);
      }
    }
    return cancelled;
  }

  /**
   * Cancels all active HLS packaging jobs on shutdown or sweep.
   */
  cancelAllJobs(): number {
    let count = 0;
    for (const [jobId, proc] of this.activeProcesses.entries()) {
      try {
        proc.kill('SIGKILL');
        count++;
      } catch {}
      this.activeProcesses.delete(jobId);
    }
    return count;
  }
}

export const hlsPackager = new HlsPackager();
