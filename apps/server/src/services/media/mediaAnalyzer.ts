import { getFfprobePath } from './binaryResolver.js';
import { execFile } from 'child_process';
import util from 'util';
import path from 'path';

const execFilePromise = util.promisify(execFile);

export interface MediaStreamInfo {
  index: number;
  codecName: string;
  codecType: 'video' | 'audio' | 'subtitle' | 'other';
  width?: number;
  height?: number;
  pixFmt?: string;
  bitrate?: number;
  channels?: number;
  channelLayout?: string;
  sampleRate?: number;
  profile?: string;
  language?: string;
  title?: string;
  isDefault?: boolean;
  isForced?: boolean;
}

export interface MediaAnalysis {
  formatName: string;
  container?: string;
  duration: number;
  sizeBytes: number;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  pixFmt: string | null;
  hasVideo: boolean;
  hasAudio: boolean;
  videoStreamsCount: number;
  audioStreamsCount: number;
  streams: MediaStreamInfo[];
}

/**
 * Analyzes a local media file using ffprobe.
 * Spawns ffprobe safely with array arguments to prevent shell injection.
 */
export async function analyzeMediaFile(filePath: string): Promise<MediaAnalysis> {
  const absPath = path.resolve(filePath);

  const args = [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    absPath,
  ];

  const { stdout } = await execFilePromise(getFfprobePath(), args, {
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
  });

  const parsed = JSON.parse(stdout);
  const format = parsed.format || {};
  const rawStreams: any[] = parsed.streams || [];

  const streams: MediaStreamInfo[] = rawStreams.map((s) => {
    const tags = s.tags || {};
    const disposition = s.disposition || {};
    const language = (tags.language || tags.LANGUAGE || '').toLowerCase().trim();
    const title = tags.title || tags.TITLE || undefined;
    const isDefault = disposition.default === 1;
    const isForced = disposition.forced === 1;

    return {
      index: s.index,
      codecName: (s.codec_name || '').toLowerCase(),
      codecType: s.codec_type === 'video' ? 'video' : s.codec_type === 'audio' ? 'audio' : s.codec_type === 'subtitle' ? 'subtitle' : 'other',
      width: typeof s.width === 'number' ? s.width : undefined,
      height: typeof s.height === 'number' ? s.height : undefined,
      pixFmt: s.pix_fmt || undefined,
      bitrate: s.bit_rate ? parseInt(s.bit_rate, 10) : undefined,
      channels: s.channels ? parseInt(s.channels, 10) : undefined,
      channelLayout: s.channel_layout || undefined,
      sampleRate: s.sample_rate ? parseInt(s.sample_rate, 10) : undefined,
      profile: s.profile || undefined,
      language: language || undefined,
      title,
      isDefault,
      isForced,
    };
  });

  const videoStream = streams.find((s) => s.codecType === 'video');
  const audioStream = streams.find((s) => s.codecType === 'audio');

  const videoStreamsCount = streams.filter((s) => s.codecType === 'video').length;
  const audioStreamsCount = streams.filter((s) => s.codecType === 'audio').length;

  const duration = parseFloat(format.duration || '0');
  const sizeBytes = parseInt(format.size || '0', 10);

  return {
    formatName: (format.format_name || '').toLowerCase(),
    duration: isNaN(duration) ? 0 : duration,
    sizeBytes: isNaN(sizeBytes) ? 0 : sizeBytes,
    videoCodec: videoStream ? videoStream.codecName : null,
    audioCodec: audioStream ? audioStream.codecName : null,
    width: videoStream?.width || null,
    height: videoStream?.height || null,
    pixFmt: videoStream?.pixFmt || null,
    hasVideo: !!videoStream,
    hasAudio: !!audioStream,
    videoStreamsCount,
    audioStreamsCount,
    streams,
  };
}
