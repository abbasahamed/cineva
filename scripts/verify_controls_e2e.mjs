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

  // Test clicking Subtitles button
  const subBtn = page.locator('#sub-btn');
  await subBtn.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Clicking Subtitles button (#sub-btn)...');
  await subBtn.click();

  // Verify controls REMAIN visible at t = 300ms, t = 500ms, t = 1000ms
  await page.waitForTimeout(300);
  let stageClass = await stage.getAttribute('class');
  console.log(`At t = 300ms, stage class: "${stageClass}"`);
  if (stageClass?.includes('idle')) throw new Error('FAIL: Controls hid at t=300ms!');

  await page.waitForTimeout(200);
  stageClass = await stage.getAttribute('class');
  console.log(`At t = 500ms, stage class: "${stageClass}"`);
  if (stageClass?.includes('idle')) throw new Error('FAIL: Controls hid at t=500ms!');

  await page.waitForTimeout(500);
  stageClass = await stage.getAttribute('class');
  console.log(`At t = 1000ms, stage class: "${stageClass}"`);
  if (stageClass?.includes('idle')) throw new Error('FAIL: Controls hid at t=1000ms!');

  // Popover menu #mn should be open
  const mn = page.locator('#mn');
  await mn.waitFor({ state: 'visible', timeout: 3000 });
  console.log('Subtitle popover menu #mn is visible.');

  // Save screenshot of open subtitle menu with visible control bar
  const screenshotPath =
    '/Users/abbas/.gemini/antigravity-ide/brain/3613dbc4-d8a8-455f-a556-4a2a50e15e9e/controls_subtitles_menu_open.png';
  await page.screenshot({ path: screenshotPath });
  console.log(`Saved screenshot: ${screenshotPath}`);

  // Hover over #ctl
  console.log('Hovering over #ctl for 4000ms...');
  await ctl.hover();
  await page.waitForTimeout(4000);
  let stageClassHover = await stage.getAttribute('class');
  console.log(`After 4000ms hovering #ctl, stage class: "${stageClassHover}"`);
  if (stageClassHover?.includes('idle')) throw new Error('FAIL: Controls hid during hover!');

  console.log('--- ALL PLAYWRIGHT E2E CHECKS PASSED! ---');
  await browser.close();
}

run().catch((err) => {
  console.error('Playwright verification error:', err);
  process.exit(1);
});
