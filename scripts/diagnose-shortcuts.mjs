import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const FIXTURE_PATH = path.join(ROOT, 'fixtures', '1_h264_aac.mp4');
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
  formData.append('video', new Blob([fileBuffer], { type: 'video/mp4' }), path.basename(filePath));

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

async function waitForMediaReady(roomCode, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${API_BASE}/rooms/${roomCode}`);
    if (res.ok) {
      const data = await res.json();
      if (data.room && data.room.media && data.room.media.status === 'ready') {
        return data.room;
      }
    }
    await sleep(500);
  }
  throw new Error('Timed out waiting for media ready');
}

async function runDiagnosis() {
  console.log('================================================================');
  console.log('   STEP 1: PLAYBACK SHORTCUTS DIAGNOSIS (SITUATIONS a - g)     ');
  console.log('================================================================\n');

  console.log('[1/4] Creating room and uploading fixture...');
  const { room, hostSessionId } = await createRoomViaApi('Diagnose Shortcuts', 'Host Tester');
  const roomCode = room.roomCode;
  console.log(`  Room Code: ${roomCode} | Room ID: ${room.id}`);
  await uploadFixtureToRoom(room.id, hostSessionId, FIXTURE_PATH);
  await waitForMediaReady(roomCode);
  console.log('  Fixture uploaded and media ready.\n');

  console.log('[2/4] Launching Google Chrome...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  // Install instrumentation script to record keydown events
  await page.addInitScript(({ roomCode, sessionId }) => {
    sessionStorage.setItem(`sw_name_${roomCode}`, 'Host Tester');
    sessionStorage.setItem(`cineva_session_${roomCode}`, sessionId);

    window.__lastKeyDown = null;
    window.addEventListener('keydown', (e) => {
      window.__lastKeyDown = {
        key: e.key,
        code: e.code,
        keyCode: e.keyCode,
        defaultPrevented: e.defaultPrevented,
        activeElementTag: document.activeElement ? document.activeElement.tagName : null,
        activeElementId: document.activeElement ? document.activeElement.id : null,
        activeElementClass: document.activeElement ? document.activeElement.className : null,
      };
    }, true);
  }, { roomCode, sessionId: hostSessionId });

  await page.goto(`${BASE_URL}/room/${roomCode}`);
  await page.waitForSelector('video#v', { timeout: 15000 });
  await page.waitForFunction(() => {
    const v = document.querySelector('video#v');
    return v && v.readyState >= 2 && v.duration > 0;
  }, { timeout: 15000 });

  console.log('  Video loaded and ready.\n');

  // Helper to test pressing ArrowRight
  async function testSituation(name, prepareFn) {
    console.log(`--- Testing Situation: ${name} ---`);
    if (prepareFn) await prepareFn();

    const beforeState = await page.evaluate(() => {
      const v = document.querySelector('video#v');
      return {
        currentTime: v ? v.currentTime : null,
        duration: v ? v.duration : null,
        paused: v ? v.paused : null,
        activeElementTag: document.activeElement ? document.activeElement.tagName : null,
        activeElementId: document.activeElement ? document.activeElement.id : null,
        activeElementClass: document.activeElement ? document.activeElement.className : null,
      };
    });

    // Clear recorded event
    await page.evaluate(() => { window.__lastKeyDown = null; });

    // Press ArrowRight
    await page.keyboard.press('ArrowRight');
    await sleep(200);

    const afterState = await page.evaluate(() => {
      const v = document.querySelector('video#v');
      return {
        currentTime: v ? v.currentTime : null,
        lastKeyDown: window.__lastKeyDown,
      };
    });

    const delta = (afterState.currentTime ?? 0) - (beforeState.currentTime ?? 0);
    console.log(`  Initial activeElement: <${beforeState.activeElementTag} id="${beforeState.activeElementId}" class="${beforeState.activeElementClass}">`);
    console.log(`  Before currentTime: ${beforeState.currentTime}s`);
    console.log(`  After currentTime:  ${afterState.currentTime}s (delta: ${delta}s)`);
    console.log(`  event.defaultPrevented: ${afterState.lastKeyDown?.defaultPrevented}`);
    console.log(`  Changed by ~10s? ${Math.abs(delta - 10) < 0.5 ? 'YES' : 'NO'}\n`);

    return {
      name,
      before: beforeState,
      after: afterState,
      delta,
      changed: Math.abs(delta - 10) < 0.5,
    };
  }

  const results = [];

  // (a) fresh load, focus on body
  results.push(await testSituation('(a) fresh load, focus on body', async () => {
    await page.evaluate(() => document.body.focus());
  }));

  // (b) right after clicking the play button
  results.push(await testSituation('(b) right after clicking play button', async () => {
    const playBtn = page.locator('#pp');
    await playBtn.click();
    await sleep(200);
  }));

  // (c) right after clicking the +10s button
  results.push(await testSituation('(c) right after clicking +10s button (#fw)', async () => {
    const fwBtn = page.locator('#fw');
    await fwBtn.click();
    await sleep(200);
  }));

  // (d) after clicking on the video
  results.push(await testSituation('(d) after clicking on the video (#v)', async () => {
    const video = page.locator('video#v');
    await video.click();
    await sleep(200);
  }));

  // (e) after sending a chat message
  results.push(await testSituation('(e) with focus on chat input', async () => {
    const chatInput = page.locator('.chat-composer input, .side-card-chat input');
    if (await chatInput.count() > 0) {
      await chatInput.first().focus();
    }
  }));

  // (f) with focus on seek bar
  results.push(await testSituation('(f) with focus on the seek bar (#seek)', async () => {
    const seek = page.locator('#seek');
    if (await seek.count() > 0) {
      await seek.first().focus();
    }
  }));

  // (g) with focus on the volume slider
  results.push(await testSituation('(g) with focus on volume slider (#vr)', async () => {
    const vr = page.locator('#vr');
    if (await vr.count() > 0) {
      await vr.first().focus();
    }
  }));

  console.log('================================================================');
  console.log('                     DIAGNOSIS SUMMARY                          ');
  console.log('================================================================');
  console.table(results.map(r => ({
    Situation: r.name,
    'Active Element': `<${r.before.activeElementTag} id="${r.before.activeElementId}">`,
    'Before (s)': r.before.currentTime,
    'After (s)': r.after.currentTime,
    'Delta (s)': r.delta,
    'Default Prevented': r.after.lastKeyDown?.defaultPrevented,
    'Seek Worked': r.changed,
  })));

  await browser.close();
}

runDiagnosis().catch((err) => {
  console.error('Diagnosis error:', err);
  process.exit(1);
});
