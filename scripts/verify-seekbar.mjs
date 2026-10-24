import { chromium } from 'playwright';
import path from 'node:path';
import assert from 'node:assert';

const FIXTURES = {
  mp4: path.resolve('fixtures/1_h264_aac.mp4'),
  mkv: path.resolve('fixtures/2_multi_track.mkv'),
};

async function createRoom(browser, filePath, name = 'Host') {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['camera', 'microphone'],
  });
  const page = await context.newPage();

  console.log(`[${name}] Navigating to /create...`);
  await page.goto('http://localhost:5173/create', { waitUntil: 'networkidle' });
  await page.fill('#displayName', name);
  const fileInput = await page.$('#videoFile');
  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(500);
  await page.click('#submitBtn');

  console.log(`[${name}] Waiting for transcode & Enter Theater...`);
  const enterBtn = page.locator('#modal.open button:has-text("Enter Theater")');
  await enterBtn.waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(600);
  await enterBtn.click({ force: true });
  await page.waitForURL('**/room/**', { timeout: 20000 });

  const roomUrl = page.url();
  console.log(`[${name}] Room URL: ${roomUrl}`);
  await page.waitForTimeout(2000);
  return { context, page, roomUrl };
}

async function joinGuest(browser, roomUrl, guestName = 'Sarah') {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['camera', 'microphone'],
  });
  const page = await context.newPage();
  console.log(`[${guestName}] Joining room ${roomUrl}...`);
  await page.goto(roomUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#joinName', { timeout: 15000 });
  await page.fill('#joinName', guestName);
  await page.click('#joinSubmit');
  await page.waitForSelector('#stage', { timeout: 15000 });
  await page.waitForTimeout(1500);
  return { context, page };
}

