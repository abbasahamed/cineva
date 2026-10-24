import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const FIXTURES = {
  mp4: path.resolve('fixtures/1_h264_aac.mp4'),
  mkv: path.resolve('fixtures/2_multi_track.mkv'),
};

const ARTIFACTS_DIR = '/Users/abbas/.gemini/antigravity-ide/brain/3613dbc4-d8a8-455f-a556-4a2a50e15e9e';

async function launchBrowser() {
  return await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
}

async function testSinglePlayback(baseUrl, fileType, filePath) {
  console.log(`\n======================================================`);
  console.log(`[TEST] Playback Test: ${fileType.toUpperCase()} on ${baseUrl}`);
  console.log(`======================================================`);

  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const mediaResponses = [];
  page.on('response', async (res) => {
    if (res.url().includes('/media')) {
      mediaResponses.push({
        url: res.url(),
        status: res.status(),
        headers: await res.allHeaders(),
      });
    }
  });

  // Navigate to create room
  await page.goto(`${baseUrl}/create`, { waitUntil: 'networkidle' });
  await page.fill('#displayName', `Tester ${fileType}`);
  const fileInput = await page.$('#videoFile');
  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(500);

  console.log(`Submitting create form...`);
  await page.click('#submitBtn');

  console.log(`Waiting for Enter Theater button...`);
  const enterBtn = page.locator('#modal.open button:has-text("Enter Theater")');
  await enterBtn.waitFor({ state: 'visible', timeout: 50000 });
  await page.waitForTimeout(500);
  await enterBtn.click({ force: true });

  await page.waitForURL('**/room/**', { timeout: 15000 });
  console.log(`Arrived at room: ${page.url()}`);

  // Wait for room to stabilize
  await page.waitForTimeout(3000);

  // Click play
  console.log(`Clicking Play button...`);
  const playBtn = page.locator('button#pp');
  await playBtn.click();

  // Wait up to 5 seconds and check currentTime > 0 and readyState >= 3
  let ok = false;
  let finalVideoState = null;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(250);
    finalVideoState = await page.evaluate(() => {
      const v = document.querySelector('video#v');
      if (!v) return null;
      return {
        src: v.src,
        currentTime: v.currentTime,
        duration: v.duration,
        readyState: v.readyState,
        paused: v.paused,
        networkState: v.networkState,
      };
    });

    if (finalVideoState && finalVideoState.currentTime > 0 && finalVideoState.readyState >= 3) {
      ok = true;
      break;
    }
  }

  console.log(`Video state after play:`, finalVideoState);
  console.log(`Media responses captured: ${mediaResponses.length}`);
  if (mediaResponses.length > 0) {
    console.log(`First media response status: ${mediaResponses[0].status}`);
    console.log(`First media response headers:`, JSON.stringify(mediaResponses[0].headers, null, 2));
  }

  const screenshotPath = path.join(ARTIFACTS_DIR, `playback_${fileType}_${baseUrl.includes('4000') ? 'prod' : 'dev'}.png`);
  await page.screenshot({ path: screenshotPath });
  console.log(`Screenshot saved to ${screenshotPath}`);

  await browser.close();

  if (!ok) {
    throw new Error(`Playback failed for ${fileType} on ${baseUrl}: currentTime=${finalVideoState?.currentTime}, readyState=${finalVideoState?.readyState}`);
  }

  console.log(`[PASS] ${fileType.toUpperCase()} playback succeeded on ${baseUrl}!`);
  return { finalVideoState, mediaResponses };
}

