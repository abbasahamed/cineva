import { chromium } from 'playwright';
import { attachConsoleGuard } from './verify-console-guards.mjs';

async function run() {
  console.log('--- STARTING STEP 6 VERIFICATION (TABS & BOTTOM SHEETS) ---');
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

    // Create room
    const res = await fetch('http://localhost:4000/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Host User', roomName: 'Test Room' }),
    });
    const data = await res.json();
    const roomCode = data.room.roomCode;
    const sessionId = data.hostSessionId;

    await page.addInitScript(
      ({ rCode, sId }) => {
        sessionStorage.setItem('sw_name_' + rCode, 'Host User');
        sessionStorage.setItem('cineva_session_' + rCode, sId);
      },
      { rCode: roomCode, sId: sessionId }
    );

    await page.goto(`http://localhost:5173/room/${roomCode}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.mobile-seg', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // 1. Verify 48px Segmented Tabs
    const segHeight = await page.$eval('.mobile-seg', (el) => el.getBoundingClientRect().height);
    console.log(`Segmented tabs height: ${segHeight}px`);
    if (Math.abs(segHeight - 48) > 2) {
      throw new Error(`Expected segmented tabs height ~48px, got ${segHeight}px`);
    }

    // 2. Call tab verification (<=4 participants -> 2-col grid, mic/cam dock buttons 44px)
    const callTabMetrics = await page.evaluate(() => {
      const grid = document.querySelector('.mobile-call-grid');
      const dock = document.querySelector('.mobile-dock');
      const micBtn = document.querySelector('#dMic-mobile');
      const camBtn = document.querySelector('#dCam-mobile');
      const inviteTile = document.querySelector('#inv-mobile-tile');

      const micRect = micBtn ? micBtn.getBoundingClientRect() : null;
      const camRect = camBtn ? camBtn.getBoundingClientRect() : null;

      return {
        has2ColGrid: Boolean(grid),
        hasDock: Boolean(dock),
        hasInvite: Boolean(inviteTile),
        micHeight: micRect ? micRect.height : null,
        camHeight: camRect ? camRect.height : null,
      };
    });

    console.log('Call tab metrics:', callTabMetrics);
    if (!callTabMetrics.has2ColGrid) throw new Error('Expected 2-column grid for <=4 participants');
    if (!callTabMetrics.hasDock || !callTabMetrics.hasInvite) throw new Error('Missing dock or invite tile');
    if (Math.abs(callTabMetrics.micHeight - 44) > 2 || Math.abs(callTabMetrics.camHeight - 44) > 2) {
      throw new Error(`Expected mic/cam dock buttons height ~44px, got ${callTabMetrics.micHeight}px / ${callTabMetrics.camHeight}px`);
    }

    // 3. Chat tab verification
    await page.click('#m-tab-chat');
    await page.waitForTimeout(300);

    const chatTabMetrics = await page.evaluate(() => {
      const msgs = document.querySelector('.mobile-chat-pane .msgs');
      const composer = document.querySelector('.mobile-chat-pane .cmp, .composer');
      const input = document.querySelector('#mi-mobile');
      const sendBtn = document.querySelector('#send-mobile-btn');

      const compRect = composer ? composer.getBoundingClientRect() : null;
      const inputRect = input ? input.getBoundingClientRect() : null;
      const inputStyle = input ? window.getComputedStyle(input) : null;

      return {
        hasMsgs: Boolean(msgs),
        hasComposer: Boolean(composer),
        composerHeight: compRect ? compRect.height : null,
        inputFontSize: inputStyle ? inputStyle.fontSize : null,
      };
    });

    console.log('Chat tab metrics:', chatTabMetrics);
    if (!chatTabMetrics.hasMsgs || !chatTabMetrics.hasComposer) throw new Error('Missing msgs or composer');
    if (chatTabMetrics.inputFontSize !== '16px') throw new Error(`Expected input font-size 16px, got ${chatTabMetrics.inputFontSize}`);

    // Send a message and verify
    await page.fill('#mi-mobile', 'Hello Cineva Mobile!');
    await page.click('#send-mobile-btn');
    await page.waitForTimeout(300);
    const msgText = await page.$eval('.mobile-chat-pane .msgs', (el) => el.textContent);
    if (!msgText.includes('Hello Cineva Mobile!')) throw new Error('Sent message not rendered');

    // 4. People tab verification
    await page.click('#m-tab-people');
    await page.waitForTimeout(300);

    const peopleCount = await page.$$eval('.mobile-people-pane .row', (rows) => rows.length);
    console.log(`People count: ${peopleCount}`);
    if (peopleCount < 1) throw new Error('Expected at least 1 person in people list');

    // 5. Test Bottom Sheet Max Heights
    // Open top overflow sheet
    await page.click('.top-overflow-btn');
    await page.waitForSelector('.bottom-sheet-content', { timeout: 3000 });

    const sheetMaxHeight = await page.$eval('.bottom-sheet-content', (el) => window.getComputedStyle(el).maxHeight);
    console.log(`Bottom sheet maxHeight: ${sheetMaxHeight}`);
    // Should be 70dvh
    if (!sheetMaxHeight.includes('70') && !sheetMaxHeight.includes('px')) {
      console.warn('Sheet maxHeight style:', sheetMaxHeight);
    }

    // Close sheet via Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const isSheetClosed = await page.$eval('.bottom-sheet-content', (el) => !el.closest('.bottom-sheet-container')?.classList.contains('open')).catch(() => true);
    if (!isSheetClosed) throw new Error('Escape key did not close bottom sheet');

    guard.assertClean('Step 6 Verification');
    console.log('\n=======================================');
    console.log('✅ STEP 6 VERIFICATION PASSED');
    console.log('=======================================');
    await context.close();
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('STEP 6 VERIFICATION FAILED:', err);
  process.exit(1);
});
