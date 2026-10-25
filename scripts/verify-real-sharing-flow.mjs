import { chromium } from 'playwright';

async function testScenario1_NoPublicUrl(browser) {
  console.log('\n============================================================');
  console.log('TEST SCENARIO 1: Browser on Localhost with NO Public Tunnel/Domain');
  console.log('============================================================');

  const context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();

  // Create room
  console.log('[1.1] Creating room on /create...');
  await page.goto('http://localhost:5173/create');
  await page.waitForSelector('#displayName', { timeout: 10000 });
  await page.fill('#displayName', 'Alice Host');
  await page.click('#submitBtn');
  await page.waitForSelector('#modal.open', { timeout: 15000 });
  const roomCode = (await page.textContent('#modalCodeDisplay')).trim();
  console.log('[1.2] Room created:', roomCode);

  // Test modal copy button when no public URL exists
  console.log('[1.3] Testing "Copy Link" on Create Room modal without public tunnel...');
  await page.click('#createCopyLinkBtn');
  await page.waitForTimeout(500);
  const copyErrorText = await page.textContent('#createCopyError').catch(() => '');
  console.log('[1.4] Modal Copy Error Message:', copyErrorText);
  if (!copyErrorText.includes('No public invitation URL available') && !copyErrorText.includes('deployed domain')) {
    throw new Error(`Expected modal error requiring public domain/tunnel, got: ${copyErrorText}`);
  }

  // Enter theater
  await page.click('button:has-text("Enter Theater")');
  await page.waitForURL(new RegExp(`/room/${roomCode}`), { timeout: 10000 });
  await page.waitForSelector('#inv', { timeout: 10000 });

  // Open invite popover
  console.log('[1.5] Opening Invite Popover in Watch Room topbar...');
  await page.click('#inv');
  await page.waitForSelector('#pop.o', { timeout: 5000 });

  // Clear clipboard before clicking copy
  await page.evaluate(() => navigator.clipboard.writeText('CLEARED_CLIPBOARD'));

  // Click Copy Link
  console.log('[1.6] Clicking Copy Link button in Watch Room...');
  await page.click('#cp');

  // Verify toast appears with error and NOT success
  await page.waitForSelector('.toast.s', { timeout: 8000 });
  const toastText = await page.locator('.toast.s').textContent();
  console.log('[1.7] Toast message displayed:', toastText);
  if (!toastText.includes('No public invitation URL available') && !toastText.includes('deployed domain')) {
    throw new Error(`Expected error toast for missing public URL, got: "${toastText}"`);
  }

  // Inspect clipboard: must NOT have copied localhost!
  const clipboardVal = await page.evaluate(() => navigator.clipboard.readText());
  console.log('[1.8] Clipboard Content after Copy Link:', clipboardVal);
  if (clipboardVal.includes('localhost') || clipboardVal.includes('127.0.0.1')) {
    throw new Error(`CRITICAL BUG: Localhost was copied to clipboard! Clipboard: ${clipboardVal}`);
  }
  if (clipboardVal !== 'CLEARED_CLIPBOARD') {
    throw new Error(`Clipboard was modified when copy should have failed: ${clipboardVal}`);
  }
  console.log('✅ PASS: No localhost link was copied when no public tunnel/domain exists.');

  // Wait for first toast to clear
  await page.waitForTimeout(2000);

  // Click WhatsApp Share
  console.log('[1.9] Testing WhatsApp Share button in Watch Room...');
  if (!(await page.locator('#pop.o').isVisible())) {
    await page.click('#inv');
    await page.waitForSelector('#pop.o');
  }
  await page.click('#waShareBtn');

  // Verify error toast for WhatsApp too
  await page.waitForSelector('.toast.s', { timeout: 8000 });
  const waToastText = await page.locator('.toast.s').textContent();
  console.log('[1.10] WhatsApp Toast message:', waToastText);
  if (!waToastText.includes('No public invitation URL available') && !waToastText.includes('deployed domain')) {
    throw new Error(`Expected error toast for WhatsApp, got: "${waToastText}"`);
  }
  console.log('✅ PASS: WhatsApp refused to share localhost and displayed error.');

  await context.close();
}