async function verifyRoomPlayback(fixtureType, fixturePath) {
  console.log(`\n========================================`);
  console.log(`VERIFYING SEEKBAR WITH ${fixtureType.toUpperCase()} FIXTURE`);
  console.log(`========================================`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  try {
    const host = await createRoom(browser, fixturePath, 'Host');
    const hostPage = host.page;

    // Wake controls
    await hostPage.mouse.move(500, 500);
    await hostPage.waitForTimeout(500);

    // 1. Verify Cineva logo mark
    const logoStyles = await hostPage.evaluate(() => {
      const mk = document.querySelector('.mk');
      const svg = document.querySelector('.mk svg');
      if (!mk) return null;
      const s = window.getComputedStyle(mk);
      const svgS = svg ? window.getComputedStyle(svg) : null;
      return {
        background: s.backgroundImage || s.background,
        color: s.color,
        borderRadius: s.borderRadius,
        width: s.width,
        height: s.height,
        svgStroke: svgS?.stroke,
      };
    });
    console.log('Logo mark styles:', logoStyles);
    assert(logoStyles, 'Logo mark (.mk) must exist in DOM');
    assert(logoStyles.background.includes('gradient') || logoStyles.background.includes('255'), 'Logo mark must have light gradient background');
    assert.strictEqual(logoStyles.height, '30px', 'Logo mark height must be 30px');

    // 2. Verify Seekbar DOM, bounding box & computed styles
    const seekInfo = await hostPage.evaluate(() => {
      const ctl = document.querySelector('#ctl');
      const seek = document.querySelector('#seek');
      const buf = document.querySelector('#buf');
      const pl = document.querySelector('#pl');
      const tip = document.querySelector('#tip');
      if (!seek || !ctl) return null;

      const ctlR = ctl.getBoundingClientRect();
      const seekR = seek.getBoundingClientRect();
      const seekS = window.getComputedStyle(seek);
      const beforeS = window.getComputedStyle(seek, '::before');
      const ctlS = window.getComputedStyle(ctl);

      return {
        ctlRect: { width: ctlR.width, height: ctlR.height },
        ctlDisplay: ctlS.display,
        ctlFlexDirection: ctlS.flexDirection,
        seekRect: { width: seekR.width, height: seekR.height, top: seekR.top, left: seekR.left },
        seekDisplay: seekS.display,
        seekHeight: parseFloat(seekS.height),
        beforeHeight: parseFloat(beforeS.height),
        beforeBackground: beforeS.backgroundColor || beforeS.background,
        ariaRole: seek.getAttribute('role'),
        ariaValuenow: seek.getAttribute('aria-valuenow'),
      };
    });

    console.log('Seek bar layout info:', seekInfo);
    assert(seekInfo, 'Seek element (#seek) must exist inside #ctl');
    assert(seekInfo.seekRect.width >= 300, `Seek bar width (${seekInfo.seekRect.width}px) must be full width`);
    assert(seekInfo.seekHeight >= 20, `Seek bar height (${seekInfo.seekHeight}px) must be >= 20px`);
    assert(seekInfo.beforeHeight >= 4, `Seek bar track height (${seekInfo.beforeHeight}px) must be >= 4px`);
    assert.strictEqual(seekInfo.ctlFlexDirection, 'column', '#ctl flex-direction must be column');

    // 3. Verify vertical alignment of time text, icon buttons, and Mic/Camera buttons
    const alignment = await hostPage.evaluate(() => {
      const tm = document.querySelector('#tm');
      const pp = document.querySelector('#pp');
      const bk = document.querySelector('#bk');
      const fw = document.querySelector('#fw');
      const dMic = document.querySelector('#dMic');
      const dCam = document.querySelector('#dCam');

      const getCenterY = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      };

      return {
        tmCenterY: getCenterY(tm),
        ppCenterY: getCenterY(pp),
        bkCenterY: getCenterY(bk),
        fwCenterY: getCenterY(fw),
        dMicCenterY: getCenterY(dMic),
        dCamCenterY: getCenterY(dCam),
      };
    });

    console.log('Vertical alignment centers:', alignment);
    assert(alignment.tmCenterY !== null && alignment.bkCenterY !== null, 'Control buttons must exist');
    const controlDelta = Math.abs(alignment.tmCenterY - alignment.bkCenterY);
    console.log(`Delta between time text and icon button center: ${controlDelta}px`);
    assert(controlDelta <= 1.5, `Time text and icon buttons must share one center line (delta ${controlDelta} <= 1.5px)`);

    if (alignment.dMicCenterY !== null && alignment.dCamCenterY !== null) {
      const micCamDelta = Math.abs(alignment.dMicCenterY - alignment.dCamCenterY);
      console.log(`Delta between Mic and Camera button center: ${micCamDelta}px`);
      assert(micCamDelta <= 1, `Mic and Camera buttons must share one center line (delta ${micCamDelta} <= 1px)`);
    }

    // 4. Start playback
    await hostPage.click('#pp');
    await hostPage.waitForTimeout(1000);

    const videoState = await hostPage.evaluate(() => {
      const v = document.querySelector('video#v');
      return {
        currentTime: v.currentTime,
        duration: v.duration,
        paused: v.paused,
      };
    });
    console.log('Video state after play:', videoState);
    assert(!videoState.paused, 'Video should be playing');
    assert(videoState.duration > 0, 'Duration should be positive');

    // 5. Connect Guest Browser to verify sync
    const guest = await joinGuest(browser, host.roomUrl, 'GuestObserver');
    const guestPage = guest.page;

    // 6. Test Hover tooltip
    const seekBox = await hostPage.locator('#seek').boundingBox();
    assert(seekBox, 'Seek bar bounding box must be available');
    const hoverX = seekBox.x + seekBox.width * 0.5;
    const hoverY = seekBox.y + seekBox.height * 0.5;
    await hostPage.mouse.move(hoverX, hoverY);
    await hostPage.waitForTimeout(300);

    const tipData = await hostPage.evaluate(() => {
      const tip = document.querySelector('#tip');
      const s = window.getComputedStyle(tip);
      return {
        text: tip.textContent.trim(),
        opacity: parseFloat(s.opacity),
      };
    });
    console.log('Hover tooltip at 50%:', tipData);
    assert(tipData.opacity > 0.5, 'Tooltip must be visible on hover');
    assert(tipData.text.length > 0, 'Tooltip text must not be empty');

    // 7. Click at 50% seek bar
    console.log('Clicking seekbar at 50%...');
    await hostPage.mouse.click(hoverX, hoverY);
    await hostPage.waitForTimeout(1000);

    const hostTimeAfterClick = await hostPage.evaluate(() => document.querySelector('video#v').currentTime);
    const expectedTime = videoState.duration * 0.5;
    console.log(`Host time after 50% seek: ${hostTimeAfterClick}s (expected ~${expectedTime}s)`);
    assert(Math.abs(hostTimeAfterClick - expectedTime) <= 1.2, `Host currentTime (${hostTimeAfterClick}) should be ~${expectedTime}`);

    // Verify Guest jumps to the same time within 1s
    const guestTime = await guestPage.evaluate(() => document.querySelector('video#v')?.currentTime || 0);
    console.log(`Guest time after host 50% seek: ${guestTime}s`);
    assert(Math.abs(guestTime - hostTimeAfterClick) <= 1.5, `Guest should synchronize with host within 1.5s (guest: ${guestTime}, host: ${hostTimeAfterClick})`);

    // 8. Test Drag seek
    console.log('Testing drag seek from 30% to 70%...');
    const dragStartX = seekBox.x + seekBox.width * 0.3;
    const dragEndX = seekBox.x + seekBox.width * 0.7;
    await hostPage.mouse.move(dragStartX, hoverY);
    await hostPage.mouse.down();
    await hostPage.mouse.move(dragEndX, hoverY, { steps: 5 });
    await hostPage.mouse.up();
    await hostPage.waitForTimeout(1000);

    const hostTimeAfterDrag = await hostPage.evaluate(() => document.querySelector('video#v').currentTime);
    const expectedDragTime = videoState.duration * 0.7;
    console.log(`Host time after drag seek: ${hostTimeAfterDrag}s (expected ~${expectedDragTime}s)`);
    assert(Math.abs(hostTimeAfterDrag - expectedDragTime) <= 1.5, `Host currentTime after drag (${hostTimeAfterDrag}) should be ~${expectedDragTime}`);

    // 9. Test Keyboard navigation: Left/Right arrow
    console.log('Testing keyboard Left/Right arrows on seek bar...');
    await hostPage.focus('#seek');
    const timeBeforeKey = await hostPage.evaluate(() => document.querySelector('video#v').currentTime);
    await hostPage.keyboard.press('ArrowLeft');
    await hostPage.waitForTimeout(500);
    const timeAfterLeft = await hostPage.evaluate(() => document.querySelector('video#v').currentTime);
    console.log(`Keyboard ArrowLeft: ${timeBeforeKey}s -> ${timeAfterLeft}s`);
    assert(timeAfterLeft <= timeBeforeKey, 'ArrowLeft must seek backward');

    await hostPage.keyboard.press('ArrowRight');
    await hostPage.waitForTimeout(500);
    const timeAfterRight = await hostPage.evaluate(() => document.querySelector('video#v').currentTime);
    console.log(`Keyboard ArrowRight: ${timeAfterLeft}s -> ${timeAfterRight}s`);
    assert(timeAfterRight >= timeAfterLeft, 'ArrowRight must seek forward');

    // 10. Capture Screenshots for MP4 fixture (at 1440 and 360)
    if (fixtureType === 'mp4') {
      console.log('Capturing screenshots for 1440 and 360...');
      await hostPage.mouse.move(500, 500); // wake controls
      await hostPage.waitForTimeout(400);
      await hostPage.screenshot({ path: 'docs/screenshots/seek_after_1440.png' });

      await hostPage.setViewportSize({ width: 360, height: 800 });
      await hostPage.mouse.move(180, 400);
      await hostPage.waitForTimeout(600);
      await hostPage.screenshot({ path: 'docs/screenshots/seek_after_360.png' });
      console.log('Saved docs/screenshots/seek_after_1440.png and seek_after_360.png');
    }

    console.log(`PASSED: All checks succeeded for ${fixtureType}!`);
    await guest.context.close();
    await host.context.close();
  } finally {
    await browser.close();
  }
}

async function runAll() {
  await verifyRoomPlayback('mp4', FIXTURES.mp4);
  await verifyRoomPlayback('mkv', FIXTURES.mkv);
  console.log('\n========================================');
  console.log('ALL PLAYWRIGHT TESTS PASSED (MP4 & MKV)!');
  console.log('========================================\n');
}

runAll().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
