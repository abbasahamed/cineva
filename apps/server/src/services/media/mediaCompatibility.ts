import { MediaAnalysis, analyzeMediaFile } from './mediaAnalyzer.js';
import path from 'path';
import fs from 'fs';

export type MediaCompatibilityAction = 'DIRECT_PLAY' | 'REMUX' | 'AUDIO_TRANSCODE_VIDEO_COPY' | 'TRANSCODE';

export interface CompatibilityDecision {
  action: MediaCompatibilityAction;
  reason: string;
  targetMimeType: string;
  targetExtension: string;
  selectedAudioStreamIndex?: number;
  isAudioCompatible?: boolean;
}

const BROWSER_DIRECT_VIDEO_CODECS = new Set(['h264', 'avc1', 'vp8', 'vp9', 'av1']);
const BROWSER_DIRECT_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis']);

/**
 * Checks whether an audio stream is standard LC-AAC or MP3 compatible with native browser MP4 playback.
 * HE-AAC (profile 5 / SBR) in MP4 containers causes browser audio decoding errors and requires transcoding to LC-AAC.
 */
function isLcAudioStream(s: any): boolean {
  if (s.codecType !== 'audio') return false;
  const name = (s.codecName || '').toLowerCase();
  const prof = (s.profile || '').toLowerCase();
  if (name === 'mp3') return true;
  if (name === 'aac') {
    if (prof.includes('he-aac') || prof.includes('sbr')) return false;
    return true;
  }
  return false;
}

/**
 * Determines whether an uploaded media file can be directly played in browsers,
 * requires fast container remuxing, requires video copying with audio transcoding,
 * or requires full video/audio transcoding.
 */
