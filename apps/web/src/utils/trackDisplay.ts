/**
 * Utilities for formatting audio and subtitle track labels cleanly (IINA style).
 */

export interface AudioOption {
  id: number;
  label: string;
  language: string;
  channels?: number;
  isDefault: boolean;
  supported: boolean;
  unsupportedReason?: string;
}

export interface SubtitleOption {
  id: number; // Index in subtitle list
  streamIndex: number;
  label: string;
  language: string;
  codec: string;
  isDefault: boolean;
  supported: boolean;
  unsupportedReason?: string;
  url?: string;
}

/**
 * Resolves a 2 or 3-letter ISO language code to an English display name
 * using standard Intl.DisplayNames, with known fallbacks.
 */
export function formatLanguageDisplay(langCode?: string): string {
  if (!langCode || langCode === 'und' || langCode === 'unknown') return '';

  const clean = langCode.trim().toLowerCase();

  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    const name = dn.of(clean);
    if (name && name.toLowerCase() !== clean) {
      return name;
    }
  } catch {
    // quiet fallback
  }

  const KNOWN_MAP: Record<string, string> = {
    hin: 'Hindi',
    tel: 'Telugu',
    eng: 'English',
    spa: 'Spanish',
    fra: 'French',
    fre: 'French',
    deu: 'German',
    ger: 'German',
    ita: 'Italian',
    jpn: 'Japanese',
    kor: 'Korean',
    tam: 'Tamil',
    mal: 'Malayalam',
    kan: 'Kannada',
    mar: 'Marathi',
    pan: 'Punjabi',
    ben: 'Bengali',
    rus: 'Russian',
    por: 'Portuguese',
    zho: 'Chinese',
    chi: 'Chinese',
    ara: 'Arabic',
    hi: 'Hindi',
    te: 'Telugu',
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    ja: 'Japanese',
    ko: 'Korean',
    ta: 'Tamil',
    ml: 'Malayalam',
    kn: 'Kannada',
    mr: 'Marathi',
    pa: 'Punjabi',
    bn: 'Bengali',
    ru: 'Russian',
    pt: 'Portuguese',
    zh: 'Chinese',
    ar: 'Arabic',
  };

  return KNOWN_MAP[clean] || clean.toUpperCase();
}

/**
 * Builds clean audio track options from Hls audio tracks and/or manifest data.
 * - Shows clean language names using Intl.DisplayNames (Hindi, Telugu, English).
 * - Adds channels in brackets when more than stereo (e.g. " (5.1)").
 * - DOES NOT show the file's raw title string (like "1Vegamovies.tw") unless language is unknown.
 * - Deduplicates shared language tracks by adding " (2)".
 */
export function formatAudioTrackList(
  hlsTracks: Array<{ id?: number; lang?: string; name?: string; channels?: number }>,
  manifestTracks?: Array<{
    streamIndex: number;
    language: string;
    title: string;
    channels: number;
    isDefault: boolean;
    supported?: boolean;
    unsupportedReason?: string;
  }>
): AudioOption[] {
  const count = Math.max(hlsTracks.length, manifestTracks?.length || 0);
  if (count === 0) return [];

  const rawItems: Array<{
    id: number;
    lang: string;
    channels?: number;
    title?: string;
    isDefault: boolean;
    supported: boolean;
    unsupportedReason?: string;
  }> = [];

  for (let i = 0; i < count; i++) {
    const m = manifestTracks?.[i];
    const h = hlsTracks[i];
    const lang = m?.language || h?.lang || '';
    const channels = m?.channels || h?.channels;
    const title = m?.title || h?.name || '';
    const isDefault = m?.isDefault ?? (i === 0);
    const supported = m?.supported !== false;
    const unsupportedReason = m?.unsupportedReason;

    rawItems.push({
      id: i,
      lang,
      channels,
      title,
      isDefault,
      supported,
      unsupportedReason,
    });
  }

  const nameCounts = new Map<string, number>();
  const results: AudioOption[] = [];

  for (const item of rawItems) {
    const cleanLang = formatLanguageDisplay(item.lang);
    let baseName = cleanLang;

    // DO NOT use raw file titles like "1Vegamovies.tw" unless language is completely unknown
    if (!baseName) {
      const isNoiseTitle = !item.title ||
        item.title.toLowerCase().includes('.tw') ||
        item.title.toLowerCase().includes('vegamovies') ||
        item.title.toLowerCase().includes('1vegamovies');

      baseName = !isNoiseTitle && item.title ? item.title : `Track ${item.id + 1}`;
    }

    const currentCount = (nameCounts.get(baseName) || 0) + 1;
    nameCounts.set(baseName, currentCount);

    const dupSuffix = currentCount > 1 ? ` (${currentCount})` : '';

    let channelSuffix = '';
    if (item.channels && item.channels > 2) {
      if (item.channels === 6) channelSuffix = ' (5.1)';
      else if (item.channels === 8) channelSuffix = ' (7.1)';
      else channelSuffix = ` (${item.channels} ch)`;
    }

    let label = `${baseName}${dupSuffix}${channelSuffix}`;
    if (!item.supported) {
      label += ' (unsupported)';
    }

    results.push({
      id: item.id,
      label,
      language: item.lang,
      channels: item.channels,
      isDefault: item.isDefault,
      supported: item.supported,
      unsupportedReason: item.unsupportedReason,
    });
  }

  return results;
}

/**
 * Builds clean subtitle track options from manifest data.
 * - Extracts text tracks with clean language names.
 * - Flags image-based tracks (e.g. PGS, VobSub) as disabled with honest "not supported" label.
 */
export function formatSubtitleTrackList(
  manifestTracks?: Array<{
    streamIndex: number;
    language: string;
    title: string;
    codec: string;
    isDefault: boolean;
    supported: boolean;
    unsupportedReason?: string;
    url?: string;
  }>
): SubtitleOption[] {
  if (!manifestTracks || manifestTracks.length === 0) return [];

  const nameCounts = new Map<string, number>();
  const results: SubtitleOption[] = [];

  for (let i = 0; i < manifestTracks.length; i++) {
    const t = manifestTracks[i];
    const cleanLang = formatLanguageDisplay(t.language);
    let baseName = cleanLang;

    if (!baseName) {
      baseName = t.title || `Subtitle ${i + 1}`;
    }

    const currentCount = (nameCounts.get(baseName) || 0) + 1;
    nameCounts.set(baseName, currentCount);

    const dupSuffix = currentCount > 1 ? ` (${currentCount})` : '';
    let label = `${baseName}${dupSuffix}`;

    if (!t.supported) {
      label += ` (${t.codec.toUpperCase()}) - not supported`;
    }

    results.push({
      id: i,
      streamIndex: t.streamIndex,
      label,
      language: t.language,
      codec: t.codec,
      isDefault: t.isDefault,
      supported: t.supported,
      unsupportedReason: t.unsupportedReason,
      url: t.url,
    });
  }

  return results;
}
