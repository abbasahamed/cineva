#!/usr/bin/env node
/**
 * scripts/make-fixtures.mjs
 * Generates test fixtures for Cineva:
 *  1. H.264 / AAC MP4 (standard browser-safe video)
 *  2. Multi-track MKV with 3 distinct audio languages (440Hz eng, 880Hz hin, 1320Hz tel),
 *     2 text subtitles (eng, spa), and 1 image-based subtitle (hdmv_pgs_subtitle)
 *  3. HEVC MKV (H.265 video with AAC audio)
 *  4. Corrupted video file (invalid header/broken bytes)
 *
 * Usage:
 *   node scripts/make-fixtures.mjs [--duration <seconds>]
 */
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = path.join(ROOT, 'fixtures');

// Parse duration argument (default 10s for fast unit/integration testing)
const args = process.argv.slice(2);
let duration = 10;
const durIdx = args.indexOf('--duration');
if (durIdx !== -1 && args[durIdx + 1]) {
  duration = parseInt(args[durIdx + 1], 10) || 10;
}

if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

function run(cmd, args) {
  return execFileSync(cmd, args, { stdio: 'inherit' });
}

function probeStreams(filePath) {
  const stdout = execSync(`ffprobe -v error -print_format json -show_format -show_streams "${filePath}"`, {
    encoding: 'utf8',
  });
  return JSON.parse(stdout);
}

// 1. Helper to create a valid PGS segment buffer
function createPgsSegment(type, pts, payload) {
  const buf = Buffer.alloc(13 + payload.length);
  buf.write('PG', 0);
  buf.writeUInt32BE(pts, 2);
  buf.writeUInt32BE(0, 6);
  buf.writeUInt8(type, 10);
  buf.writeUInt16BE(payload.length, 11);
  payload.copy(buf, 13);
  return buf;
}

function createDummyPgsSup() {
  const pcsPayload = Buffer.from([
    0x07, 0x80, 0x04, 0x38, // 1920x1080
    0x20,                   // 24 fps
    0x00, 0x01,             // compNum: 1
    0x80,                   // compState: Epoch Start
    0x00,                   // palUpdate
    0x00,                   // palId
    0x00,                   // numObj: 0
  ]);
  const pcs = createPgsSegment(0x16, 90000, pcsPayload);
  const end = createPgsSegment(0x80, 90000, Buffer.alloc(0));
  return Buffer.concat([pcs, end]);
}