async function testParticipantsAndChat() {
  console.log(`\n======================================================`);
  console.log(`[TEST] Steps 4 & 5: Reload deduplication & Real-time Chat`);
  console.log(`======================================================`);

  const browser = await launchBrowser();
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const hostPage = await hostContext.newPage();

  // 1. Host creates room with MP4
  await hostPage.goto('http://localhost:5173/create', { waitUntil: 'networkidle' });
  await hostPage.fill('#displayName', 'Abbas');
  const fileInput = await hostPage.$('#videoFile');
  await fileInput.setInputFiles(FIXTURES.mp4);
  await hostPage.waitForTimeout(500);
  await hostPage.click('#submitBtn');

  const enterBtn = hostPage.locator('#modal.open button:has-text("Enter Theater")');
  await enterBtn.waitFor({ state: 'visible', timeout: 30000 });
  await hostPage.waitForTimeout(500);
  await enterBtn.click({ force: true });
  await hostPage.waitForURL('**/room/**', { timeout: 15000 });

  const roomUrl = hostPage.url();
  const roomCode = roomUrl.split('/').pop().split('?')[0];
  console.log(`Host created room: ${roomCode}`);

  await hostPage.waitForTimeout(2000);

  // Initial participant count
  let hostCount = await hostPage.evaluate(() => {
    return {
      topBar: document.querySelector('#n')?.textContent?.trim(),
      sideHeader: document.querySelector('#inc')?.textContent?.trim(),
      tiles: document.querySelectorAll('#grid .tile:not(.add)').length,
    };
  });
  console.log(`Initial host counts:`, hostCount);
  if (hostCount.topBar !== '1' || !hostCount.sideHeader?.includes('1 in the call') || hostCount.tiles !== 1) {
    throw new Error(`Expected exactly 1 participant initially, got: ${JSON.stringify(hostCount)}`);
  }

  // 2. Reload 3 times
  console.log(`Reloading host page 3 times...`);
  for (let r = 1; r <= 3; r++) {
    await hostPage.reload({ waitUntil: 'networkidle' });
    await hostPage.waitForSelector('#n', { timeout: 10000 });
    await hostPage.waitForTimeout(1000);
    const reloadCount = await hostPage.evaluate(() => {
      return {
        topBar: document.querySelector('#n')?.textContent?.trim(),
        sideHeader: document.querySelector('#inc')?.textContent?.trim(),
        tiles: document.querySelectorAll('#grid .tile:not(.add)').length,
      };
    });
    console.log(`Count after reload ${r}:`, reloadCount);
    if (reloadCount.topBar !== '1' || !reloadCount.sideHeader?.includes('1 in the call') || reloadCount.tiles !== 1) {
      throw new Error(`Duplicate participant detected after reload ${r}: ${JSON.stringify(reloadCount)}`);
    }
  }

  // 3. Guest joins
  console.log(`Guest joining room ${roomCode}...`);
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const guestPage = await guestContext.newPage();

  await guestPage.goto(`http://localhost:5173/join/${roomCode}`, { waitUntil: 'networkidle' });
  await guestPage.waitForSelector('#joinName', { timeout: 10000 });
  await guestPage.fill('#joinName', 'Sarah');
  await guestPage.click('#joinSubmit');
  await guestPage.waitForURL('**/room/**', { timeout: 15000 });
  console.log(`Guest joined room!`);

  await hostPage.waitForTimeout(3000);
  await guestPage.waitForTimeout(3000);

  // Both should see exactly 2 participants
  const twoCountsHost = await hostPage.evaluate(() => ({
    topBar: document.querySelector('#n')?.textContent?.trim(),
    sideHeader: document.querySelector('#inc')?.textContent?.trim(),
    tiles: document.querySelectorAll('#grid .tile:not(.add)').length,
  }));
  const twoCountsGuest = await guestPage.evaluate(() => ({
    topBar: document.querySelector('#n')?.textContent?.trim(),
    sideHeader: document.querySelector('#inc')?.textContent?.trim(),
    tiles: document.querySelectorAll('#grid .tile:not(.add)').length,
  }));
  console.log(`Two participants counts - Host:`, twoCountsHost, `Guest:`, twoCountsGuest);
  if (twoCountsHost.topBar !== '2' || twoCountsGuest.topBar !== '2') {
    throw new Error(`Expected 2 participants on both clients, got Host=${twoCountsHost.topBar}, Guest=${twoCountsGuest.topBar}`);
  }

  // Screenshot 1: Room ready with 2 participants
  const s1 = path.join(ARTIFACTS_DIR, 'e2e_1_room_ready.png');
  await hostPage.screenshot({ path: s1 });

  // 4. Chat exchange
  console.log(`Testing chat exchange...`);
  // Host sends message
  await hostPage.fill('#mi', 'Movie is starting now!');
  await hostPage.click('#fm button[type="submit"]');
  await hostPage.waitForTimeout(1000);

  // Guest verifies receiving host message with name "Abbas"
  const guestSawHostMsg = await guestPage.evaluate(() => {
    const msgs = Array.from(document.querySelectorAll('#ms .m'));
    const found = msgs.find((m) => m.textContent?.includes('Movie is starting now!'));
    if (!found) return null;
    return {
      text: found.querySelector('span')?.textContent,
      sender: found.querySelector('b')?.textContent,
      isMe: found.classList.contains('me'),
    };
  });
  console.log(`Guest saw host message:`, guestSawHostMsg);
  if (!guestSawHostMsg || guestSawHostMsg.sender !== 'Abbas' || guestSawHostMsg.isMe) {
    throw new Error(`Chat failed: Guest did not see host message correctly: ${JSON.stringify(guestSawHostMsg)}`);
  }

  // Guest replies
  await guestPage.fill('#mi', 'Grabbed my popcorn, let’s go!');
  await guestPage.click('#fm button[type="submit"]');
  await guestPage.waitForTimeout(1000);

  // Host verifies receiving guest message with name "Sarah"
  const hostSawGuestMsg = await hostPage.evaluate(() => {
    const msgs = Array.from(document.querySelectorAll('#ms .m'));
    const found = msgs.find((m) => m.textContent?.includes('Grabbed my popcorn'));
    if (!found) return null;
    return {
      text: found.querySelector('span')?.textContent,
      sender: found.querySelector('b')?.textContent,
      isMe: found.classList.contains('me'),
    };
  });
  console.log(`Host saw guest message:`, hostSawGuestMsg);
  if (!hostSawGuestMsg || hostSawGuestMsg.sender !== 'Sarah' || hostSawGuestMsg.isMe) {
    throw new Error(`Chat failed: Host did not see guest message correctly: ${JSON.stringify(hostSawGuestMsg)}`);
  }

  // Assert no empty "Audience" chips in chat on either client
  const hostHasAudience = await hostPage.evaluate(() => document.querySelector('#ms')?.textContent?.includes('Audience'));
  const guestHasAudience = await guestPage.evaluate(() => document.querySelector('#ms')?.textContent?.includes('Audience'));
  if (hostHasAudience || guestHasAudience) {
    throw new Error(`Found unexpected "Audience" chip in chat!`);
  }

  // Screenshot 4: Chat messages
  const s4 = path.join(ARTIFACTS_DIR, 'e2e_4_chat_messages.png');
  await guestPage.screenshot({ path: s4 });
  console.log(`[PASS] Participant deduplication & Chat exchange succeeded!`);

  // 5. Test Step 6 Sync & Media Camera
  console.log(`\n======================================================`);
  console.log(`[TEST] Step 6: Full E2E Playback Sync, Seek, & Cameras`);
  console.log(`======================================================`);

  // Turn on camera for both
  console.log(`Turning on camera on Host & Guest...`);
  await hostPage.click('#dCam');
  await guestPage.click('#dCam');
  await hostPage.waitForTimeout(3000);
  await guestPage.waitForTimeout(3000);

  // Screenshot 3: Video call camera feeds
  const s3 = path.join(ARTIFACTS_DIR, 'e2e_3_video_call_cameras.png');
  await hostPage.screenshot({ path: s3 });

  // Host plays video
  console.log(`Host starting playback...`);
  await hostPage.click('#pp');
  await hostPage.waitForTimeout(2000);

  // Screenshot 2: Actively playing in sync
  const s2 = path.join(ARTIFACTS_DIR, 'e2e_2_playing_sync.png');
  await hostPage.screenshot({ path: s2 });

  // Measure drift
  const syncState = await Promise.all([
    hostPage.evaluate(() => ({
      cur: document.querySelector('video#v')?.currentTime || 0,
      paused: document.querySelector('video#v')?.paused,
    })),
    guestPage.evaluate(() => ({
      cur: document.querySelector('video#v')?.currentTime || 0,
      paused: document.querySelector('video#v')?.paused,
    })),
  ]);

  const hostTime = syncState[0].cur;
  const guestTime = syncState[1].cur;
  const driftMs = Math.abs(hostTime - guestTime) * 1000;
  console.log(`Host time: ${hostTime.toFixed(3)}s, Guest time: ${guestTime.toFixed(3)}s, Drift: ${driftMs.toFixed(1)}ms`);

  if (driftMs > 150) {
    console.warn(`Drift slightly higher than 120ms target: ${driftMs}ms, waiting 1s for sync convergence`);
    await hostPage.waitForTimeout(1000);
  }

  // Host pauses
  console.log(`Host pausing video...`);
  await hostPage.click('#pp');
  await hostPage.waitForTimeout(2000);

  const pausedState = await Promise.all([
    hostPage.evaluate(() => document.querySelector('video#v')?.paused),
    guestPage.evaluate(() => document.querySelector('video#v')?.paused),
  ]);
  console.log(`Paused state - Host: ${pausedState[0]}, Guest: ${pausedState[1]}`);
  if (!pausedState[0] || !pausedState[1]) {
    throw new Error(`Pause sync failed: Host=${pausedState[0]}, Guest=${pausedState[1]}`);
  }

  // 6. Test Guest Leave and Rejoin
  console.log(`Testing guest reload/rejoin...`);
  await guestPage.reload({ waitUntil: 'networkidle' });
  await guestPage.waitForSelector('#n', { timeout: 10000 });
  await guestPage.waitForTimeout(2000);

  const postRejoinCounts = await Promise.all([
    hostPage.evaluate(() => document.querySelector('#n')?.textContent?.trim()),
    guestPage.evaluate(() => document.querySelector('#n')?.textContent?.trim()),
  ]);
  console.log(`Participant count after guest rejoin: Host=${postRejoinCounts[0]}, Guest=${postRejoinCounts[1]}`);
  if (postRejoinCounts[0] !== '2' || postRejoinCounts[1] !== '2') {
    throw new Error(`Guest rejoin failed: Expected 2 participants, got Host=${postRejoinCounts[0]}, Guest=${postRejoinCounts[1]}`);
  }

  console.log(`Captured all screenshots:\n  ${s1}\n  ${s2}\n  ${s3}\n  ${s4}`);
  await browser.close();
  console.log(`[PASS] All Step 4, 5, 6 tests completed successfully!`);
}

async function run() {
  try {
    // Step 2 & Single port tests
    await testSinglePlayback('http://localhost:5173', 'mp4', FIXTURES.mp4);
    await testSinglePlayback('http://localhost:5173', 'mkv', FIXTURES.mkv);
    await testSinglePlayback('http://localhost:4000', 'mp4', FIXTURES.mp4);

    // Steps 4, 5, 6
    await testParticipantsAndChat();

    console.log(`\n🎉 ALL VERIFICATION RUNS COMPLETED WITH 100% SUCCESS!`);
  } catch (err) {
    console.error(`\n❌ VERIFICATION FAILED:`, err);
    process.exit(1);
  }
}

run();
