import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const FIXTURE_PATH = path.join(ROOT, 'fixtures', '2_multi_track.mkv');
const API_BASE = 'http://localhost:4000/api';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function uploadFixture(roomId, sessionId, filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const formData = new FormData();
  formData.append('roomId', roomId);
  formData.append('sessionId', sessionId);
  formData.append('video', new Blob([fileBuffer], { type: 'video/x-matroska' }), path.basename(filePath));

  const res = await fetch(`${API_BASE}/media/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Upload fixture failed (${res.status}): ${txt}`);
  }
  return await res.json();
}

async function waitForMediaReady(roomCode, maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${API_BASE}/rooms/${roomCode}`);
    if (res.ok) {
      const room = await res.json();
      if (room.media && room.media.status === 'ready') {
        return room.media;
      }
    }
    await sleep(500);
  }
  throw new Error(`Timeout waiting for media to become ready in room ${roomCode}`);
}

async function run() {
  console.log('--- Starting Playwright End-to-End Controls Verification ---');

  // 1. Create a test room
  const createRes = await fetch(`${API_BASE}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Controls Tester',
      roomName: 'Controls Room',
      allowGuestControl: true,
    }),
  });
  const createData = await createRes.json();
  const room = createData.room;
  const hostSessionId = createData.hostSessionId;
  console.log(`Room created: ${room.roomCode} (ID: ${room.id})`);

  // 2. Upload video fixture
  console.log('Uploading multi-track fixture...');
  await uploadFixture(room.id, hostSessionId, FIXTURE_PATH);
  console.log('Waiting for transcoding / packaging...');
  await waitForMediaReady(room.roomCode);
  console.log('Media ready!');

  // 3. Launch Chrome browser with host credentials
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--use-fake-ui-for-media-stream', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Set session storage credentials so user lands directly inside the room
  await page.addInitScript(
    ({ code, sid }) => {
      sessionStorage.setItem(`cineva_session_${code}`, sid);
      sessionStorage.setItem(`sw_name_${code}`, 'Controls Tester');
    },
    { code: room.roomCode, sid: hostSessionId }
  );

  // Navigate to room
  await page.goto(`http://localhost:5173/room/${room.roomCode}`);
  await page.waitForLoadState('networkidle');

  // Wait for stage & ctl to render
  const stage = page.locator('#stage');
  await stage.waitFor({ state: 'visible', timeout: 15000 });
  const ctl = page.locator('#ctl');
  await ctl.waitFor({ state: 'visible', timeout: 15000 });
  console.log('Stage and Control Bar visible.');

  // Verify quality, speed, shortcuts buttons are REMOVED from the bar
  const qlCount = await page.locator('#ql').count();
  const speedCount = await page.locator('[data-m="speed"]').count();
  const shortcutsCount = await page.locator('#shortcuts-btn').count();
  console.log(`Removed buttons count -> Quality: ${qlCount}, Speed: ${speedCount}, Shortcuts: ${shortcutsCount}`);
  if (qlCount !== 0 || speedCount !== 0 || shortcutsCount !== 0) {
    throw new Error('FAIL: Quality, Speed, or Shortcuts button still present in control bar!');
  }

  // Test clicking Subtitles button
  const subBtn = page.locator('#sub-btn');
  await subBtn.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Clicking Subtitles button (#sub-btn)...');
  await subBtn.click();

  // Verify controls REMAIN visible for 5s after clicking (at t = 1000ms, t = 3500ms)
  await page.waitForTimeout(1000);
  let stageClass = await stage.getAttribute('class');
  console.log(`At t = 1000ms after click, stage class: "${stageClass}"`);
  if (stageClass?.includes('idle')) throw new Error('FAIL: Controls hid at t=1000ms!');

  await page.waitForTimeout(2500);
  stageClass = await stage.getAttribute('class');
  console.log(`At t = 3500ms after click, stage class: "${stageClass}"`);
  if (stageClass?.includes('idle')) throw new Error('FAIL: Controls hid at t=3500ms!');

  // Popover menu #mn should be open
  const mn = page.locator('#mn');
  await mn.waitFor({ state: 'visible', timeout: 3000 });
  console.log('Subtitle popover menu #mn is visible.');

  // Save screenshot of open subtitle menu with updated control bar
  const artifactsDir = process.env.ARTIFACTS_DIR || path.join(ROOT, 'scratch');
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
  const screenshotPath = path.join(artifactsDir, 'controls_updated_bar.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`Saved screenshot: ${screenshotPath}`);

  // Wait until 5300ms without cursor movement -> whole bar and menu should disappear
  console.log('Waiting for 5-second timer to expire (cursor stopped)...');
  await page.waitForTimeout(2000);
  stageClass = await stage.getAttribute('class');
  console.log(`After 5.5s with cursor stopped, stage class: "${stageClass}"`);
  if (!stageClass?.includes('idle')) throw new Error('FAIL: Controls did not disappear after 5s idle!');

  // Move cursor -> controls should wake freshly
  console.log('Moving cursor to wake controls freshly...');
  await page.mouse.move(500, 400);
  await page.waitForTimeout(100);
  stageClass = await stage.getAttribute('class');
  console.log(`After cursor move, stage class: "${stageClass}"`);
  if (stageClass?.includes('idle')) throw new Error('FAIL: Controls did not wake freshly on cursor move!');

  console.log('--- ALL PLAYWRIGHT E2E CHECKS PASSED! ---');
  await browser.close();
}

run().catch((err) => {
  console.error('Playwright verification error:', err);
  process.exit(1);
});
