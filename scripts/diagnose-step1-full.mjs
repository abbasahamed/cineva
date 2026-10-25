import { chromium } from 'playwright';

async function fullDiagnostic() {
  console.log('--- STARTING STEP 1 FULL 60-SECOND SESSION AUDIT ---');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  const context = await browser.newContext({
    viewport: { width: 412, height: 924 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  });

  const page = await context.newPage();

  const errors = [];
  const warnings = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') {
      errors.push(text);
      console.log(`[CONSOLE ERROR] ${text}`);
    } else if (type === 'warning') {
      warnings.push(text);
      console.log(`[CONSOLE WARN] ${text}`);
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message || String(err));
    console.log(`[PAGE ERROR] ${err.message}`);
  });

  // 1. Create empty room
  const createRes = await fetch('http://localhost:4000/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Abbas', roomName: "Abbas's Room" }),
  });
  const createData = await createRes.json();
  const emptyRoomCode = createData.room.roomCode;
  const hostSessionId = createData.hostSessionId;

  await page.addInitScript(
    ({ rCode, sId }) => {
      sessionStorage.setItem('sw_name_' + rCode, 'Abbas');
      sessionStorage.setItem('cineva_session_' + rCode, sId);
    },
    { rCode: emptyRoomCode, sId: hostSessionId }
  );

  console.log(`[1] Navigating to empty room: ${emptyRoomCode}`);
  await page.goto(`http://localhost:5173/room/${emptyRoomCode}`);
  await page.waitForTimeout(4000);

  // 2. Tab switches
  console.log('[2] Switching tabs in empty room...');
  const tabs = ['Call', 'Chat', 'People'];
  for (let i = 0; i < 4; i++) {
    for (const tab of tabs) {
      const btn = page.locator(`button[role="tab"]:has-text("${tab}")`).first();
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(600);
      }
    }
  }

  // 3. Send chat messages
  console.log('[3] Sending chat messages...');
  const chatTab = page.locator('button[role="tab"]:has-text("Chat")').first();
  await chatTab.click();
  await page.waitForTimeout(500);

  const chatInput = page.locator('#mi-mobile, #mi, input[placeholder*="Message"]').first();
  if (await chatInput.isVisible()) {
    for (let m = 1; m <= 3; m++) {
      await chatInput.fill(`Test message ${m}`);
      await chatInput.press('Enter');
      await page.waitForTimeout(800);
    }
  }

  // 4. Try sample button
  console.log('[4] Testing Try a sample button in empty room...');
  const sampleBtn = page.locator('#smp, button:has-text("Try a sample")').first();
  if (await sampleBtn.isVisible()) {
    await sampleBtn.click();
    await page.waitForTimeout(2000);
  }

  // 5. Open playing room
  console.log('[5] Opening demo playing room...');
  const demoRes = await fetch('http://localhost:4000/api/rooms/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Abbas Demo' }),
  });
  const demoData = await demoRes.json();
  const demoRoomCode = demoData.room.roomCode;
  const demoSessionId = demoData.hostSessionId;

  await page.addInitScript(
    ({ rCode, sId }) => {
      sessionStorage.setItem('sw_name_' + rCode, 'Abbas Demo');
      sessionStorage.setItem('cineva_session_' + rCode, sId);
    },
    { rCode: demoRoomCode, sId: demoSessionId }
  );

  await page.goto(`http://localhost:5173/room/${demoRoomCode}`);
  await page.waitForTimeout(5000);

  // 6. Playing room interactions
  console.log('[6] Interacting with playback and tabs...');
  for (let i = 0; i < 3; i++) {
    for (const tab of tabs) {
      const btn = page.locator(`button[role="tab"]:has-text("${tab}")`).first();
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(500);
      }
    }
  }

  // Play / pause
  const playBtn = page.locator('#pp').first();
  if (await playBtn.isVisible()) {
    await playBtn.click({ force: true });
    await page.waitForTimeout(2000);
    await playBtn.click({ force: true });
    await page.waitForTimeout(2000);
  }

  // Seek
  const seekBar = page.locator('#sb, input[type="range"]').first();
  if (await seekBar.isVisible()) {
    await seekBar.fill('30');
    await page.waitForTimeout(2000);
  }

  // Let session run for 20 more seconds to observe socket heartbeats, etc.
  console.log('[7] Observing remaining session (20s)...');
  await page.waitForTimeout(20000);

  console.log('\n========================================');
  console.log('--- STEP 1 REPORT: CONSOLE DIAGNOSTICS ---');
  console.log(`Total console.error: ${errors.length}`);
  console.log(`Total console.warn: ${warnings.length}`);
  console.log(`Total pageerror: ${pageErrors.length}`);

  function groupCounts(arr) {
    const counts = {};
    for (const item of arr) {
      counts[item] = (counts[item] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }

  console.log('\nTop 10 Errors:');
  const topErrors = groupCounts(errors).slice(0, 10);
  if (topErrors.length === 0) console.log('  (none)');
  topErrors.forEach(([msg, count]) => console.log(`  [${count}x] ${msg}`));

  console.log('\nTop 10 Warnings:');
  const topWarnings = groupCounts(warnings).slice(0, 10);
  if (topWarnings.length === 0) console.log('  (none)');
  topWarnings.forEach(([msg, count]) => console.log(`  [${count}x] ${msg}`));

  console.log('\nTop 10 PageErrors:');
  const topPageErrors = groupCounts(pageErrors).slice(0, 10);
  if (topPageErrors.length === 0) console.log('  (none)');
  topPageErrors.forEach(([msg, count]) => console.log(`  [${count}x] ${msg}`));
  console.log('========================================\n');

  await browser.close();
}

fullDiagnostic().catch((err) => {
  console.error('Fatal diagnostic error:', err);
  process.exit(1);
});