async function testScenario2_WithPublicTunnel(browser) {
  console.log('\n============================================================');
  console.log('TEST SCENARIO 2: Browser on Localhost WITH Active Public Tunnel');
  console.log('============================================================');

  const publicTunnelUrl = 'https://patients-tuesday-tomorrow-whereas.trycloudflare.com';

  const hostContext = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const hostPage = await hostContext.newPage();

  // Intercept /api/system/public-url to simulate active tunnel from backend
  await hostPage.route('**/api/system/public-url', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ publicUrl: publicTunnelUrl }),
    });
  });

  // Host creates room
  console.log('[2.1] Navigating to /create...');
  await hostPage.goto('http://localhost:5173/create');
  await hostPage.waitForSelector('#displayName', { timeout: 10000 });
  await hostPage.fill('#displayName', 'Host User');
  await hostPage.click('#submitBtn');
  await hostPage.waitForSelector('#modal.open', { timeout: 15000 });
  const roomCode = (await hostPage.textContent('#modalCodeDisplay')).trim();
  console.log('[2.2] Room created with code:', roomCode);

  // Test modal copy button with active tunnel
  console.log('[2.3] Clicking "Copy Link" on Create Room modal with active tunnel...');
  await hostPage.click('#createCopyLinkBtn');
  await hostPage.waitForTimeout(500);
  const modalCopiedText = await hostPage.textContent('#createCopyLinkBtn');
  console.log('[2.4] Modal button state:', modalCopiedText);
  const modalClipboard = await hostPage.evaluate(() => navigator.clipboard.readText());
  console.log('[2.5] Copied from Modal:', modalClipboard);
  if (modalClipboard !== `${publicTunnelUrl}/room/${roomCode}`) {
    throw new Error(`Expected modal to copy ${publicTunnelUrl}/room/${roomCode}, got: ${modalClipboard}`);
  }
  console.log('✅ PASS: CreateRoom modal copied public tunnel URL!');

  // Enter theater
  await hostPage.click('button:has-text("Enter Theater")');
  await hostPage.waitForURL(new RegExp(`/room/${roomCode}`), { timeout: 10000 });
  await hostPage.waitForSelector('#inv', { timeout: 10000 });
  console.log('[2.6] Host inside theater at:', hostPage.url());

  // Step 3: Open Invite Popover
  console.log('[2.7] Clicking Invite button in topbar...');
  await hostPage.click('#inv');
  await hostPage.waitForSelector('#pop.o', { timeout: 5000 });

  // Test Copy Link in Watch Room
  console.log('[2.8] Testing Copy Link in Watch Room...');
  await hostPage.click('#cp');
  await hostPage.waitForSelector('.toast.s', { timeout: 8000 });
  const copyToast = await hostPage.locator('.toast.s').textContent();
  console.log('[2.9] Copy Toast:', copyToast);

  const watchClipboard = await hostPage.evaluate(() => navigator.clipboard.readText());
  console.log('[2.10] EXACT COPIED CLIPBOARD VALUE:', watchClipboard);

  if (watchClipboard.includes('localhost') || watchClipboard.includes('127.0.0.1')) {
    throw new Error(`CRITICAL BUG: Watch room copied localhost! ${watchClipboard}`);
  }
  if (watchClipboard !== `${publicTunnelUrl}/room/${roomCode}`) {
    throw new Error(`Expected ${publicTunnelUrl}/room/${roomCode}, got: ${watchClipboard}`);
  }
  console.log('✅ PASS: Watch room copied exact public tunnel invitation URL!');

  // Test WhatsApp Share in Watch Room
  console.log('[2.11] Testing WhatsApp Share button in Watch Room...');
  await hostPage.click('#inv');
  await hostPage.waitForSelector('#pop.o');

  const popupPromise = hostPage.waitForEvent('popup', { timeout: 10000 });
  await hostPage.click('#waShareBtn', { force: true });
  const popup = await popupPromise;
  const targetUrl = popup.url();
  console.log('[2.12] WhatsApp Launched URL:', targetUrl);

  if (targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1')) {
    throw new Error(`CRITICAL BUG: WhatsApp opened localhost! ${targetUrl}`);
  }
  const decoded = decodeURIComponent(targetUrl.replace(/\+/g, ' '));
  console.log('[2.13] Decoded WhatsApp message:', decoded);
  if (!decoded.includes(`${publicTunnelUrl}/room/${roomCode}`)) {
    throw new Error(`Expected decoded WhatsApp message to contain ${publicTunnelUrl}/room/${roomCode}`);
  }
  console.log('✅ PASS: WhatsApp share opened with encoded public tunnel URL!');
  await popup.close();

  // Test Guest Joining
  console.log('[2.14] Guest opening invite link in clean context...');
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();

  // Route API for guest too
  await guestPage.route('**/api/system/public-url', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ publicUrl: publicTunnelUrl }),
    });
  });

  // Guest opens the room link
  const guestUrl = `http://localhost:5173/room/${roomCode}`;
  await guestPage.goto(guestUrl);
  await guestPage.waitForSelector('#joinForm', { timeout: 10000 });
  console.log('[2.15] Guest redirected to:', guestPage.url());

  await guestPage.fill('#joinName', 'Bob Guest');
  await guestPage.click('#joinSubmit');
  await guestPage.waitForURL(new RegExp(`/room/${roomCode}`), { timeout: 10000 });
  await guestPage.waitForSelector('#stage', { timeout: 10000 });
  console.log('[2.16] Guest successfully in room theater!');

  await hostPage.waitForTimeout(2000);
  const hostCount = await hostPage.locator('#n').textContent();
  const guestCount = await guestPage.locator('#n').textContent();
  console.log(`[2.17] Synchronized participant count - Host: ${hostCount}, Guest: ${guestCount}`);
  if (hostCount !== '2' || guestCount !== '2') {
    throw new Error(`Expected 2 participants, host saw ${hostCount}, guest saw ${guestCount}`);
  }

  console.log('✅ PASS: Complete host + guest end-to-end flow verified!');
  await hostContext.close();
  await guestContext.close();
}

async function main() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  try {
    await testScenario1_NoPublicUrl(browser);
    await testScenario2_WithPublicTunnel(browser);
    console.log('\n============================================================');
    console.log('🎉 ALL INVITATION & WHATSAPP SHARING PROOFS PASSED! 🎉');
    console.log('============================================================\n');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('\n❌ E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
