import { describe, it, expect } from 'vitest';
import {
  formatLanguageDisplay,
  formatAudioTrackList,
  formatSubtitleTrackList,
} from '../utils/trackDisplay.js';

describe('trackDisplay utilities', () => {
  it('formats language codes correctly to human-friendly English names', () => {
    expect(formatLanguageDisplay('hin')).toBe('Hindi');
    expect(formatLanguageDisplay('tel')).toBe('Telugu');
    expect(formatLanguageDisplay('eng')).toBe('English');
    expect(formatLanguageDisplay('spa')).toBe('Spanish');
    expect(formatLanguageDisplay('fra')).toBe('French');
    expect(formatLanguageDisplay('und')).toBe('');
    expect(formatLanguageDisplay('')).toBe('');
  });

  it('formats audio track list ignoring noisy site titles and adding channel annotations', () => {
    const manifestTracks = [
      {
        streamIndex: 1,
        language: 'hin',
        title: '1Vegamovies.tw - Hindi DD 5.1',
        channels: 6,
        isDefault: true,
      },
      {
        streamIndex: 2,
        language: 'tel',
        title: '1Vegamovies.tw - Telugu Stereo',
        channels: 2,
        isDefault: false,
      },
    ];

    const audioOptions = formatAudioTrackList([], manifestTracks);
    expect(audioOptions).toHaveLength(2);

    // Hindi DD 5.1 should be "Hindi (5.1)", NOT containing "1Vegamovies.tw"
    expect(audioOptions[0].label).toBe('Hindi (5.1)');
    expect(audioOptions[0].isDefault).toBe(true);

    // Telugu should be "Telugu" without channel annotation since channels <= 2
    expect(audioOptions[1].label).toBe('Telugu');
    expect(audioOptions[1].isDefault).toBe(false);
  });

  it('deduplicates identical language tracks by adding index suffixes', () => {
    const tracks = [
      { streamIndex: 1, language: 'eng', title: 'English Main', channels: 2, isDefault: true },
      { streamIndex: 2, language: 'eng', title: 'English Commentary', channels: 2, isDefault: false },
      { streamIndex: 3, language: 'hin', title: 'Hindi', channels: 6, isDefault: false },
    ];

    const audioOptions = formatAudioTrackList([], tracks);
    expect(audioOptions[0].label).toBe('English');
    expect(audioOptions[1].label).toBe('English (2)');
    expect(audioOptions[2].label).toBe('Hindi (5.1)');
  });

  it('formats subtitles with text tracks enabled and image-based tracks disabled with honest label', () => {
    const subtitleTracks = [
      { streamIndex: 3, language: 'eng', title: 'English Full', codec: 'subrip', isDefault: true, supported: true },
      { streamIndex: 4, language: 'spa', title: 'Spanish', codec: 'subrip', isDefault: false, supported: true },
      { streamIndex: 5, language: 'fra', title: 'French PGS', codec: 'hdmv_pgs_subtitle', isDefault: false, supported: false, unsupportedReason: 'Image subtitles not supported' },
    ];

    const subOptions = formatSubtitleTrackList(subtitleTracks);
    expect(subOptions).toHaveLength(3);
    expect(subOptions[0].label).toBe('English');
    expect(subOptions[0].supported).toBe(true);

    expect(subOptions[1].label).toBe('Spanish');
    expect(subOptions[1].supported).toBe(true);

    expect(subOptions[2].label).toBe('French (HDMV_PGS_SUBTITLE) - not supported');
    expect(subOptions[2].supported).toBe(false);
  });
});
