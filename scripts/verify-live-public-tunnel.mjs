import { chromium } from 'playwright';

async function runLiveVerification() {
  console.log('============================================================');
  console.log('LIVE VERIFICATION: Real Running Public HTTPS Tunnel (No Mocking)');
  console.log('============================================================\n');

  // 1. Query the live public URL directly from the running server
  const port = process.env.PORT || '4000';
  const localApi = `http://localhost:${port}/api/system/public-url`;
  console.log(`[1] Fetching live public URL from ${localApi}...`);
  const res = await fetch(localApi);
  const data = await res.json();

  if (!data.publicUrl) {
    throw new Error(`Server returned no public URL: ${JSON.stringify(data)}`);
  }
  const publicUrl = data.publicUrl;
  console.log(`[1.1] Discovered live public URL: ${publicUrl}`);

  // 2. Verify reachability over public HTTPS
  console.log(`[2] Verifying public HTTPS reachability at ${publicUrl}/api/health...`);
  const healthRes = await fetch(`${publicUrl}/api/health`);
  if (!healthRes.ok) {
    throw new Error(`Health check over public tunnel failed: ${healthRes.status} ${healthRes.statusText}`);
  }
  const healthData = await healthRes.json();
  console.log(`[2.1] Public health check response:`, healthData);

  // 3. Launch browser for host
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  async function bypassInterstitialIfNeeded(page) {
    try {
      const enterBtn = page.locator('button:has-text("Enter site")');
      if (await enterBtn.isVisible({ timeout: 3000 })) {
        console.log('  [Tunnel Guard] Free tunnel warning detected, clicking "Enter site"...');
        await enterBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch {}
  }

  try {
    const hostContext = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const hostPage = await hostContext.newPage();

    // Host navigates to public create page
    console.log(`[3] Host creating room on ${publicUrl}/create...`);
    await hostPage.goto(`${publicUrl}/create`);
    await bypassInterstitialIfNeeded(hostPage);
    await hostPage.waitForSelector('#displayName', { timeout: 15000 });
    await hostPage.fill('#displayName', 'Host Alice');
    await hostPage.click('#submitBtn');

    await hostPage.waitForSelector('#modal.open', { timeout: 15000 });
    const roomCode = (await hostPage.textContent('#modalCodeDisplay')).trim();
    console.log(`[3.1] Room created successfully! Code: ${roomCode}`);

    // Modal Copy Link verification
    console.log('[3.2] Testing Copy Link on Create Room ready modal...');
    await hostPage.click('#createCopyLinkBtn');
    await hostPage.waitForTimeout(500);
    const modalClipboard = await hostPage.evaluate(() => navigator.clipboard.readText());
    console.log(`[3.3] Modal copied link: "${modalClipboard}"`);
    const expectedLink = `${publicUrl}/room/${roomCode}`;
    if (modalClipboard !== expectedLink) {
      throw new Error(`Modal copied "${modalClipboard}", expected "${expectedLink}"`);
    }

    // Enter theater
    console.log('[3.4] Host entering theater...');
    await hostPage.click('button:has-text("Enter Theater")');
    await hostPage.waitForURL(new RegExp(`/room/${roomCode}`), { timeout: 15000 });
    await hostPage.waitForSelector('#inv', { timeout: 15000 });
    console.log(`[3.5] Host loaded theater at: ${hostPage.url()}`);

    // Test Copy Link in Watch Room Topbar
    console.log('[4] Testing Watch Room Topbar Copy Link...');
    await hostPage.click('#inv');
    await hostPage.waitForSelector('#pop.o', { timeout: 5000 });
    await hostPage.click('#cp');

    await hostPage.waitForSelector('.toast.s', { timeout: 8000 });
    const toastText = await hostPage.locator('.toast.s').textContent();
    console.log(`[4.1] Copy Toast: "${toastText}"`);
    if (!toastText.toLowerCase().includes('copied')) {
      throw new Error(`Expected copied toast, got: "${toastText}"`);
    }

    const watchClipboard = await hostPage.evaluate(() => navigator.clipboard.readText());
    console.log(`[4.2] Watch Room copied link: "${watchClipboard}"`);
    if (watchClipboard !== expectedLink) {
      throw new Error(`Watch room copied "${watchClipboard}", expected "${expectedLink}"`);
    }
    console.log('✅ PASS: Real Copy Link button generated and copied exact public tunnel invitation link!');

    // Test WhatsApp Share in Watch Room Topbar
    console.log('[5] Testing Watch Room WhatsApp Share button...');
    if (!(await hostPage.locator('#pop.o').isVisible())) {
      await hostPage.click('#inv');
      await hostPage.waitForSelector('#pop.o');
    }

    const popupPromise = hostPage.waitForEvent('popup', { timeout: 10000 });
    await hostPage.click('#waShareBtn', { force: true });
    const popup = await popupPromise;
    const targetUrl = popup.url();
    console.log(`[5.1] WhatsApp target URL: ${targetUrl}`);

    if (!targetUrl.startsWith('https://wa.me/?text=') && !targetUrl.startsWith('https://api.whatsapp.com/send/?text=')) {
      throw new Error(`Expected WhatsApp endpoint (wa.me or api.whatsapp.com), got: ${targetUrl}`);
    }
    const decodedWa = decodeURIComponent(targetUrl.replace(/\+/g, ' '));
    console.log(`[5.2] Decoded WhatsApp text: "${decodedWa}"`);
    if (!decodedWa.includes(expectedLink)) {
      throw new Error(`WhatsApp text does not contain ${expectedLink}: "${decodedWa}"`);
    }
    console.log('✅ PASS: Real WhatsApp Share button generated correct public invitation message!');
    await popup.close();

    // 6. Test Guest joining entirely over the public HTTPS tunnel
    console.log('\n[6] Testing Guest Joining via Public HTTPS URL...');
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    console.log(`[6.1] Guest opening: ${expectedLink}`);
    await guestPage.goto(expectedLink);
    await bypassInterstitialIfNeeded(guestPage);
    await guestPage.waitForSelector('#joinForm', { timeout: 20000 });
    console.log(`[6.2] Guest arrived at Join Page: ${guestPage.url()}`);

    await guestPage.fill('#joinName', 'Bob RemoteGuest');
    await guestPage.click('#joinSubmit');

    await guestPage.waitForURL(new RegExp(`/room/${roomCode}`), { timeout: 20000 });
    await guestPage.waitForSelector('#stage', { timeout: 20000 });
    console.log(`[6.3] Guest successfully entered room theater over public tunnel!`);

    // Verify WebSocket synchronization over the public tunnel
    await hostPage.waitForTimeout(3000);
    const hostCount = (await hostPage.locator('#n').textContent()).trim();
    const guestCount = (await guestPage.locator('#n').textContent()).trim();
    console.log(`[6.4] Synchronized participant count - Host: ${hostCount}, Guest: ${guestCount}`);
    if (hostCount !== '2' || guestCount !== '2') {
      throw new Error(`Expected participant count to be 2 on both sides. Host: ${hostCount}, Guest: ${guestCount}`);
    }

    // Verify Chat over public tunnel
    console.log('[6.5] Testing chat messaging over public tunnel...');
    await hostPage.fill('#mi', 'Welcome to the public screening room!');
    await hostPage.press('#mi', 'Enter');

    await guestPage.waitForSelector('text=Welcome to the public screening room!', { timeout: 15000 });
    console.log('✅ PASS: Real-time chat message received by guest over public tunnel!');

    // Close contexts
    await hostContext.close();
    await guestContext.close();

    console.log('\n============================================================');
    console.log('🎉 FULL END-TO-END PUBLIC SHARING VERIFICATION PASSED! 🎉');
    console.log(`Public URL:     ${publicUrl}`);
    console.log(`Invitation URL: ${expectedLink}`);
    console.log('============================================================\n');
  } finally {
    await browser.close();
  }
}

runLiveVerification().catch((err) => {
  console.error('\n❌ LIVE VERIFICATION FAILED:', err);
  process.exit(1);
});
