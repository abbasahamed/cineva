// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clampSize,
  clampPosition,
  clampDelay,
  loadSubtitleSettings,
  saveSubtitleSettings,
  convertSrtToVtt,
  decodeHtmlEntities,
  parseCueFormatting,
  findActiveCueText,
  DEFAULT_SUBTITLE_SETTINGS,
} from '../utils/subtitleUtils.js';
import React from 'react';
import { render } from '@testing-library/react';

describe('subtitleUtils Suite', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    const mockStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => { store[key] = String(val); },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
      length: 0,
      key: (i: number) => Object.keys(store)[i] || null,
    };
    Object.defineProperty(window, 'localStorage', { value: mockStorage, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true, configurable: true });
  });

  describe('1. Clamping Functions', () => {
    it('clamps size between 60% and 220%', () => {
      expect(clampSize(30)).toBe(60);
      expect(clampSize(59)).toBe(60);
      expect(clampSize(100)).toBe(100);
      expect(clampSize(220)).toBe(220);
      expect(clampSize(300)).toBe(220);
      expect(clampSize(NaN)).toBe(100);
    });

    it('clamps position offset between 0% and 70%', () => {
      expect(clampPosition(-10)).toBe(0);
      expect(clampPosition(0)).toBe(0);
      expect(clampPosition(25.4)).toBe(25.4);
      expect(clampPosition(70)).toBe(70);
      expect(clampPosition(90)).toBe(70);
      expect(clampPosition(NaN)).toBe(0);
    });

    it('clamps delay between -5.0s and +5.0s', () => {
      expect(clampDelay(-10)).toBe(-5.0);
      expect(clampDelay(-1.5)).toBe(-1.5);
      expect(clampDelay(0)).toBe(0);
      expect(clampDelay(3.2)).toBe(3.2);
      expect(clampDelay(8.0)).toBe(5.0);
      expect(clampDelay(NaN)).toBe(0);
    });
  });

  describe('2. LocalStorage Persistence', () => {
    it('loads defaults when localStorage is empty', () => {
      const s = loadSubtitleSettings();
      expect(s).toEqual(DEFAULT_SUBTITLE_SETTINGS);
    });

    it('saves and restores custom settings', () => {
      const custom = {
        sizePercent: 140,
        positionOffsetPercent: 15,
        background: 'solid' as const,
        textColor: 'yellow' as const,
        edge: 'shadow' as const,
        delaySeconds: 1.5,
      };
      saveSubtitleSettings(custom);
      const loaded = loadSubtitleSettings();
      expect(loaded.sizePercent).toBe(140);
      expect(loaded.positionOffsetPercent).toBe(15);
      expect(loaded.background).toBe('solid');
      expect(loaded.textColor).toBe('yellow');
      expect(loaded.edge).toBe('shadow');
      expect(loaded.delaySeconds).toBe(0); // Delay always resets to 0 for a new session
    });

    it('bumps storage key so old v1 saved values (soft/shadow) do not override new defaults', () => {
      window.localStorage.setItem('cineva_sub_settings', JSON.stringify({
        background: 'soft',
        edge: 'shadow'
      }));
      const loaded = loadSubtitleSettings();
      expect(loaded.background).toBe('none');
      expect(loaded.edge).toBe('outline');
      expect(loaded.textColor).toBe('white');
    });
  });

  describe('3. SRT to WebVTT Conversion', () => {
    it('converts comma timestamps to periods and prefixes WEBVTT', () => {
      const srt = `1\n00:00:01,500 --> 00:00:04,200\nHello World\n\n2\n00:00:05,000 --> 00:00:08,123\nSecond subtitle`;
      const vtt = convertSrtToVtt(srt);
      expect(vtt.startsWith('WEBVTT')).toBe(true);
      expect(vtt).toContain('00:00:01.500 --> 00:00:04.200');
      expect(vtt).toContain('00:00:05.000 --> 00:00:08.123');
    });

    it('preserves text that already has WEBVTT header', () => {
      const vttInput = `WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nAlready VTT`;
      const result = convertSrtToVtt(vttInput);
      expect(result.startsWith('WEBVTT')).toBe(true);
      expect(result).not.toContain('WEBVTT\n\nWEBVTT');
    });
  });

  describe('4. Cue Text Sanitizing & Formatting', () => {
    it('decodes HTML entities properly', () => {
      expect(decodeHtmlEntities('Tom &amp; Jerry &lt;3')).toBe('Tom & Jerry <3');
      expect(decodeHtmlEntities('&#39;Quotes&#39; &quot;Double&quot;')).toBe("'Quotes' \"Double\"");
    });

    it('safely parses <i>, <b>, <u> formatting tags', () => {
      const { container } = render(
        <div data-testid="cue">
          {parseCueFormatting('This is <i>italic</i> and <b>bold</b> and <u>underlined</u>')}
        </div>
      );
      expect(container.querySelector('i')?.textContent).toBe('italic');
      expect(container.querySelector('b')?.textContent).toBe('bold');
      expect(container.querySelector('u')?.textContent).toBe('underlined');
    });

    it('strips script tags and malicious attributes to prevent XSS', () => {
      const malicious = '<script>alert("XSS")</script><img src="x" onerror="alert(1)">Hello <b onclick="evil()">Safe</b>';
      const { container } = render(
        <div data-testid="cue">
          {parseCueFormatting(malicious)}
        </div>
      );
      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toBe('Hello Safe');
      expect(container.querySelector('b')?.textContent).toBe('Safe');
    });
  });

  describe('5. Delay Shifting', () => {
    const sampleCues = [
      { startTime: 10.0, endTime: 15.0, text: 'Cue 1 (10s to 15s)' },
      { startTime: 20.0, endTime: 25.0, text: 'Cue 2 (20s to 25s)' },
    ];

    it('matches cue accurately with 0 delay', () => {
      expect(findActiveCueText(sampleCues, 12.0, 0)).toBe('Cue 1 (10s to 15s)');
      expect(findActiveCueText(sampleCues, 18.0, 0)).toBeNull();
      expect(findActiveCueText(sampleCues, 22.0, 0)).toBe('Cue 2 (20s to 25s)');
    });

    it('delays subtitle appearance when delaySeconds > 0', () => {
      // With +2.0s delay, at currentTime 12.0s the effective time is 10.0s (Cue 1 begins!)
      expect(findActiveCueText(sampleCues, 12.0, 2.0)).toBe('Cue 1 (10s to 15s)');
      // At currentTime 11.0s, effective time is 9.0s -> not yet active
      expect(findActiveCueText(sampleCues, 11.0, 2.0)).toBeNull();
      // At currentTime 17.0s, effective time is 15.0s -> still active
      expect(findActiveCueText(sampleCues, 17.0, 2.0)).toBe('Cue 1 (10s to 15s)');
    });

    it('advances subtitle appearance when delaySeconds < 0', () => {
      // With -2.0s delay, at currentTime 8.0s the effective time is 10.0s (Cue 1 shows early!)
      expect(findActiveCueText(sampleCues, 8.0, -2.0)).toBe('Cue 1 (10s to 15s)');
      // At currentTime 13.5s, effective time is 15.5s -> ended early
      expect(findActiveCueText(sampleCues, 13.5, -2.0)).toBeNull();
    });
  });
});
