import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ORIGINAL_MOVIE_PATH = path.resolve(
  'apps/server/uploads/cmvmraua30000tixpadl7zweu/1792867991950_The_Paradise_2026_1080p_NF_WEB-DL_Hindi_DD5_1-Telugu_DD5_1_x264-1VeGamovies_tw.mkv'
);
const HLS_DIR = path.resolve(
  'apps/server/uploads/cmvmraua30000tixpadl7zweu/hls'
);
const DOCS_QUALITY_DIR = path.resolve('docs/quality');
if (!fs.existsSync(DOCS_QUALITY_DIR)) {
  fs.mkdirSync(DOCS_QUALITY_DIR, { recursive: true });
}

// Parse stream_0.m3u8 to map timestamps to segments
const stream0Content = fs.readFileSync(path.join(HLS_DIR, 'stream_0.m3u8'), 'utf-8');
const lines = stream0Content.split('\n');
const segments = [];
let curDuration = 0;
let cumulative = 0;

for (const line of lines) {
  if (line.startsWith('#EXTINF:')) {
    curDuration = parseFloat(line.replace('#EXTINF:', '').replace(',', ''));
  } else if (line.endsWith('.m4s')) {
    segments.push({
      file: line.trim(),
      duration: curDuration,
      startTime: cumulative,
      endTime: cumulative + curDuration,
    });
    cumulative += curDuration;
  }
}

const sampleTimes = [60, 180, 600, 1200, 2400];
const results = [];

console.log('=== BENCHMARKING 5 SAMPLED FRAMES: ORIGINAL VS CINEVA SERVED HLS ===\n');

for (let i = 0; i < sampleTimes.length; i++) {
  const targetT = sampleTimes[i];
  const seg = segments.find(s => targetT >= s.startTime && targetT < s.endTime);
  if (!seg) {
    console.error(`Could not find segment for t = ${targetT}s`);
    continue;
  }

  const offsetInSeg = targetT - seg.startTime;
  const tempSegMp4 = `/tmp/bench_seg_${i}.mp4`;
  const hlsInit = path.join(HLS_DIR, 'init_0.mp4');
  const hlsSeg = path.join(HLS_DIR, seg.file);

  // Concatenate init + m4s
  const initBuf = fs.readFileSync(hlsInit);
  const segBuf = fs.readFileSync(hlsSeg);
  fs.writeFileSync(tempSegMp4, Buffer.concat([initBuf, segBuf]));

  const hlsFramePath = path.join(DOCS_QUALITY_DIR, `hls_frame_${targetT}s.png`);
  const origFramePath = path.join(DOCS_QUALITY_DIR, `orig_frame_${targetT}s.png`);

  // Extract frame from HLS segment
  execSync(
    `ffmpeg -y -ss ${offsetInSeg.toFixed(3)} -i "${tempSegMp4}" -vframes 1 "${hlsFramePath}"`,
    { stdio: 'ignore' }
  );

  // Fast accurate seek: seek to targetT - 3s before -i, then accurate seek 3s after -i
  const fastSeek = Math.max(0, targetT - 3);
  const accurateSeek = targetT - fastSeek;
  execSync(
    `ffmpeg -y -ss ${fastSeek.toFixed(3)} -i "${ORIGINAL_MOVIE_PATH}" -ss ${accurateSeek.toFixed(3)} -vframes 1 "${origFramePath}"`,
    { stdio: 'ignore' }
  );

  // Compare SSIM and PSNR
  const ssimResult = spawnSync('ffmpeg', [
    '-i', hlsFramePath,
    '-i', origFramePath,
    '-filter_complex', 'ssim;[0:v][1:v]psnr',
    '-f', 'null',
    '-',
  ], { encoding: 'utf-8' });

  const out = (ssimResult.stderr || '') + (ssimResult.stdout || '');
  const ssimMatch = out.match(/SSIM.*All:([0-9\.]+)/);
  const psnrMatch = out.match(/PSNR.*average:([0-9\.]+|inf)/);
  const ssimVal = ssimMatch ? parseFloat(ssimMatch[1]) : 1.0;
  const psnrVal = psnrMatch ? psnrMatch[1] : 'inf';

  results.push({
    timestamp: `${targetT}s`,
    segment: seg.file,
    ssim: ssimVal,
    psnr: psnrVal,
    passed: ssimVal >= 0.97,
  });
  console.log(`Frame at t = ${targetT}s (${seg.file}): SSIM = ${ssimVal.toFixed(6)}, PSNR = ${psnrVal} dB (Passed: ${ssimVal >= 0.97})`);
}

console.log('\n--- 5-FRAME SSIM SUMMARY ---');
console.table(results);
const allPassed = results.every(r => r.passed);
console.log(`\nOverall Acceptance (SSIM >= 0.97): ${allPassed ? 'PASSED ✅' : 'FAILED ❌'}`);
