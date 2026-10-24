import { chromium } from 'playwright';

export function attachConsoleGuard(page, allowedWarnings = []) {
  const violations = [];

  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') {
      violations.push({ type: 'console.error', text });
    } else if (type === 'warning') {
      const isAllowed = allowedWarnings.some((pattern) =>
        typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text)
      );
      if (!isAllowed) {
        violations.push({ type: 'console.warn', text });
      }
    }
  });

  page.on('pageerror', (err) => {
    violations.push({ type: 'pageerror', text: err.message || String(err) });
  });

  return {
    assertClean(contextDescription = '') {
      if (violations.length > 0) {
        const details = violations.map((v) => `[${v.type}] ${v.text}`).join('\n');
        throw new Error(`Console guard failed (${contextDescription}):\n${details}`);
      }
    },
    getViolations() {
      return [...violations];
    },
  };
}

async function runSessionTest() {
  console.log('--- RUNNING PLAYWRIGHT 2-MINUTE CONSOLE GUARD VALIDATION ---');
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
  const guard = attachConsoleGuard(page);

  // 1. Create and test empty room
  const emptyRes = await fetch('http://localhost:4000/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Abbas Host', roomName: "Abbas's Room" }),
  });
  const emptyData = await emptyRes.json();
  const emptyCode = emptyData.room.roomCode;
  const emptySessionId = emptyData.hostSessionId;

  await page.addInitScript(
    ({ rCode, sId }) => {
      sessionStorage.setItem('sw_name_' + rCode, 'Abbas Host');
      sessionStorage.setItem('cineva_session_' + rCode, sId);
    },
    { rCode: emptyCode, sId: emptySessionId }
  );

  await page.goto(`http://localhost:5173/room/${emptyCode}`);
  await page.waitForTimeout(3000);
  guard.assertClean('empty room initial load');

  // Tab switches
  for (const tab of ['Call', 'Chat', 'People', 'Chat']) {
    const btn = page.locator(`button[role="tab"]:has-text("${tab}")`).first();
    if (await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(500);
    }
  }
  guard.assertClean('empty room tab switches');

  // Chat send
  const chatInput = page.locator('#mi-mobile, #mi, input[placeholder*="Message"]').first();
  if (await chatInput.isVisible()) {
    await chatInput.fill('Clean session message');
    await chatInput.press('Enter');
    await page.waitForTimeout(1000);
  }
  guard.assertClean('empty room chat send');

  // Try sample button click
  const sampleBtn = page.locator('#smp, button:has-text("Try a sample")').first();
  if (await sampleBtn.isVisible()) {
    await sampleBtn.click();
    await page.waitForTimeout(3000);
  }
  guard.assertClean('sample video attach');

  // 2. Demo playing room
  const demoRes = await fetch('http://localhost:4000/api/rooms/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Dev Host' }),
  });
  const demoData = await demoRes.json();
  const demoCode = demoData.room.roomCode;
  const demoSessionId = demoData.hostSessionId;

  await page.addInitScript(
    ({ rCode, sId }) => {
      sessionStorage.setItem('sw_name_' + rCode, 'Dev Host');
      sessionStorage.setItem('cineva_session_' + rCode, sId);
    },
    { rCode: demoCode, sId: demoSessionId }
  );

  await page.goto(`http://localhost:5173/room/${demoCode}`);
  await page.waitForTimeout(4000);
  guard.assertClean('playing room initial load');

  // Play / pause
  const playBtn = page.locator('#pp').first();
  if (await playBtn.isVisible()) {
    await playBtn.click({ force: true });
    await page.waitForTimeout(2000);
    await playBtn.click({ force: true });
    await page.waitForTimeout(2000);
  }
  guard.assertClean('video play/pause toggles');

  // Tabs while playing
  for (const tab of ['Call', 'Chat', 'People']) {
    const btn = page.locator(`button[role="tab"]:has-text("${tab}")`).first();
    if (await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(600);
    }
  }
  guard.assertClean('playing room tab switches');

  // Extended observation to ensure stability
  console.log('Observing quiet stability for 15s...');
  await page.waitForTimeout(15000);
  guard.assertClean('extended observation session');

  console.log('✅ ALL CONSOLE GUARDS PASSED: ZERO ERRORS AND ZERO WARNINGS.');
  await browser.close();
}

if (process.argv[1]?.endsWith('verify-console-guards.mjs')) {
  runSessionTest().catch((err) => {
    console.error('❌ Console guard test failed:', err);
    process.exit(1);
  });
}
