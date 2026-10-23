import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// We can import the compiled or source TypeScript files via tsx
import { analyzeMediaFile } from '../apps/server/src/services/media/mediaAnalyzer.js';
import { hlsPackager } from '../apps/server/src/services/media/hlsPackager.js';
import { buildTrackManifest } from '../apps/server/src/services/media/trackManifest.js';

async function main() {
  const fixturePath = path.join(rootDir, 'fixtures', '2_multi_track.mkv');
  const outDir = path.join(rootDir, 'fixtures', 'hls_output_demo');

  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  console.log('1. Analyzing fixture:', fixturePath);
  const analysis = await analyzeMediaFile(fixturePath);

  console.log('2. Packaging to HLS with multi-audio & subtitles...');
  const result = await hlsPackager.packageToHls('demo_job', {
    inputPath: fixturePath,
    outputDir: outDir,
    analysis,
    onProgress: (pct, speed, eta, stage) => {
      console.log(`[Progress] ${pct}% (speed: ${speed}, stage: ${stage})`);
    },
    onInitialSegmentsReady: () => {
      console.log('🚀 Initial fMP4 segments ready for playback!');
    },
  });

  console.log('\n======================================================');
  console.log('TRACK MANIFEST JSON:');
  console.log('======================================================');
  console.log(JSON.stringify(result.trackManifest, null, 2));

  console.log('\n======================================================');
  console.log('GENERATED MASTER PLAYLIST (master.m3u8):');
  console.log('======================================================');
  console.log(result.masterPlaylistContent);

  console.log('Generated Files in output directory:');
  console.log(fs.readdirSync(outDir));
}

main().catch((err) => {
  console.error('Error running test packager:', err);
  process.exit(1);
});