async function main() {
  console.log(`\n🎬 Generating test fixtures in ${FIXTURES_DIR} (duration: ${duration}s)...\n`);

  // Check hardware acceleration
  let videoEncoder = 'libx264';
  let hevcEncoder = 'libx265';
  try {
    const encoders = execSync('ffmpeg -encoders', { encoding: 'utf8' });
    if (encoders.includes('h264_videotoolbox')) videoEncoder = 'h264_videotoolbox';
    if (encoders.includes('hevc_videotoolbox')) hevcEncoder = 'hevc_videotoolbox';
  } catch {}

  console.log(`Using encoders: H.264 -> ${videoEncoder}, HEVC -> ${hevcEncoder}\n`);

  // --------------------------------------------------------------------------
  // Fixture 1: Standard H.264 / AAC MP4
  // --------------------------------------------------------------------------
  const f1 = path.join(FIXTURES_DIR, '1_h264_aac.mp4');
  console.log(`[1/4] Building standard MP4: ${path.basename(f1)}...`);
  run('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', `testsrc=duration=${duration}:size=1280x720:rate=30`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${duration}`,
    '-c:v', videoEncoder,
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    f1,
  ]);

  // --------------------------------------------------------------------------
  // Fixture 2: MKV with 3 audio tracks (440Hz, 880Hz, 1320Hz), 2 text subtitles, 1 PGS subtitle
  // --------------------------------------------------------------------------
  const f2 = path.join(FIXTURES_DIR, '2_multi_track.mkv');
  console.log(`\n[2/4] Building multi-track MKV: ${path.basename(f2)}...`);

  // Temporary subtitle files
  const srtEng = path.join(FIXTURES_DIR, '_tmp_eng.srt');
  const srtSpa = path.join(FIXTURES_DIR, '_tmp_spa.srt');
  const supPgs = path.join(FIXTURES_DIR, '_tmp_pgs.sup');

  fs.writeFileSync(
    srtEng,
    '1\n00:00:01,000 --> 00:00:08,000\nWelcome to Cineva Multi-Audio Screening\n\n' +
    '2\n00:00:10,000 --> 00:00:20,000\nEnjoy the movie with your friends!\n\n' +
    '3\n00:01:25,000 --> 00:01:45,000\nActive scene at 90 seconds (English CC)\n\n'
  );
  fs.writeFileSync(
    srtSpa,
    '1\n00:00:01,000 --> 00:00:08,000\nBienvenidos a la proyección Cineva\n\n' +
    '2\n00:00:10,000 --> 00:00:20,000\n¡Disfruta de la película juntos!\n\n' +
    '3\n00:01:25,000 --> 00:01:45,000\nEscena activa a los 90 segundos (Español)\n\n'
  );
  fs.writeFileSync(supPgs, createDummyPgsSup());

  run('ffmpeg', [
    '-y',
    // Video input (0)
    '-f', 'lavfi', '-i', `testsrc=duration=${duration}:size=1920x1080:rate=24`,
    // Audio input 1: English 440 Hz (1)
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${duration}`,
    // Audio input 2: Hindi 880 Hz (2)
    '-f', 'lavfi', '-i', `sine=frequency=880:duration=${duration}`,
    // Audio input 3: Telugu 1320 Hz (3)
    '-f', 'lavfi', '-i', `sine=frequency=1320:duration=${duration}`,
    // Subtitle input 1: English (4)
    '-i', srtEng,
    // Subtitle input 2: Spanish (5)
    '-i', srtSpa,
    // Subtitle input 3: PGS Image-based (6)
    '-i', supPgs,
    // Map streams
    '-map', '0:v',
    '-map', '1:a',
    '-map', '2:a',
    '-map', '3:a',
    '-map', '4:s',
    '-map', '5:s',
    '-map', '6:s',
    // Video encoding
    '-c:v', videoEncoder,
    '-pix_fmt', 'yuv420p',
    // Audio encoding
    '-c:a', 'aac',
    '-b:a', '128k',
    // Subtitles: text copied as srt/subrip, PGS copied as pgssub
    '-c:s:0', 'subrip',
    '-c:s:1', 'subrip',
    '-c:s:2', 'copy',
    // Audio metadata
    '-metadata:s:a:0', 'language=eng',
    '-metadata:s:a:0', 'title=English',
    '-metadata:s:a:1', 'language=hin',
    '-metadata:s:a:1', 'title=Hindi',
    '-metadata:s:a:2', 'language=tel',
    '-metadata:s:a:2', 'title=Telugu',
    // Subtitle metadata
    '-metadata:s:s:0', 'language=eng',
    '-metadata:s:s:0', 'title=English [CC]',
    '-metadata:s:s:1', 'language=spa',
    '-metadata:s:s:1', 'title=Español',
    '-metadata:s:s:2', 'language=fra',
    '-metadata:s:s:2', 'title=Français (PGS)',
    '-t', String(duration),
    f2,
  ]);

  // Clean temp files
  try {
    fs.unlinkSync(srtEng);
    fs.unlinkSync(srtSpa);
    fs.unlinkSync(supPgs);
  } catch {}

  // --------------------------------------------------------------------------
  // Fixture 3: HEVC MKV
  // --------------------------------------------------------------------------
  const f3 = path.join(FIXTURES_DIR, '3_hevc.mkv');
  console.log(`\n[3/4] Building HEVC MKV: ${path.basename(f3)}...`);
  run('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', `testsrc=duration=${duration}:size=1280x720:rate=25`,
    '-f', 'lavfi', '-i', `sine=frequency=500:duration=${duration}`,
    '-c:v', hevcEncoder,
    '-c:a', 'aac',
    '-shortest',
    f3,
  ]);

  // --------------------------------------------------------------------------
  // Fixture 4: Corrupted file
  // --------------------------------------------------------------------------
  const f4 = path.join(FIXTURES_DIR, '4_corrupted.mp4');
  console.log(`\n[4/4] Building corrupted file: ${path.basename(f4)}...`);
  const corruptedBuf = Buffer.alloc(2048);
  corruptedBuf.write('ftypmp42', 4);
  for (let i = 8; i < 2048; i++) {
    corruptedBuf[i] = Math.floor(Math.random() * 256);
  }
  fs.writeFileSync(f4, corruptedBuf);

  console.log('\n✅ All fixtures generated successfully in fixtures/:');
  for (const f of [f1, f2, f3, f4]) {
    const stats = fs.statSync(f);
    console.log(`  - ${path.basename(f)} (${(stats.size / 1024).toFixed(1)} KB)`);
  }

  // Print stream probe of Fixture 2
  console.log('\n--- Stream Probe for 2_multi_track.mkv ---');
  const p2 = probeStreams(f2);
  for (const s of p2.streams) {
    const title = s.tags?.title || s.tags?.handler_name || '';
    const lang = s.tags?.language || '';
    console.log(`  Stream #${s.index} [${s.codec_type}]: ${s.codec_name} | lang=${lang} | title="${title}"`);
  }
}

main().catch((err) => {
  console.error('Fixture generation failed:', err);
  process.exit(1);
});
