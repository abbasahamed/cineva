import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const FIXTURE_PATH = path.join(ROOT, 'fixtures', '2_multi_track.mkv');
const API_BASE = 'http://localhost:4000/api';
const BASE_URL = 'http://localhost:5173';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createRoomViaApi(roomName, displayName) {
  const res = await fetch(`${API_BASE}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName, displayName }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Create room failed (${res.status}): ${txt}`);
  }
  const data = await res.json();
  return { room: data.room, hostSessionId: data.hostSessionId };
}

async function uploadFixtureToRoom(roomId, sessionId, filePath) {
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
  console.log('=== STEP 1 DIAGNOSIS: SUBTITLES HIDDEN BEHIND CONTROL BAR ===\n');

  console.log('[1/4] Creating room and uploading fixture...');
  const { room, hostSessionId } = await createRoomViaApi('Subtitle Diagnosis Room', 'Alice Host');
  console.log(`  Room Code: ${room.roomCode} | Room ID: ${room.id}`);

  await uploadFixtureToRoom(room.id, hostSessionId, FIXTURE_PATH);
  const mediaReady = await waitForMediaReady(room.roomCode);
  console.log('  Media ready! Subtitles available:', mediaReady.trackManifest?.subtitleTracks);

  console.log('\n[2/4] Launching Chrome (channel: chrome)...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.addInitScript(
    ({ roomCode, sessionId, displayName }) => {
      sessionStorage.setItem(`cineva_session_${roomCode}`, sessionId);
      sessionStorage.setItem(`sw_name_${roomCode}`, displayName);
    },
    { roomCode: room.roomCode, sessionId: hostSessionId, displayName: 'Alice Host' }
  );

  console.log('\n[3/4] Navigating to watch room and enabling English subtitles...');
  await page.goto(`${BASE_URL}/room/${room.roomCode}`);
  await page.waitForSelector('video', { timeout: 15000 });

  // Wait for video element ready
  await page.waitForFunction(() => {
    const v = document.querySelector('video');
    return v && (v.readyState >= 1 || v.duration > 0);
  }, { timeout: 20000 });

  // Open subtitles menu and select English
  console.log('  Opening subtitles menu...');
  await page.click('button[data-m="subs"]', { force: true });
  await page.waitForSelector('#mn', { timeout: 5000 });
  await page.click('#mn button:has-text("English")', { force: true });
  await sleep(1000);

  // Start playback
  await page.evaluate(() => {
    const v = document.querySelector('video');
    if (v) v.play();
  });
  await sleep(2000);

  // Measure bounding rects
  console.log('\n[4/4] Measuring bounding rectangles and stacking order...');
  const diagnosis = await page.evaluate(() => {
    const stage = document.getElementById('stage') || document.getElementById('st');
    const video = document.getElementById('v');
    const ctl = document.getElementById('ctl');
    const scrimBt = document.querySelector('.scrim.bt');

    const stageRect = stage ? stage.getBoundingClientRect() : null;
    const videoRect = video ? video.getBoundingClientRect() : null;
    const ctlRect = ctl ? ctl.getBoundingClientRect() : null;
    const scrimRect = scrimBt ? scrimBt.getBoundingClientRect() : null;

    // Check tracks and active cues
    const tracksInfo = [];
    if (video && video.textTracks) {
      for (let i = 0; i < video.textTracks.length; i++) {
        const t = video.textTracks[i];
        const active = [];
        if (t.activeCues) {
          for (let j = 0; j < t.activeCues.length; j++) {
            active.push({
              text: t.activeCues[j].text,
              startTime: t.activeCues[j].startTime,
              endTime: t.activeCues[j].endTime,
            });
          }
        }
        tracksInfo.push({
          index: i,
          label: t.label,
          language: t.language,
          mode: t.mode,
          activeCues: active,
        });
      }
    }

    // Computed styles and z-indices
    const stageStyle = stage ? window.getComputedStyle(stage) : null;
    const videoStyle = video ? window.getComputedStyle(video) : null;
    const ctlStyle = ctl ? window.getComputedStyle(ctl) : null;

    // Check which element is returned at the center bottom of the control bar
    let topElementAtCtlCenter = null;
    if (ctlRect) {
      const centerX = ctlRect.left + ctlRect.width / 2;
      const centerY = ctlRect.top + ctlRect.height / 2;
      const elems = document.elementsFromPoint(centerX, centerY);
      topElementAtCtlCenter = elems.map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + el.className.split(' ').join('.') : ''}`);
    }

    return {
      stageRect: stageRect ? { x: stageRect.x, y: stageRect.y, width: stageRect.width, height: stageRect.height, top: stageRect.top, bottom: stageRect.bottom } : null,
      videoRect: videoRect ? { x: videoRect.x, y: videoRect.y, width: videoRect.width, height: videoRect.height, top: videoRect.top, bottom: videoRect.bottom } : null,
      ctlRect: ctlRect ? { x: ctlRect.x, y: ctlRect.y, width: ctlRect.width, height: ctlRect.height, top: ctlRect.top, bottom: ctlRect.bottom } : null,
      scrimRect: scrimRect ? { x: scrimRect.x, y: scrimRect.y, width: scrimRect.width, height: scrimRect.height, top: scrimRect.top, bottom: scrimRect.bottom } : null,
      stacking: {
        stageZIndex: stageStyle?.zIndex,
        videoZIndex: videoStyle?.zIndex,
        ctlZIndex: ctlStyle?.zIndex,
        ctlPosition: ctlStyle?.position,
        ctlBottom: ctlStyle?.bottom,
      },
      tracksInfo,
      topElementAtCtlCenter,
    };
  });

  console.log('Diagnosis Data:');
  console.log(JSON.stringify(diagnosis, null, 2));

  // Capture before screenshot showing controls over video
  const screenshotsDir = path.join(ROOT, 'docs', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // 1440px with controls visible
  await page.screenshot({ path: path.join(screenshotsDir, 'subtitles_before_1440_controls_visible.png') });
  console.log('  Saved screenshot: docs/screenshots/subtitles_before_1440_controls_visible.png');

  // Let player go idle to capture with controls hidden
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    // Force idle by simulating idle class
    const st = document.getElementById('st');
    if (st) st.classList.add('idle');
  });
  await sleep(600);
  await page.screenshot({ path: path.join(screenshotsDir, 'subtitles_before_1440_controls_hidden.png') });
  console.log('  Saved screenshot: docs/screenshots/subtitles_before_1440_controls_hidden.png');

  // 360px viewport
  await page.setViewportSize({ width: 360, height: 740 });
  await page.evaluate(() => {
    const st = document.getElementById('st');
    if (st) st.classList.remove('idle');
  });
  await sleep(600);
  await page.screenshot({ path: path.join(screenshotsDir, 'subtitles_before_360_controls_visible.png') });
  console.log('  Saved screenshot: docs/screenshots/subtitles_before_360_controls_visible.png');

  await page.evaluate(() => {
    const st = document.getElementById('st');
    if (st) st.classList.add('idle');
  });
  await sleep(600);
  await page.screenshot({ path: path.join(screenshotsDir, 'subtitles_before_360_controls_hidden.png') });
  console.log('  Saved screenshot: docs/screenshots/subtitles_before_360_controls_hidden.png');

  await context.close();
  await browser.close();
  console.log('\n✅ Step 1 Diagnosis complete.');
}

run().catch((err) => {
  console.error('Diagnosis failed:', err);
  process.exit(1);
});
