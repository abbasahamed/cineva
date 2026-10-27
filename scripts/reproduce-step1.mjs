import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const FIXTURES = {
  mp4: path.resolve('fixtures/1_h264_aac.mp4'),
  mkv: path.resolve('fixtures/2_multi_track.mkv'),
};

async function testPlayback(fileType, filePath) {
  console.log(`\n======================================================`);
  console.log(`[TEST] Reproducing Step 1 with ${fileType.toUpperCase()}: ${filePath}`);
  console.log(`======================================================`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleMessages = [];
  const networkRequests = [];
  const failedRequests = [];
  const mediaRequests = [];

  page.on('console', (msg) => {
    const entry = { type: msg.type(), text: msg.text() };
    consoleMessages.push(entry);
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`  [Browser ${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  page.on('request', (req) => {
    networkRequests.push({ url: req.url(), method: req.method() });
  });

  page.on('requestfailed', (req) => {
    failedRequests.push({ url: req.url(), failure: req.failure()?.errorText });
    console.log(`  [Network Failed] ${req.url()} - ${req.failure()?.errorText}`);
  });

  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/media') || url.endsWith('.mp4') || url.endsWith('.mkv')) {
      const headers = await res.allHeaders();
      const status = res.status();
      const info = {
        url,
        status,
        headers: {
          'content-type': headers['content-type'],
          'accept-ranges': headers['accept-ranges'],
          'content-range': headers['content-range'],
          'access-control-allow-origin': headers['access-control-allow-origin'],
          'cache-control': headers['cache-control'],
          'cross-origin-resource-policy': headers['cross-origin-resource-policy'],
        },
      };
      mediaRequests.push(info);
      console.log(`  [Media Response] ${status} ${url}`);
      console.log(`    Headers:`, JSON.stringify(info.headers, null, 2));
    }
  });

  // 1. Navigate to /create
  await page.goto('http://localhost:5173/create', { waitUntil: 'networkidle' });

  // 2. Fill form
  await page.fill('#displayName', `Abbas ${fileType.toUpperCase()}`);
  const fileInput = await page.$('#videoFile');
  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(500);

  // 3. Submit
  console.log(`Submitting create form...`);
  await page.click('#submitBtn');

  // 4. Wait for modal ready
  console.log(`Waiting for room ready modal...`);
  const enterBtn = page.locator('button:has-text("Enter Theater")');
  await enterBtn.waitFor({ state: 'visible', timeout: 45000 });
  console.log(`Room ready! Clicking Enter Theater...`);
  await enterBtn.click();

  // 5. Wait for room page navigation
  await page.waitForURL('**/room/**', { timeout: 15000 });
  const roomUrl = page.url();
  const roomCode = roomUrl.split('/').pop().split('?')[0];
  console.log(`Arrived at Room: ${roomUrl} (Code: ${roomCode})`);

  // Wait 4 seconds for socket, video, and components to stabilize
  await page.waitForTimeout(4000);

  // Take screenshot
  const artifactsDir = process.env.ARTIFACTS_DIR || path.resolve('scratch');
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
  const screenshotPath = path.join(artifactsDir, `step1_${fileType}_room.png`);
  await page.screenshot({ path: screenshotPath });
  console.log(`Screenshot saved to: ${screenshotPath}`);

  // 6. Inspect <video> element state
  const videoState = await page.evaluate(() => {
    const v = document.querySelector('video#v') || document.querySelector('video');
    if (!v) return { exists: false };
    return {
      exists: true,
      id: v.id,
      src: v.src,
      currentSrc: v.currentSrc,
      getAttributeSrc: v.getAttribute('src'),
      networkState: v.networkState, // 0: NETWORK_EMPTY, 1: NETWORK_IDLE, 2: NETWORK_LOADING, 3: NETWORK_NO_SOURCE
      readyState: v.readyState, // 0: HAVE_NOTHING, 1: HAVE_METADATA, 2: HAVE_CURRENT_DATA, 3: HAVE_FUTURE_DATA, 4: HAVE_ENOUGH_DATA
      paused: v.paused,
      duration: v.duration,
      currentTime: v.currentTime,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      crossOrigin: v.crossOrigin,
      error: v.error ? { code: v.error.code, message: v.error.message } : null,
      outerHTMLSnippet: v.outerHTML.substring(0, 300),
    };
  });

  // 7. Check room API status
  const roomApiState = await page.evaluate(async (code) => {
    try {
      const res = await fetch(`/api/rooms/${code}`);
      const data = await res.json();
      return data;
    } catch (e) {
      return { error: e.message };
    }
  }, roomCode);

  // 8. Inspect UI player controls / icons
  const uiState = await page.evaluate(() => {
    const playBtn = document.querySelector('#pp');
    const playBtnSvg = playBtn ? playBtn.innerHTML : null;
    const timeDisplay = document.querySelector('#time') || document.querySelector('.time');
    const timeText = timeDisplay ? timeDisplay.textContent : null;
    const emptyState = document.querySelector('#empty');
    const emptyVisible = emptyState ? window.getComputedStyle(emptyState).display !== 'none' : false;
    const sidebarCallText = document.querySelector('#inc')?.textContent;
    const topBarCount = document.querySelector('#n')?.textContent;
    const demoTiles = Array.from(document.querySelectorAll('.demo')).map((el) => el.textContent);
    const chatChips = Array.from(document.querySelectorAll('#ms .m')).map((el) => ({
      author: el.querySelector('b')?.textContent,
      text: el.querySelector('span')?.textContent,
    }));

    return {
      playBtnSvgSnippet: playBtnSvg?.substring(0, 150),
      timeText,
      emptyVisible,
      sidebarCallText,
      topBarCount,
      demoTiles,
      chatChips,
    };
  });

  await browser.close();

  const report = {
    fileType,
    roomCode,
    roomUrl,
    videoState,
    roomApiState: roomApiState?.room?.media || roomApiState,
    uiState,
    mediaRequests,
    failedRequests,
    consoleErrorsAndWarnings: consoleMessages.filter((m) => m.type === 'error' || m.type === 'warning'),
  };

  console.log(`\n--- DIAGNOSTIC SUMMARY FOR ${fileType.toUpperCase()} ---`);
  console.log(`Video element state:`, JSON.stringify(videoState, null, 2));
  console.log(`Room media state:`, JSON.stringify(report.roomApiState, null, 2));
  console.log(`UI state:`, JSON.stringify(uiState, null, 2));
  console.log(`Media requests count: ${mediaRequests.length}`);
  console.log(`Failed requests count: ${failedRequests.length}`);
  console.log(`Console errors/warnings count: ${report.consoleErrorsAndWarnings.length}`);

  return report;
}

async function run() {
  const mp4Report = await testPlayback('mp4', FIXTURES.mp4);
  const mkvReport = await testPlayback('mkv', FIXTURES.mkv);

  const outDir = process.env.ARTIFACTS_DIR || path.resolve('scratch');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'step1_diagnostics.json');
  fs.writeFileSync(outPath, JSON.stringify({ mp4Report, mkvReport }, null, 2));
  console.log(`\nDiagnostics report saved to ${outPath}`);
}

run().catch((err) => {
  console.error('Fatal error running Step 1 diagnosis:', err);
  process.exit(1);
});
