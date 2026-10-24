import { chromium } from 'playwright';
import { attachConsoleGuard } from './verify-console-guards.mjs';

async function run() {
  console.log('--- STARTING STEP 5 VERIFICATION (PLAYING CONTROLS, GESTURES, OVERLAYS) ---');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 412, height: 924 },
      deviceScaleFactor: 2.625,
      isMobile: true,
      hasTouch: true,
    });

    const page = await context.newPage();
    const guard = attachConsoleGuard(page);

    // 1. Create room
    const res = await fetch('http://localhost:4000/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Abbas Host', roomName: "Abbas's Room" }),
    });
    const data = await res.json();
    const roomCode = data.room.roomCode;
    const sessionId = data.hostSessionId;

    // Attach sample media
    const sampleRes = await fetch(`http://localhost:4000/api/rooms/${roomCode}/sample-media`, {
      method: 'POST',
    });
    if (!sampleRes.ok) throw new Error('Failed to attach sample media');

    await page.addInitScript(
      ({ rCode, sId }) => {
        sessionStorage.setItem('sw_name_' + rCode, 'Abbas Host');
        sessionStorage.setItem('cineva_session_' + rCode, sId);
      },
      { rCode: roomCode, sId: sessionId }
    );

    await page.goto(`http://localhost:5173/room/${roomCode}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.ctl', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // 2. Evaluate playing controls
    const evalResult = await page.evaluate(() => {
      const seek = document.querySelector('.seek');
      const pp = document.querySelector('#pp');
      const bk = document.querySelector('#bk');
      const fw = document.querySelector('#fw');
      const tm = document.querySelector('#tm');
      const more = document.querySelector('#ctl-more-btn');
      const fs = document.querySelector('#fs');
      const vw = document.querySelector('.vw');
      const pill = document.querySelector('.ovl .pill');
      const chg = document.querySelector('.ovl #chg');

      const seekRect = seek.getBoundingClientRect();
      const ppRect = pp.getBoundingClientRect();
      const pillRect = pill ? pill.getBoundingClientRect() : null;
      const chgRect = chg ? chg.getBoundingClientRect() : null;
      const vwVisible = vw && window.getComputedStyle(vw).display !== 'none';

      return {
        seekHeight: seekRect.height,
        ppSize: { width: ppRect.width, height: ppRect.height },
        hasBk: Boolean(bk),
        hasFw: Boolean(fw),
        hasTm: Boolean(tm),
        hasMore: Boolean(more),
        hasFs: Boolean(fs),
        vwVisible,
        pillRect,
        chgRect,
      };
    });

    console.log('Controls Evaluation:', JSON.stringify(evalResult, null, 2));

    if (Math.abs(evalResult.seekHeight - 36) > 2) {
      throw new Error(`Expected seek bar height ~36px, got ${evalResult.seekHeight}px`);
    }
    if (Math.abs(evalResult.ppSize.width - 44) > 2 || Math.abs(evalResult.ppSize.height - 44) > 2) {
      throw new Error(`Expected play/pause 44x44px, got ${evalResult.ppSize.width}x${evalResult.ppSize.height}`);
    }
    if (!evalResult.hasBk || !evalResult.hasFw || !evalResult.hasTm || !evalResult.hasMore || !evalResult.hasFs) {
      throw new Error(`Missing expected buttons in row 2`);
    }
    if (evalResult.vwVisible) {
      throw new Error(`Volume slider should be hidden in row 2 on mobile`);
    }
    if (evalResult.pillRect && evalResult.chgRect) {
      if (evalResult.pillRect.right > evalResult.chgRect.left) {
        throw new Error(`Top overlay collision: pill right ${evalResult.pillRect.right} > chg left ${evalResult.chgRect.left}`);
      }
    }

    // 3. Test double-tap gesture seek
    const stage = await page.$('.stage');
    const stageBox = await stage.boundingBox();

    // Double tap right side
    const tapX = stageBox.x + stageBox.width * 0.85;
    const tapY = stageBox.y + stageBox.height * 0.5;
    await page.touchscreen.tap(tapX, tapY);
    await page.waitForTimeout(100);
    await page.touchscreen.tap(tapX, tapY);

    await page.waitForSelector('.double-tap-ripple', { timeout: 3000 });
    const rippleText = await page.$eval('.double-tap-ripple', (el) => el.textContent.trim());
    console.log(`Double-tap ripple text: "${rippleText}"`);
    if (!rippleText.includes('+10 s')) {
      throw new Error(`Expected ripple text to contain '+10 s', got '${rippleText}'`);
    }

    guard.assertClean('Step 5 Verification');
    console.log('\n=======================================');
    console.log('✅ STEP 5 VERIFICATION PASSED');
    console.log('=======================================');
    await context.close();
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('STEP 5 VERIFICATION FAILED:', err);
  process.exit(1);
});
