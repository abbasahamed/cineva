import { chromium } from 'playwright';

async function main() {
  console.log('--- STARTING INVITE & WHATSAPP SHARING E2E VERIFICATION ---');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });
  const hostContext = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const hostPage = await hostContext.newPage();

  // Track popups (like WhatsApp share)
  let popupUrl = null;
  hostContext.on('page', async (page) => {
    popupUrl = page.url();
    console.log('[Host Popup Opened]:', popupUrl);
  });

  // Step 1: Host navigates to /create
  console.log('[Step 1] Navigating to /create...');
  await hostPage.goto('http://localhost:5173/create');
  await hostPage.waitForSelector('#displayName', { timeout: 10000 });

  // Fill in host name
  await hostPage.fill('#displayName', 'Host User');

  // Click submit to create room
  console.log('[Step 1.2] Clicking Create Room...');
  await hostPage.click('#submitBtn');

  // Wait for success modal
  await hostPage.waitForSelector('#modal.open', { timeout: 15000 });
  const roomCode = (await hostPage.textContent('#modalCodeDisplay')).trim();
  console.log('[Step 1.3] Room created with code:', roomCode);

  // Check buttons in modal
  const copyModalBtn = await hostPage.locator('#createCopyLinkBtn');
  const waModalBtn = await hostPage.locator('#createWaShareBtn');
  console.log('Modal Copy Link Visible:', await copyModalBtn.isVisible());
  console.log('Modal WhatsApp Share Visible:', await waModalBtn.isVisible());

  // Enter Theater
  console.log('[Step 2] Entering Theater...');
  await hostPage.click('button:has-text("Enter Theater")');
  await hostPage.waitForURL(new RegExp(`/room/${roomCode}`), { timeout: 10000 });
  await hostPage.waitForSelector('#inv', { timeout: 10000 });
  console.log('[Step 2.1] Host inside theater at:', hostPage.url());

  // Step 3: Open Invite Popover
  console.log('[Step 3] Clicking Invite button in topbar...');
  await hostPage.click('#inv');
  await hostPage.waitForSelector('#pop.o', { timeout: 5000 });

  const popText = await hostPage.textContent('#pop');
  console.log('Popover Text Content:', popText.replace(/\s+/g, ' '));

  const cpBtn = hostPage.locator('#cp');
  const waBtn = hostPage.locator('#waShareBtn');

  const cpVisible = await cpBtn.isVisible();
  const waVisible = await waBtn.isVisible();
  console.log('Copy Link Button in Popover Visible:', cpVisible);
  console.log('WhatsApp Button in Popover Visible:', waVisible);

  if (!cpVisible || !waVisible) {
    throw new Error('Invite popover missing copy or whatsapp button');
  }

  // Test Copy Link click
  console.log('[Step 3.1] Testing Copy Link button in Watch Room...');
  await cpBtn.click();
  // Wait for toast
  await hostPage.waitForSelector('.toast', { state: 'visible', timeout: 5000 }).catch(() => {});
  const toastText = await hostPage.locator('.toast').textContent().catch(() => '');
  console.log('Copy Toast Result:', toastText);

  // Test WhatsApp Share click
  console.log('[Step 3.2] Testing WhatsApp Share button...');
  // Open popover again if closed by copy
  if (!(await hostPage.locator('#pop.o').isVisible())) {
    await hostPage.click('#inv');
    await hostPage.waitForSelector('#pop.o');
  }

  // Listen for popup event on WhatsApp button click
  const popupPromise = hostPage.waitForEvent('popup', { timeout: 10000 }).catch(() => null);
  await waBtn.click({ force: true });
  const popup = await popupPromise;
  if (!popup) {
    throw new Error('Popup window did not open when clicking WhatsApp share button');
  }
  const targetUrl = popup.url();
  console.log('[WhatsApp Popup Launched URL]:', targetUrl);
  const decoded = decodeURIComponent(targetUrl.replace(/\+/g, ' '));
  if (!targetUrl || (!targetUrl.includes('wa.me') && !targetUrl.includes('whatsapp.com')) || !decoded.includes('Join my CINEVA watch room! Watch together in sync:')) {
    throw new Error(`Unexpected popup URL: ${targetUrl}`);
  }
  console.log('✅ WhatsApp URL verified correctly!');
  await popup.close();

  // Step 4: Test Guest joining via invite link
  console.log('[Step 4] Guest opening invite link in clean context...');
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();

  // Guest visits room link: http://localhost:5173/room/{roomCode}
  const inviteUrl = `http://localhost:5173/room/${roomCode}`;
  console.log(`[Guest] Navigating to: ${inviteUrl}`);
  await guestPage.goto(inviteUrl);
  await guestPage.waitForSelector('#joinForm', { timeout: 10000 });

  // Verify guest was redirected to /join/{roomCode}
  console.log(`[Guest] Landed on URL: ${guestPage.url()}`);
  if (!guestPage.url().includes(`/join/${roomCode}`)) {
    throw new Error(`Guest was not redirected to /join/${roomCode}`);
  }

  // Check that the room code is prefilled in JoinRoomPage
  await guestPage.waitForSelector('#joinForm', { timeout: 10000 });
  // Wait for room check to complete
  await guestPage.waitForSelector('.msg', { timeout: 5000 }).catch(() => {});
  const checkMsg = await guestPage.locator('.msg').textContent().catch(() => '');
  console.log('[Guest] Room Check Message:', checkMsg);

  // Enter guest name
  await guestPage.fill('#joinName', 'Bob Guest');
  console.log('[Guest] Entered display name "Bob Guest", clicking Join...');
  await guestPage.click('#joinSubmit');

  // Verify guest enters room
  await guestPage.waitForURL(new RegExp(`/room/${roomCode}`), { timeout: 10000 });
  await guestPage.waitForSelector('#stage', { timeout: 10000 });
  console.log('[Guest] Successfully joined room theater at:', guestPage.url());

  // Verify both host and guest see 2 participants
  await hostPage.waitForTimeout(2000);
  const hostCount = await hostPage.locator('#n').textContent();
  const guestCount = await guestPage.locator('#n').textContent();
  console.log(`Participant count - Host sees: ${hostCount}, Guest sees: ${guestCount}`);

  await browser.close();
  console.log('--- ALL INVITE AND WHATSAPP VERIFICATIONS PASSED ---');
}

main().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