export function evaluateMediaCompatibility(
  analysis: MediaAnalysis,
  originalFilename: string
): CompatibilityDecision {
  const ext = path.extname(originalFilename).toLowerCase();
  const formatName = (analysis.container || analysis.formatName || '').toLowerCase();
  const vCodec = (analysis.videoCodec || '').toLowerCase();
  const aCodec = (analysis.audioCodec || '').toLowerCase();
  const pixFmt = (analysis.pixFmt || '').toLowerCase();

  const isMP4Container = formatName.includes('mp4') || formatName.includes('quicktime') || formatName.includes('isom') || ext === '.mp4';
  const isWebMContainer = formatName.includes('webm') || ext === '.webm';

  const isH264Video = vCodec === 'h264' || vCodec === 'avc1';
  const isStandardPixelFmt = !pixFmt || pixFmt === 'yuv420p';

  // Find standard LC-AAC or MP3 audio stream for zero-encoding remux
  const compatibleAudioStream = analysis.streams.find(isLcAudioStream);
  const primaryAudioIsLc = isLcAudioStream({ codecType: 'audio', codecName: aCodec, profile: analysis.streams.find(s => s.codecType === 'audio')?.profile });
  const isAacOrMp3Audio = !analysis.hasAudio || primaryAudioIsLc || !!compatibleAudioStream;

  // 1. Direct Play Check for MP4 (H.264 + AAC/MP3, yuv420p)
  if (isMP4Container && isH264Video && primaryAudioIsLc && isStandardPixelFmt) {
    return {
      action: 'DIRECT_PLAY',
      reason: 'Media is already a web-compatible H.264/AAC MP4 container.',
      targetMimeType: 'video/mp4',
      targetExtension: '.mp4',
    };
  }

  // 2. Direct Play Check for WebM (VP8/VP9/AV1 + Opus/Vorbis)
  if (isWebMContainer && (vCodec === 'vp8' || vCodec === 'vp9' || vCodec === 'av1') && (!analysis.hasAudio || aCodec === 'opus' || aCodec === 'vorbis')) {
    return {
      action: 'DIRECT_PLAY',
      reason: 'Media is already a web-compatible WebM container with VP8/VP9/AV1 video.',
      targetMimeType: 'video/webm',
      targetExtension: '.webm',
    };
  }

  // 3. Fast Remux Check: H.264 video + existing compatible LC-AAC/MP3 audio stream inside non-MP4 container (e.g. MKV or MOV)
  if (isH264Video && isStandardPixelFmt && (isAacOrMp3Audio || !analysis.hasAudio)) {
    const selectedIdx = compatibleAudioStream ? compatibleAudioStream.index : undefined;
    return {
      action: 'REMUX',
      reason: selectedIdx !== undefined
        ? `H.264 video and track #${selectedIdx} (AAC-LC) are browser-compatible. Stream copying both (-c:v copy -c:a copy) into MP4.`
        : 'Media codecs (H.264/AAC) are browser-compatible, but container requires fast remuxing into MP4.',
      targetMimeType: 'video/mp4',
      targetExtension: '.mp4',
      selectedAudioStreamIndex: selectedIdx,
      isAudioCompatible: true,
    };
  }

  // 4. Video Copy + Audio Transcode Check: H.264 video is compatible, but audio (AC3, E-AC3, HE-AAC, DTS) requires transcoding to LC-AAC
  if (isH264Video && isStandardPixelFmt) {
    return {
      action: 'AUDIO_TRANSCODE_VIDEO_COPY',
      reason: `H.264 video stream is browser-compatible. Copying video stream (-c:v copy) and re-encoding audio (${aCodec || 'unsupported'}) to AAC-LC for fast processing.`,
      targetMimeType: 'video/mp4',
      targetExtension: '.mp4',
      isAudioCompatible: false,
    };
  }

  // 5. Full Transcode Required (e.g. HEVC/H.265, AV1, 10-bit color, MKV with unsupported video codec)
  let transcodeReason = 'Media contains non-standard video codecs or container.';
  if (vCodec && !BROWSER_DIRECT_VIDEO_CODECS.has(vCodec)) {
    transcodeReason = `Video codec "${vCodec}" is unsupported natively by HTML5 browsers. Transcoding to H.264 is required.`;
  } else if (pixFmt && pixFmt !== 'yuv420p') {
    transcodeReason = `Pixel format "${pixFmt}" requires conversion to 8-bit yuv420p for browser compatibility.`;
  }

  const selectedIdx = compatibleAudioStream ? compatibleAudioStream.index : undefined;

  return {
    action: 'TRANSCODE',
    reason: transcodeReason,
    targetMimeType: 'video/mp4',
    targetExtension: '.mp4',
    selectedAudioStreamIndex: selectedIdx,
    isAudioCompatible: isAacOrMp3Audio,
  };
}

/**
 * Post-processing validation step per Section 17.
 * Validates generated playback MP4 file before marking Media record READY.
 */
export async function validatePlaybackFile(filePath: string): Promise<MediaAnalysis> {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Generated playback file does not exist: ${absPath}`);
  }

  const stat = fs.statSync(absPath);
  if (stat.size === 0) {
    throw new Error(`Generated playback file is 0 bytes: ${absPath}`);
  }

  const analysis = await analyzeMediaFile(absPath);

  if (analysis.duration <= 0) {
    throw new Error(`Generated playback file has invalid duration: ${analysis.duration}`);
  }

  if (!analysis.hasVideo) {
    throw new Error(`Generated playback file has no video stream`);
  }

  const vCodec = (analysis.videoCodec || '').toLowerCase();
  if (vCodec !== 'h264' && vCodec !== 'avc1') {
    throw new Error(`Generated playback video codec "${vCodec}" is not browser compatible (h264 required)`);
  }

  if (analysis.pixFmt && analysis.pixFmt !== 'yuv420p') {
    throw new Error(`Generated playback pixel format "${analysis.pixFmt}" is not 8-bit yuv420p`);
  }

  if (!analysis.hasAudio) {
    throw new Error(`Generated playback file has no audio stream`);
  }

  const aCodec = (analysis.audioCodec || '').toLowerCase();
  if (aCodec !== 'aac' && aCodec !== 'mp3') {
    throw new Error(`Generated playback audio codec "${aCodec}" is not browser compatible (aac required)`);
  }

  return analysis;
}
