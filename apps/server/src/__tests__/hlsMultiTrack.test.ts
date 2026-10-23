import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { analyzeMediaFile } from '../services/media/mediaAnalyzer.js';
import { buildTrackManifest, formatLanguageName } from '../services/media/trackManifest.js';
import { hlsPackager } from '../services/media/hlsPackager.js';

describe('HLS Multi-Audio & Subtitle Packaging Pipeline', () => {
  const rootDir = path.resolve(__dirname, '../../../..');
  const fixturePath = path.join(rootDir, 'fixtures', '2_multi_track.mkv');
  const testOutputDir = path.join(rootDir, 'fixtures', 'test_hls_unit_out');

  beforeAll(() => {
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  it('1. correctly analyzes all 7 streams from the multi-track fixture', async () => {
    const analysis = await analyzeMediaFile(fixturePath);

    expect(analysis.hasVideo).toBe(true);
    expect(analysis.videoCodec).toBe('h264');
    expect(analysis.audioStreamsCount).toBe(3);

    const subtitleStreams = analysis.streams.filter((s) => s.codecType === 'subtitle');
    expect(subtitleStreams.length).toBe(3);

    // Verify stream tags & dispositions
    const audioLangs = analysis.streams
      .filter((s) => s.codecType === 'audio')
      .map((s) => s.language);
    expect(audioLangs).toEqual(['eng', 'hin', 'tel']);
  });

  it('2. formats language display names cleanly via Intl.DisplayNames', () => {
    expect(formatLanguageName('eng')).toBe('English');
    expect(formatLanguageName('hin')).toBe('Hindi');
    expect(formatLanguageName('tel')).toBe('Telugu');
    expect(formatLanguageName('spa')).toBe('Spanish');
    expect(formatLanguageName('fra')).toBe('French');
  });

  it('3. builds complete TrackManifest with supported and unsupported subtitle classification', async () => {
    const analysis = await analyzeMediaFile(fixturePath);
    const manifest = buildTrackManifest(analysis, {
      hlsMasterUrl: 'master.m3u8',
      isHls: true,
    });

    expect(manifest.videoTracks.length).toBe(1);
    expect(manifest.videoTracks[0].codec).toBe('h264');

    expect(manifest.audioTracks.length).toBe(3);
    expect(manifest.audioTracks[0].title).toBe('English');
    expect(manifest.audioTracks[0].isDefault).toBe(true);
    expect(manifest.audioTracks[1].title).toBe('Hindi');
    expect(manifest.audioTracks[2].title).toBe('Telugu');

    expect(manifest.subtitleTracks.length).toBe(3);
    // English text sub
    expect(manifest.subtitleTracks[0].language).toBe('eng');
    expect(manifest.subtitleTracks[0].supported).toBe(true);
    // Spanish text sub
    expect(manifest.subtitleTracks[1].language).toBe('spa');
    expect(manifest.subtitleTracks[1].supported).toBe(true);
    // French PGS bitmap sub
    expect(manifest.subtitleTracks[2].language).toBe('fra');
    expect(manifest.subtitleTracks[2].supported).toBe(false);
    expect(manifest.subtitleTracks[2].unsupportedReason).toContain('Image-based');
  });

  it('4. packages multi-audio HLS and extracts text subtitles to WebVTT', async () => {
    const analysis = await analyzeMediaFile(fixturePath);

    const result = await hlsPackager.packageToHls('unit_test_hls', {
      inputPath: fixturePath,
      outputDir: testOutputDir,
      analysis,
    });

    expect(fs.existsSync(result.masterPlaylistPath)).toBe(true);

    const master = result.masterPlaylistContent;
    // Audio renditions
    expect(master).toContain('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="group_audio",NAME="English');
    expect(master).toContain('LANGUAGE="hin"');
    expect(master).toContain('LANGUAGE="tel"');

    // Subtitle renditions
    expect(master).toContain('#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English [CC]"');
    expect(master).toContain('#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Español"');
    expect(master).toContain('SUBTITLES="subs"');

    // Extracted WebVTT files
    expect(fs.existsSync(path.join(testOutputDir, 'sub_4_eng.vtt'))).toBe(true);
    expect(fs.existsSync(path.join(testOutputDir, 'sub_5_spa.vtt'))).toBe(true);

    // Initial and media segments exist
    expect(fs.existsSync(path.join(testOutputDir, 'init_0.mp4'))).toBe(true);
    expect(fs.existsSync(path.join(testOutputDir, 'stream_00.m4s'))).toBe(true);
  });
});
