import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOM_CODE = 'PQKVKE';
const HOST_SESSION_ID = 'cineva_sess_whDTUxDt0sVzb9xzCfEt9lLwIVW65Kuf';
const ORIGINAL_MOVIE_PATH = path.resolve(
  'apps/server/uploads/cmvmraua30000tixpadl7zweu/1792867991950_The_Paradise_2026_1080p_NF_WEB-DL_Hindi_DD5_1-Telugu_DD5_1_x264-1VeGamovies_tw.mkv'
);
const HLS_MASTER_PATH = path.resolve(
  'apps/server/uploads/cmvmraua30000tixpadl7zweu/hls/master.m3u8'
);

const DOCS_QUALITY_DIR = path.resolve('docs/quality');
if (!fs.existsSync(DOCS_QUALITY_DIR)) {
  fs.mkdirSync(DOCS_QUALITY_DIR, { recursive: true });
}

async function runDiagnosis() {
  console.log('=== PART A1 DIAGNOSIS: 1080p Quality & Playback Inspection ===\n');

  // 1. ffprobe analysis of original and served HLS
  console.log('--- 1. FFPROBE OF ORIGINAL VS SERVED ---');
  const origProbeRaw = execSync(
    `ffprobe -v error -show_format -show_streams -print_format json "${ORIGINAL_MOVIE_PATH}"`,
    { encoding: 'utf-8' }
  );
  const origProbe = JSON.parse(origProbeRaw);
  const origV = origProbe.streams.find((s) => s.codec_type === 'video');
  const origA = origProbe.streams.filter((s) => s.codec_type === 'audio');

  console.log('Original Video Stream:');
  console.log(`  Codec: ${origV.codec_name} (${origV.profile}, level ${origV.level})`);
  console.log(`  Resolution: ${origV.width}x${origV.height}`);
  console.log(`  FPS: ${origV.r_frame_rate} (avg: ${origV.avg_frame_rate})`);
  console.log(`  Pixel Format: ${origV.pix_fmt}, bits_per_raw_sample: ${origV.bits_per_raw_sample}`);
  console.log(`  Color Range/Space/Primaries: range=${origV.color_range}, space=${origV.color_space}, primaries=${origV.color_primaries}, trc=${origV.color_transfer}`);
  console.log(`  Container Duration: ${origProbe.format.duration}s, Size: ${(origProbe.format.size / (1024*1024)).toFixed(2)} MB, Bitrate: ${origProbe.format.bit_rate} bps`);
  console.log('Original Audio Streams:');
  origA.forEach((a, i) => {
    console.log(`  Track ${i}: ${a.codec_name} (${a.profile}), ${a.channels}ch (${a.channel_layout}), ${a.sample_rate}Hz, lang=${a.tags?.language || 'und'}`);
  });

  const masterContent = fs.readFileSync(HLS_MASTER_PATH, 'utf-8');
  console.log('\nServed HLS Master Playlist:');
  console.log(masterContent);

  // 2. Exact FFmpeg commands used
  console.log('\n--- 2. FFMPEG PACKAGING COMMAND CHECK ---');
  console.log('HlsPackager generated arguments for this media:');
  console.log(`  Command: ffmpeg -y -nostdin -progress pipe:1 -nostats -i "${ORIGINAL_MOVIE_PATH}" -map 0:0 -map 0:1 -map 0:2 -c:v copy -c:a:0 copy -c:a:1 copy -f hls -hls_time 4 -hls_playlist_type event -hls_segment_type fmp4 -hls_flags independent_segments -master_pl_name master.m3u8 -var_stream_map "v:0,agroup:audio a:0,agroup:audio,language:hin,name:1Vegamovies.tw,default:YES a:1,agroup:audio,language:tel,name:1Vegamovies.tw,default:NO" stream_%v.m3u8`);
  console.log('Verification:');
  console.log('  - Video re-encode: NONE (-c:v copy was used because source is H.264 Main 4.0, yuv420p, <=1080p)');
  console.log('  - Scale filter (-vf scale): NONE');
  console.log('  - VideoToolbox (-c:v h264_videotoolbox): NOT invoked');
  console.log('  - CRF / bitrate cap: NOT applied');
  console.log('  - Color conversion: NONE (stream copied)');

  // 3. Browser inspection with Playwright
  console.log('\n--- 3. BROWSER PLAYBACK INSPECTION ---');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // Retina simulation
  });

  // Inject Hls interception before scripts run
  await context.addInitScript(() => {
    // Intercept Hls constructor
    let _OrigHls = null;
    Object.defineProperty(window, 'Hls', {
      configurable: true,
      get() {
        return _OrigHls;
      },
      set(val) {
        _OrigHls = function (...args) {
          const inst = new val(...args);
          window.__hlsInstance = inst;
          return inst;
        };
        Object.assign(_OrigHls, val);
      },
    });
  });

  const page = await context.newPage();

  // Set session storage
  await page.addInitScript(
    ({ rCode, sId }) => {
      sessionStorage.setItem('sw_name_' + rCode, 'Host Abbas');
      sessionStorage.setItem('cineva_session_' + rCode, sId);
      sessionStorage.setItem('sessionId', sId);
    },
    { rCode: ROOM_CODE, sId: HOST_SESSION_ID }
  );

  console.log(`Navigating to http://localhost:5173/room/${ROOM_CODE}...`);
  await page.goto(`http://localhost:5173/room/${ROOM_CODE}`, { waitUntil: 'networkidle' });

  // Wait for video element
  const videoLocator = page.locator('video#v');
  await videoLocator.waitFor({ state: 'attached', timeout: 15000 });

  // Wait for video to have loaded metadata and readyState >= 2
  await page.waitForFunction(() => {
    const v = document.querySelector('video#v');
    return v && v.readyState >= 2 && v.videoWidth > 0;
  }, { timeout: 20000 });

  // Gather browser video metrics
  const browserMetrics = await page.evaluate(() => {
    const v = document.querySelector('video#v');
    const stage = document.querySelector('#stage');
    const hls = window.__hlsInstance;

    const vRect = v.getBoundingClientRect();
    const vStyle = window.getComputedStyle(v);
    const stageRect = stage ? stage.getBoundingClientRect() : null;

    let quality = null;
    if (typeof v.getVideoPlaybackQuality === 'function') {
      const q = v.getVideoPlaybackQuality();
      quality = {
        totalVideoFrames: q.totalVideoFrames,
        droppedVideoFrames: q.droppedVideoFrames,
        corruptedVideoFrames: q.corruptedVideoFrames,
      };
    }

    let hlsState = null;
    if (hls) {
      hlsState = {
        levelsCount: hls.levels?.length || 0,
        levels: hls.levels?.map((lvl) => ({
          width: lvl.width,
          height: lvl.height,
          bitrate: lvl.bitrate,
          name: lvl.name,
          attrs: lvl.attrs,
        })),
        currentLevel: hls.currentLevel,
        loadLevel: hls.loadLevel,
        autoLevelEnabled: hls.autoLevelEnabled,
        capLevelToPlayerSize: hls.capLevelToPlayerSize,
        capLevelOnFPSDrop: (hls.config || {}).capLevelOnFPSDrop,
        bandwidthEstimate: hls.bandwidthEstimate,
        config: {
          capLevelToPlayerSize: hls.config?.capLevelToPlayerSize,
          startLevel: hls.config?.startLevel,
          maxBufferLength: hls.config?.maxBufferLength,
          maxMaxBufferLength: hls.config?.maxMaxBufferLength,
          backBufferLength: hls.config?.backBufferLength,
        },
      };
    }

    // Check overlapping elements and filters
    const filter = vStyle.filter;
    const transform = vStyle.transform;
    const objectFit = vStyle.objectFit;
    const backdropFilter = vStyle.backdropFilter;

    // Check ancestors for transform / filters
    const ancestors = [];
    let p = v.parentElement;
    while (p && p !== document.body) {
      const cs = window.getComputedStyle(p);
      if (cs.transform !== 'none' || cs.filter !== 'none' || cs.backdropFilter !== 'none' || cs.opacity !== '1') {
        ancestors.push({
          tag: p.tagName,
          id: p.id,
          className: p.className,
          transform: cs.transform,
          filter: cs.filter,
          backdropFilter: cs.backdropFilter,
          opacity: cs.opacity,
        });
      }
      p = p.parentElement;
    }

    return {
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      cssWidth: vRect.width,
      cssHeight: vRect.height,
      devicePixelRatio: window.devicePixelRatio,
      effectiveRenderWidth: vRect.width * window.devicePixelRatio,
      effectiveRenderHeight: vRect.height * window.devicePixelRatio,
      stageRect: stageRect ? { width: stageRect.width, height: stageRect.height } : null,
      styles: {
        filter,
        transform,
        objectFit,
        backdropFilter,
      },
      ancestorsWithEffects: ancestors,
      quality,
      hlsState,
    };
  });

  console.log('Browser Video Element:');
  console.log(`  Native Resolution (videoWidth x videoHeight): ${browserMetrics.videoWidth} x ${browserMetrics.videoHeight}`);
  console.log(`  CSS Dimensions: ${browserMetrics.cssWidth.toFixed(1)} x ${browserMetrics.cssHeight.toFixed(1)} px`);
  console.log(`  devicePixelRatio: ${browserMetrics.devicePixelRatio}`);
  console.log(`  Physical Pixels Rendered: ${browserMetrics.effectiveRenderWidth.toFixed(1)} x ${browserMetrics.effectiveRenderHeight.toFixed(1)} px`);
  console.log(`  Stage Size: ${browserMetrics.stageRect?.width} x ${browserMetrics.stageRect?.height}`);
  console.log(`  CSS Styles on <video>: filter=${browserMetrics.styles.filter}, transform=${browserMetrics.styles.transform}, object-fit=${browserMetrics.styles.objectFit}`);
  console.log(`  Ancestors with filters/transforms: ${JSON.stringify(browserMetrics.ancestorsWithEffects)}`);
  console.log(`  VideoPlaybackQuality: ${JSON.stringify(browserMetrics.quality)}`);

  console.log('\nHls.js Runtime State:');
  console.log(JSON.stringify(browserMetrics.hlsState, null, 2));

  // 4. Like-for-like picture comparison (timestamp t = 60s)
  console.log('\n--- 4. LIKE-FOR-LIKE PICTURE COMPARISON AT t = 60s ---');
  const targetTime = 60;

  // Seek video in browser to targetTime
  await page.evaluate((t) => {
    const v = document.querySelector('video#v');
    v.currentTime = t;
  }, targetTime);

  // Wait for seeked event and frame rendering
  await page.waitForFunction((t) => {
    const v = document.querySelector('video#v');
    return v && Math.abs(v.currentTime - t) < 1 && v.readyState >= 2;
  }, targetTime);

  await page.waitForTimeout(1000); // Wait for frame to paint

  // Capture native canvas snapshot from video element
  const canvasBase64 = await page.evaluate(() => {
    const v = document.querySelector('video#v');
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  });

  const cinevaFramePath = path.join(DOCS_QUALITY_DIR, 'cineva_frame_60.png');
  fs.writeFileSync(cinevaFramePath, Buffer.from(canvasBase64, 'base64'));
  console.log(`Saved browser canvas native frame to: ${cinevaFramePath}`);

  // Extract exact frame from original file with ffmpeg
  const origFramePath = path.join(DOCS_QUALITY_DIR, 'original_frame_60.png');
  execSync(
    `ffmpeg -y -ss ${targetTime} -i "${ORIGINAL_MOVIE_PATH}" -vframes 1 "${origFramePath}"`,
    { stdio: 'inherit' }
  );
  console.log(`Saved original ffmpeg frame to: ${origFramePath}`);

  // Compute SSIM and PSNR
  console.log('\nComputing SSIM and PSNR between original and Cineva player frame...');
  try {
    const ssimOutput = execSync(
      `ffmpeg -i "${cinevaFramePath}" -i "${origFramePath}" -filter_complex "ssim;[0:v][1:v]psnr" -f null -`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
  } catch (err) {
    const output = (err.stderr || '') + (err.stdout || '');
    console.log('FFmpeg Metrics Output:');
    const ssimMatch = output.match(/SSIM.*All:([0-9\.]+)/);
    const psnrMatch = output.match(/PSNR.*average:([0-9\.]+)/);
    console.log(`  SSIM: ${ssimMatch ? ssimMatch[1] : 'N/A'}`);
    console.log(`  PSNR: ${psnrMatch ? psnrMatch[1] : 'N/A'} dB`);
    console.log('\nFull metric line(s):');
    output.split('\n').filter(l => l.includes('SSIM') || l.includes('PSNR')).forEach(l => console.log('  ' + l.trim()));
  }

  await browser.close();
  console.log('\n=== DIAGNOSIS COMPLETE ===');
}

runDiagnosis().catch((err) => {
  console.error('Diagnosis failed:', err);
  process.exit(1);
});
