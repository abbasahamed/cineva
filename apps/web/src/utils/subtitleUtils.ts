/**
 * Converts SubRip (.srt) subtitle text to standard WebVTT (.vtt) format.
 * - Normalizes newlines
 * - Converts comma millisecond separators to dot (00:01:23,456 -> 00:01:23.456)
 * - Prepends 'WEBVTT\n\n' header if missing
 */
export function srtToVtt(content: string): string {
  if (!content) return 'WEBVTT\n\n';
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  // If already WebVTT format, return as is
  if (normalized.startsWith('WEBVTT')) {
    return normalized;
  }

  // Replace comma with period in timestamp intervals: 00:00:00,000 --> 00:00:00,000
  let converted = normalized.replace(
    /(\d{1,2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2'
  );

  // Position cue at line:84% so subtitles stay comfortably visible when video is zoomed to fill
  converted = converted.replace(
    /(\d{1,2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{1,2}:\d{2}:\d{2}\.\d{3})(?!.*line:)/g,
    '$1 line:84%'
  );

  return `WEBVTT\n\n${converted}`;
}
