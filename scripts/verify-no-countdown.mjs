import { chromium } from 'playwright';
import { io } from 'socket.io-client';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve('docs/screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runNoCountdownVerification() {
  console.log('================================================================');
  console.log('       PLAYWRIGHT TEST: REMOVE RESUME COUNTDOWN OVERLAY        ');
  console.log('================================================================\n');

  // 1. Create Demo Room
  const demoRes = await fetch('http://localhost:4000/api/rooms/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Dev Host' }),
  });
  const demoData = await demoRes.json();
  const roomCode = demoData.room.roomCode;
  const hostSessionId = demoData.hostSessionId;
  const roomId = demoData.room.id;

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });

  const hostContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const guestContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });

  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  const assertions = [];
  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      assertions.push({ pass: false, message });
    } else {
      console.log(`✅ PASSED: ${message}`);
      assertions.push({ pass: true, message });
    }
  }

  // Set Host Session
  await hostPage.addInitScript(
    ({ rCode, sId }) => {
      sessionStorage.setItem('sw_name_' + rCode, 'Dev Host');
      sessionStorage.setItem('cineva_session_' + rCode, sId);
      sessionStorage.setItem('sessionId', sId);
    },
    { rCode: roomCode, sId: hostSessionId }
  );

  // Set Guest Session
  const guestSessionId = 'cineva_sess_guest_' + Date.now();
  await guestPage.addInitScript(
    ({ rCode, sId }) => {
      sessionStorage.setItem('sw_name_' + rCode, 'Maya Guest');
      sessionStorage.setItem('cineva_session_' + rCode, sId);
      sessionStorage.setItem('sessionId', sId);
    },
    { rCode: roomCode, sId: guestSessionId }
  );

  // Track any countdown elements ever inserted into DOM
  const setupCountdownTracker = async (page, name) => {
    await page.addInitScript(() => {
      window.__countdownEverAdded = false;
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {
              if (
                node.id === 'buffering-countdown-overlay' ||
                node.querySelector?.('#buffering-countdown-overlay') ||
                node.classList?.contains('countdown')
              ) {
                window.__countdownEverAdded = true;
              }
            }
          }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  };

  await setupCountdownTracker(hostPage, 'Host');
  await setupCountdownTracker(guestPage, 'Guest');

  // Navigate both to room
  await hostPage.goto(`http://localhost:5173/room/${roomCode}`, { waitUntil: 'networkidle' });
  await guestPage.goto(`http://localhost:5173/room/${roomCode}`, { waitUntil: 'networkidle' });
  await hostPage.waitForTimeout(1000);
  await guestPage.waitForTimeout(1000);

  // Mute both video elements so Chrome media policies do not throttle background playback
  await hostPage.evaluate(() => {
    const v = document.getElementById('v');
    if (v) v.muted = true;
  });
  await guestPage.evaluate(() => {
    const v = document.getElementById('v');
    if (v) v.muted = true;
  });

  // -------------------------------------------------------------
  // TEST 1: HOST SEEK & RESUME (NO COUNTDOWN, RESUME <= 1.5s)
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: SEEK & PLAYBACK RESUME ---');
  // Start playback on host
  const startBtn = hostPage.locator('button:has-text("Press play to start")');
  if (await startBtn.isVisible()) {
    await startBtn.click();
  } else {
    await hostPage.mouse.move(600, 400);
    await hostPage.waitForTimeout(200);
    await hostPage.locator('#pp').click({ force: true });
  }

  await hostPage.waitForTimeout(600);

  // Handle guest autoplay prompt if visible
  const guestStartBtn = guestPage.locator('button:has-text("Press play to start")');
  if (await guestStartBtn.isVisible()) {
    await guestStartBtn.click();
  } else {
    await guestPage.evaluate(() => {
      const v = document.getElementById('v');
      if (v) {
        v.muted = true;
        v.play().catch(() => {});
      }
    });
  }

  // Wait for initial playback to start
  await hostPage.waitForFunction(() => {
    const v = document.getElementById('v');
    return v && !v.paused;
  }, { timeout: 5000 });

  await guestPage.waitForFunction(() => {
    const v = document.getElementById('v');
    return v && !v.paused;
  }, { timeout: 5000 });

  await hostPage.waitForTimeout(1000);

  // Wake up stage controls and seek via +10s forward button
  await hostPage.mouse.move(600, 400);
  await hostPage.waitForTimeout(100);
  const postSeekTime = Date.now();
  await hostPage.locator('#fw').click({ force: true }); // jump forward 10s

  // Wait for playback to resume on both host and guest
  await hostPage.waitForFunction(() => {
    const v = document.getElementById('v');
    return v && !v.paused;
  }, { timeout: 3000 });

  await guestPage.waitForFunction(() => {
    const v = document.getElementById('v');
    return v && !v.paused;
  }, { timeout: 3000 });

  const resumeDuration = Date.now() - postSeekTime;
  assert(
    resumeDuration <= 1500,
    `Playback resumed within 1.5s after seek (actual: ${resumeDuration}ms)`
  );

  const countdownHost = await hostPage.evaluate(() => window.__countdownEverAdded);
  const countdownGuest = await guestPage.evaluate(() => window.__countdownEverAdded);
  assert(
    !countdownHost && !countdownGuest,
    'No element with countdown overlay was ever added to DOM during seek & resume'
  );

  // -------------------------------------------------------------
  // TEST 2: SIMULATED STALL & TOP PILL ("Waiting for Maya...")
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: BUFFER STALL & NON-BLOCKING TOP PILL ---');
  // Connect a separate socket for Maya to simulate stall directly
  const mayaSocket = io('http://localhost:4000', {
    transports: ['websocket'],
  });

  await new Promise((resolve) => {
    function doJoin() {
      mayaSocket.emit('room:join', {
        roomCode,
        displayName: 'Maya',
        sessionId: 'guest_maya_session_' + Date.now(),
      });
    }
    if (mayaSocket.connected) {
      doJoin();
    } else {
      mayaSocket.once('connect', doJoin);
    }
    mayaSocket.once('room:state', () => resolve());
  });

  await hostPage.waitForTimeout(300);

  mayaSocket.emit('playback:buffering_start', { position: 35 });
  console.log('Simulated buffer stall emitted for Maya...');
  await hostPage.waitForTimeout(400);

  // Check wait pill on host page
  const pill = hostPage.locator('#buffering-wait-overlay');
  await pill.waitFor({ state: 'visible', timeout: 3000 });
  const pillText = await pill.innerText();
  console.log(`Wait pill text: "${pillText.replace(/\n/g, ' ')}"`);
  assert(
    pillText.includes('Waiting for Maya'),
    `Wait pill correctly displays "Waiting for Maya" (found: "${pillText}")`
  );

  // Verify geometry: Non-blocking top pill (NEVER covers center of stage)
  const pillGeometry = await hostPage.evaluate(() => {
    const el = document.getElementById('buffering-wait-overlay');
    const stage = document.getElementById('stage');
    if (!el || !stage) return null;
    const r = el.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    const stageCenterY = sr.top + sr.height / 2;
    return {
      top: r.top - sr.top,
      height: r.height,
      stageHeight: sr.height,
      overlapsCenter: r.top <= stageCenterY && r.bottom >= stageCenterY,
    };
  });

  assert(
    pillGeometry && pillGeometry.top <= 50 && !pillGeometry.overlapsCenter,
    `Wait pill is small and positioned at top (top=${Math.round(pillGeometry?.top)}px, height=${Math.round(pillGeometry?.height)}px, overlapsCenter=${pillGeometry?.overlapsCenter})`
  );

  // Save screenshot of wait pill during stall
  await hostPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'stall_waiting_pill.png') });
  console.log('Saved screenshot: docs/screenshots/stall_waiting_pill.png');

  // Assert no countdown overlay exists during stall
  const countdownDuringStall = await hostPage.evaluate(() => document.getElementById('buffering-countdown-overlay'));
  assert(
    !countdownDuringStall,
    'No buffering countdown overlay exists during buffer stall'
  );

  // -------------------------------------------------------------
  // TEST 3: BUFFER READY -> IMMEDIATE RESUME & PILL DISAPPEAR
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: BUFFER READY & IMMEDIATE RESUME ---');
  const readyTime = Date.now();
  mayaSocket.emit('playback:buffering_ready', { position: 35 });

  // Wait for pill to disappear
  await pill.waitFor({ state: 'hidden', timeout: 2000 });
  const pillGoneTime = Date.now() - readyTime;
  assert(
    pillGoneTime <= 1000,
    `Wait pill disappears promptly after buffer ready (${pillGoneTime}ms)`
  );

  // Wait for playback to resume
  await hostPage.waitForFunction(() => {
    const v = document.getElementById('v');
    return v && !v.paused;
  }, { timeout: 2000 });

  const totalResumeTime = Date.now() - readyTime;
  assert(
    totalResumeTime <= 1500,
    `Room resumed within 1.5s after buffer ready (actual: ${totalResumeTime}ms)`
  );

  // Save screenshot of clean resume state (showing no countdown overlay in center)
  await hostPage.waitForTimeout(300);
  await hostPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'resume_no_countdown.png') });
  console.log('Saved screenshot: docs/screenshots/resume_no_countdown.png');

  // -------------------------------------------------------------
  // TEST 4: SYNC DRIFT AFTER RESUME (MEDIAN < 120ms)
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: SYNC DRIFT MEASUREMENT ---');
  const driftSamples = [];
  for (let i = 0; i < 10; i++) {
    await hostPage.waitForTimeout(200);
    const hostTime = await hostPage.evaluate(() => {
      const v = document.getElementById('v');
      return v ? v.currentTime : 0;
    });
    const guestTime = await guestPage.evaluate(() => {
      const v = document.getElementById('v');
      return v ? v.currentTime : 0;
    });
    const driftMs = Math.round(Math.abs(hostTime - guestTime) * 1000);
    driftSamples.push(driftMs);
  }

  driftSamples.sort((a, b) => a - b);
  const medianDrift = driftSamples[Math.floor(driftSamples.length / 2)];
  console.log(`Drift samples (ms): [${driftSamples.join(', ')}]`);
  console.log(`Median sync drift: ${medianDrift} ms`);

  assert(
    medianDrift <= 120,
    `Median sync drift after resume stays under 120ms (actual: ${medianDrift}ms)`
  );

  // Final check: confirm no countdown overlay was EVER added throughout entire test run
  const finalCountdownHost = await hostPage.evaluate(() => window.__countdownEverAdded);
  const finalCountdownGuest = await guestPage.evaluate(() => window.__countdownEverAdded);
  assert(
    !finalCountdownHost && !finalCountdownGuest,
    'Confirmed: zero countdown elements were added to the DOM across entire lifecycle'
  );

  mayaSocket.disconnect();
  await hostContext.close();
  await guestContext.close();
  await browser.close();

  const allPassed = assertions.every((a) => a.pass);
  console.log('\n================================================================');
  console.log(`NO-COUNTDOWN AUDIT SUMMARY: ${allPassed ? 'ALL TESTS PASSED ✅' : 'FAILURES OCCURRED ❌'}`);
  console.log(`Passed: ${assertions.filter((a) => a.pass).length} / ${assertions.length}`);
  console.log('================================================================');

  return allPassed;
}

runNoCountdownVerification()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
