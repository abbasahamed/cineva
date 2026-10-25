import { chromium } from 'playwright';

async function diagnose() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox'],
  });

  // Create room
  const createRes = await fetch('http://localhost:4000/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Host Abbas', roomName: "Abbas's Room" }),
  });
  const createData = await createRes.json();
  const roomCode = createData.room.roomCode;
  const hostSessionId = createData.hostSessionId;
  console.log(`Room created: ${roomCode}`);

  const context = await browser.newContext({
    viewport: { width: 412, height: 924 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  });

  const page = await context.newPage();

  const messages = [];
  page.on('console', msg => {
    messages.push({ type: msg.type(), text: msg.text(), location: msg.location() });
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    messages.push({ type: 'pageerror', text: err.message || String(err) });
    console.log(`[PAGEERROR] ${err.message}`);
  });

  await page.addInitScript(({ rCode, sId }) => {
    sessionStorage.setItem('sw_name_' + rCode, 'Host Abbas');
    sessionStorage.setItem('cineva_session_' + rCode, sId);
  }, { rCode: roomCode, sId: hostSessionId });

  console.log('Navigating to room...');
  await page.goto(`http://localhost:5173/room/${roomCode}`);
  await page.waitForTimeout(3000);

  // 1. Switch tabs
  console.log('Switching tabs...');
  const callTab = page.locator('button:has-text("Call")').first();
  const chatTab = page.locator('button:has-text("Chat")').first();
  const peopleTab = page.locator('button:has-text("People")').first();

  if (await callTab.isVisible()) {
    await callTab.click();
    await page.waitForTimeout(1000);
  }
  if (await chatTab.isVisible()) {
    await chatTab.click();
    await page.waitForTimeout(1000);
  }
  if (await peopleTab.isVisible()) {
    await peopleTab.click();
    await page.waitForTimeout(1000);
  }

  // 2. Chat message
  if (await chatTab.isVisible()) {
    await chatTab.click();
    await page.waitForTimeout(500);
    const chatInput = page.locator('input[placeholder*="Message"], input[type="text"]').last();
    if (await chatInput.isVisible()) {
      await chatInput.fill('Hello from Pixel 9');
      await chatInput.press('Enter');
      await page.waitForTimeout(1000);
    }
  }

  // 3. Try sample video
  console.log('Testing sample video click...');
  const sampleBtn = page.locator('button:has-text("Try a sample")');
  if (await sampleBtn.isVisible()) {
    await sampleBtn.click();
    await page.waitForTimeout(5000);
  }

  // 4. Second user joins (Guest)
  console.log('Second user (Guest) joining...');
  const guestContext = await browser.newContext({
    viewport: { width: 412, height: 924 },
    isMobile: true,
    hasTouch: true,
  });
  const guestPage = await guestContext.newPage();
  
  const joinRes = await fetch(`http://localhost:4000/api/rooms/${roomCode}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Guest Bob' }),
  });
  const joinData = await joinRes.json();
  const guestSessionId = joinData.sessionId;

  await guestPage.addInitScript(({ rCode, sId }) => {
    sessionStorage.setItem('sw_name_' + rCode, 'Guest Bob');
    sessionStorage.setItem('cineva_session_' + rCode, sId);
  }, { rCode: roomCode, sId: guestSessionId });

  await guestPage.goto(`http://localhost:5173/room/${roomCode}`);
  await page.waitForTimeout(5000);

  // 5. Interact with video playback if loaded
  console.log('Testing playback controls...');
  const playBtn = page.locator('#pp');
  if (await playBtn.isVisible()) {
    await playBtn.click({ force: true });
    await page.waitForTimeout(3000);
  }

  // 6. Observe for 15 more seconds
  console.log('Observing remaining session...');
  await page.waitForTimeout(15000);

  console.log('\n=== COLLECTED CONSOLE SUMMARY ===');
  const errors = messages.filter(m => m.type === 'error');
  const warnings = messages.filter(m => m.type === 'warning');
  const pageErrors = messages.filter(m => m.type === 'pageerror');

  console.log(`Total Errors: ${errors.length}`);
  console.log(`Total Warnings: ${warnings.length}`);
  console.log(`Total PageErrors: ${pageErrors.length}`);

  function group(arr) {
    const counts = {};
    for (const m of arr) {
      counts[m.text] = (counts[m.text] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }

  console.log('\nTop 10 Errors:');
  group(errors).slice(0, 10).forEach(([t, c]) => console.log(`  [${c}x] ${t}`));

  console.log('\nTop 10 Warnings:');
  group(warnings).slice(0, 10).forEach(([t, c]) => console.log(`  [${c}x] ${t}`));

  console.log('\nTop 10 PageErrors:');
  group(pageErrors).slice(0, 10).forEach(([t, c]) => console.log(`  [${c}x] ${t}`));

  await browser.close();
}

diagnose().catch(err => {
  console.error('Diagnosis failed:', err);
  process.exit(1);
});
