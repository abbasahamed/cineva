import {
  TrackManifest,
  VideoTrackInfo,
  AudioTrackInfo,
  SubtitleTrackInfo,
} from '@cineva/shared';
import { MediaAnalysis, MediaStreamInfo } from './mediaAnalyzer.js';

const TEXT_SUBTITLE_CODECS = new Set([
  'subrip',
  'srt',
  'ass',
  'ssa',
  'mov_text',
  'webvtt',
  'text',
]);

const IMAGE_SUBTITLE_CODECS = new Set([
  'hdmv_pgs_subtitle',
  'pgs',
  'dvd_subtitle',
  'dvdsub',
  'dvb_subtitle',
  'dvbsub',
  'xsub',
  'vobsub',
]);

let displayNamesInstance: Intl.DisplayNames | null = null;

function getDisplayNames(): Intl.DisplayNames {
  if (!displayNamesInstance) {
    try {
      displayNamesInstance = new Intl.DisplayNames(['en'], { type: 'language' });
    } catch {
      // Fallback if environment lacks locale data
    }
  }
  return displayNamesInstance!;
}

/**
  * Resolves a language code (ISO 639-1 or 639-2) to a human-readable display name.
  * e.g. 'eng' -> 'English', 'hin' -> 'Hindi', 'tel' -> 'Telugu'.
  */
export function formatLanguageName(code?: string): string {
  if (!code) return 'Unknown';
  const cleanCode = code.toLowerCase().trim();
  try {
    const dn = getDisplayNames();
    if (dn) {
      const name = dn.of(cleanCode);
      if (name && name !== cleanCode) {
        return name;
      }
    }
  } catch {
    // Ignore display resolution error
  }

  // Fallbacks for standard 3-letter codes
  const COMMON_FALLBACKS: Record<string, string> = {
    eng: 'English',
    hin: 'Hindi',
    tel: 'Telugu',
    tam: 'Tamil',
    kan: 'Kannada',
    mal: 'Malayalam',
    ben: 'Bengali',
    spa: 'Spanish',
    fra: 'French',
    deu: 'German',
    ger: 'German',
    ita: 'Italian',
    jpn: 'Japanese',
    kor: 'Korean',
    zho: 'Chinese',
    chi: 'Chinese',
    rus: 'Russian',
    por: 'Portuguese',
    ara: 'Arabic',
  };

  return COMMON_FALLBACKS[cleanCode] || cleanCode.toUpperCase();
}

/**
 * Builds the canonical TrackManifest from MediaAnalysis.
 */
export function buildTrackManifest(
  analysis: MediaAnalysis,
  options?: {
    hlsMasterUrl?: string;
    mp4FallbackUrl?: string;
    isHls?: boolean;
    subtitleUrls?: Record<number, string>;
  }
): TrackManifest {
  const videoStreams = analysis.streams.filter((s) => s.codecType === 'video');
  const audioStreams = analysis.streams.filter((s) => s.codecType === 'audio');
  const subtitleStreams = analysis.streams.filter((s) => s.codecType === 'subtitle');

  const videoTracks: VideoTrackInfo[] = videoStreams.map((s, idx) => ({
    index: idx,
    codec: s.codecName,
    width: s.width,
    height: s.height,
    bitrate: s.bitrate,
    profile: s.profile,
  }));

  const audioTracks: AudioTrackInfo[] = audioStreams.map((s, idx) => {
    const lang = s.language || 'und';
    const langName = formatLanguageName(lang);
    
    let channelDesc = '';
    if (s.channels === 6) {
      channelDesc = ' (5.1)';
    } else if (s.channels === 8) {
      channelDesc = ' (7.1)';
    } else if (s.channels === 1) {
      channelDesc = ' (Mono)';
    }

    let title = s.title;
    if (!title) {
      title = lang !== 'und' ? `${langName}${channelDesc}` : `Audio Track ${idx + 1}${channelDesc}`;
    }

    return {
      index: idx,
      streamIndex: s.index,
      language: lang,
      title,
      codec: s.codecName,
      channels: s.channels || 2,
      channelLayout: s.channelLayout,
      bitrate: s.bitrate,
      isDefault: idx === 0 ? (s.isDefault !== false) : !!s.isDefault,
    };
  });

  const subtitleTracks: SubtitleTrackInfo[] = subtitleStreams.map((s, idx) => {
    const codec = s.codecName.toLowerCase();
    const isImage = IMAGE_SUBTITLE_CODECS.has(codec);
    const isText = TEXT_SUBTITLE_CODECS.has(codec) || (!isImage && !codec.includes('dvd') && !codec.includes('pgs'));

    const lang = s.language || 'und';
    const langName = formatLanguageName(lang);
    let title = s.title;
    if (!title) {
      title = lang !== 'und' ? langName : `Subtitle Track ${idx + 1}`;
    }

    const supported = isText && !isImage;
    const unsupportedReason = supported
      ? undefined
      : `Image-based subtitles (${codec.toUpperCase()}) cannot be rendered natively without OCR.`;

    const url = options?.subtitleUrls ? options.subtitleUrls[s.index] : undefined;

    return {
      index: idx,
      streamIndex: s.index,
      language: lang,
      title,
      codec: s.codecName,
      isForced: !!s.isForced,
      isDefault: !!s.isDefault,
      supported,
      unsupportedReason,
      url,
    };
  });

  return {
    formatName: analysis.formatName,
    duration: analysis.duration,
    sizeBytes: analysis.sizeBytes,
    videoTracks,
    audioTracks,
    subtitleTracks,
    hlsMasterUrl: options?.hlsMasterUrl,
    mp4FallbackUrl: options?.mp4FallbackUrl,
    isHls: options?.isHls ?? true,
  };
}
