import React from 'react';

export interface SubtitleSettings {
  sizePercent: number; // 60 to 220, default 100
  positionOffsetPercent: number; // 0 to 70 (% of stage height), default 0
  background: 'none' | 'soft' | 'solid'; // default soft
  textColor: 'white' | 'yellow' | 'cyan'; // default white
  edge: 'outline' | 'shadow' | 'none'; // default shadow (or soft outline)
  delaySeconds: number; // -5.0 to +5.0, default 0
}

export const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
  sizePercent: 100,
  positionOffsetPercent: 0,
  background: 'none',
  textColor: 'white',
  edge: 'outline',
  delaySeconds: 0,
};

const STORAGE_KEY = 'cineva_sub_settings_v2';

// In-memory fallback if localStorage is blocked / unavailable
let memoryStorage: Record<string, string> = {};

function getStorageItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {}
  return memoryStorage[key] || null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
  } catch {}
  memoryStorage[key] = value;
}

/**
 * Clamps size between 60% and 220%.
 */
export function clampSize(size: number): number {
  if (typeof size !== 'number' || Number.isNaN(size)) return 100;
  return Math.max(60, Math.min(220, Math.round(size)));
}

/**
 * Clamps vertical position offset between 0% and 70%.
 */
export function clampPosition(pos: number): number {
  if (typeof pos !== 'number' || Number.isNaN(pos)) return 0;
  return Math.max(0, Math.min(70, Math.round(pos * 10) / 10));
}

/**
 * Clamps delay between -5.0s and +5.0s in 0.1s steps.
 */
export function clampDelay(delay: number): number {
  if (typeof delay !== 'number' || Number.isNaN(delay)) return 0;
  const rounded = Math.round(delay * 10) / 10;
  return Math.max(-5.0, Math.min(5.0, rounded));
}

/**
 * Loads subtitle settings from localStorage (per-viewer, never synced).
 * Delay always defaults to 0 on initial load / per movie.
 */
export function loadSubtitleSettings(): SubtitleSettings {
  try {
    const raw = getStorageItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SUBTITLE_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      sizePercent: typeof parsed.sizePercent === 'number' ? clampSize(parsed.sizePercent) : DEFAULT_SUBTITLE_SETTINGS.sizePercent,
      positionOffsetPercent: typeof parsed.positionOffsetPercent === 'number' ? clampPosition(parsed.positionOffsetPercent) : DEFAULT_SUBTITLE_SETTINGS.positionOffsetPercent,
      background: ['none', 'soft', 'solid'].includes(parsed.background) ? parsed.background : DEFAULT_SUBTITLE_SETTINGS.background,
      textColor: ['white', 'yellow', 'cyan'].includes(parsed.textColor) ? parsed.textColor : DEFAULT_SUBTITLE_SETTINGS.textColor,
      edge: ['outline', 'shadow', 'none'].includes(parsed.edge) ? parsed.edge : DEFAULT_SUBTITLE_SETTINGS.edge,
      delaySeconds: 0, // Delay resets per movie session
    };
  } catch {
    return { ...DEFAULT_SUBTITLE_SETTINGS };
  }
}

/**
 * Saves subtitle settings to localStorage (delay is not persisted across reloads).
 */
export function saveSubtitleSettings(settings: SubtitleSettings): void {
  try {
    const payload = {
      sizePercent: clampSize(settings.sizePercent),
      positionOffsetPercent: clampPosition(settings.positionOffsetPercent),
      background: settings.background,
      textColor: settings.textColor,
      edge: settings.edge,
    };
    setStorageItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

/**
 * Converts SubRip (SRT) format to WebVTT format.
 * Replaces comma decimal timestamps with periods and ensures WEBVTT header.
 */
export function convertSrtToVtt(srtText: string): string {
  if (!srtText) return 'WEBVTT\n\n';
  let clean = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  // If already starts with WEBVTT, return with standardized newlines
  if (clean.startsWith('WEBVTT')) {
    return clean;
  }

  // Replace SRT comma milliseconds (00:01:23,456 --> 00:01:25,789) with period (.456)
  const vttTimestampRegex = /(\d{2}:\d{2}:\d{2}),(\d{3})/g;
  clean = clean.replace(vttTimestampRegex, '$1.$2');

  return `WEBVTT\n\n${clean}`;
}

// Backward-compatible alias for existing imports
export const srtToVtt = convertSrtToVtt;

/**
 * Decodes standard HTML entities in cue text.
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Safely parses cue formatting allowing only <i>, <b>, <u>.
 * Strips script tags, evil event handlers, and anything not whitelisted to prevent XSS.
 * Returns safe React elements and text nodes.
 */
export function parseCueFormatting(rawText: string): React.ReactNode {
  if (!rawText) return null;

  // Strip script, style, and dangerous tags completely
  let sanitized = rawText
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, '')
    .replace(/<\s*(iframe|embed|object|img|svg|link|meta|base|form|input)[^>]*>/gi, '');

  // Strip attributes from allowed tags <i>, <b>, <u>
  sanitized = sanitized
    .replace(/<\s*(i|b|u)\b[^>]*>/gi, '<$1>')
    .replace(/<\s*\/\s*(i|b|u)\b[^>]*>/gi, '</$1>');

  // Also handle WebVTT voice/cue tags like <v VoiceName>, <c.color>, which we strip
  sanitized = sanitized.replace(/<\/?(?:v|c)(?:\.[^>]+|\s+[^>]+)?>/gi, '');

  const parts = sanitized.split(/(<\/?(?:i|b|u)>)/gi);

  let isItalic = false;
  let isBold = false;
  let isUnderline = false;

  const nodes: React.ReactNode[] = [];

  parts.forEach((part, index) => {
    const lower = part.toLowerCase();
    if (lower === '<i>') {
      isItalic = true;
    } else if (lower === '</i>') {
      isItalic = false;
    } else if (lower === '<b>') {
      isBold = true;
    } else if (lower === '</b>') {
      isBold = false;
    } else if (lower === '<u>') {
      isUnderline = true;
    } else if (lower === '</u>') {
      isUnderline = false;
    } else if (part.length > 0) {
      // Strip any other stray HTML tags in this text segment
      const cleanText = decodeHtmlEntities(part.replace(/<[^>]+>/g, ''));
      if (!cleanText) return;

      let el: React.ReactNode = cleanText;
      if (isUnderline) el = React.createElement('u', { key: `u-${index}` }, el);
      if (isBold) el = React.createElement('b', { key: `b-${index}` }, el);
      if (isItalic) el = React.createElement('i', { key: `i-${index}` }, el);

      nodes.push(React.createElement(React.Fragment, { key: `frag-${index}` }, el));
    }
  });

  return nodes;
}

/**
 * Finds matching cue text given a list of cues, playback currentTime, and delaySeconds.
 * Effective query time is (currentTime - delaySeconds).
 */
export function findActiveCueText(
  cues: Array<{ startTime: number; endTime: number; text: string }>,
  currentTime: number,
  delaySeconds: number = 0
): string | null {
  if (!cues || cues.length === 0) return null;
  const effectiveTime = currentTime - delaySeconds;

  const matches = cues.filter((c) => c.startTime <= effectiveTime && c.endTime >= effectiveTime);
  if (matches.length === 0) return null;
  return matches.map((m) => m.text).join('\n');
}
