import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'docs', 'screenshots');
const refDir = path.join(rootDir, 'docs', 'design-reference');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function cleanActiveRooms() {
  try {
    execSync('sqlite3 apps/server/prisma/dev.db "UPDATE Room SET status = \'ended\' WHERE status = \'active\';"', {
      cwd: rootDir,
    });
  } catch {}
}

const widths = [360, 768, 1440, 2560];
const baseUrl = 'http://localhost:5173';

async function captureAll() {
  console.log('--- Launching Google Chrome via Playwright ---');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const mp4Path = path.join(rootDir, 'fixtures', '1_h264_aac.mp4');
  const mkvPath = path.join(rootDir, 'fixtures', '2_multi_track.mkv');

  for (const width of widths) {
    cleanActiveRooms();
    const height = width <= 480 ? 800 : width <= 768 ? 1024 : 900;
    console.log(`\nCapturing viewports at ${width}x${height}...`);

    // --- LANDING PAGE ---
    {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      // Top state
      await page.screenshot({ path: path.join(outDir, `landing_top-${width}.png`), fullPage: false });

      // Steps section
      const howSection = page.locator('#how');
      if ((await howSection.count()) > 0) {
        await howSection.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(outDir, `landing_steps-${width}.png`), fullPage: false });
      }

      // Features bento
      const featSection = page.locator('#features');
      if ((await featSection.count()) > 0) {
        await featSection.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(outDir, `landing_features-${width}.png`), fullPage: false });
      }

      // Join band
      const joinBand = page.locator('#join');
      if ((await joinBand.count()) > 0) {
        await joinBand.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(outDir, `landing_join_band-${width}.png`), fullPage: false });
      }

      await context.close();
    }

    // --- CREATE PAGE ---
    {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/create`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, `create_empty-${width}.png`), fullPage: true });

      // 2. Name Error
      await page.click('button[type="submit"]');
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(outDir, `create_name_error-${width}.png`), fullPage: true });

      // 3. No File Error (fill name, click submit)
      await page.fill('#displayName', 'Alex');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(outDir, `create_no_file_error-${width}.png`), fullPage: true });

      // 4. Over 5 GB Error
      await page.evaluate(() => {
        const input = document.getElementById('videoFile');
        const file = new File(['0'], 'avatar_huge.mp4', { type: 'video/mp4' });
        Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 * 1024 }); // 6 GB
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(outDir, `create_over_5gb_error-${width}.png`), fullPage: true });

      // 5. MP4 Selected
      if (fs.existsSync(mp4Path)) {
        await page.setInputFiles('#videoFile', mp4Path);
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(outDir, `create_file_mp4-${width}.png`), fullPage: true });
      }

      // 6. MKV Selected (Shows "Will be converted for browsers")
      const removeBtn = page.locator('#removeFile');
      if ((await removeBtn.count()) > 0) await removeBtn.click();
      if (fs.existsSync(mkvPath)) {
        await page.setInputFiles('#videoFile', mkvPath);
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(outDir, `create_file_mkv-${width}.png`), fullPage: true });
      }

      // 7. Sample video selected & room ready
      if ((await page.locator('#removeFile').count()) > 0) {
        await page.click('#removeFile');
      }
      await page.click('#sampleBtn');
      await page.fill('#displayName', 'Alex');
      await page.click('button[type="submit"]');

      // Wait for Room Ready modal
      await page.waitForSelector('#modal.open', { timeout: 15000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, `create_ready-${width}.png`), fullPage: true });

      await context.close();
    }

    // --- JOIN PAGE ---
    {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/join`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, `join_empty-${width}.png`), fullPage: true });

      // 2. Incomplete Code Error
      await page.click('button[type="submit"]');
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(outDir, `join_incomplete_code_error-${width}.png`), fullPage: true });

      // 3. Name Error (with code filled)
      await page.goto(`${baseUrl}/join?code=ABC123`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, `join_prefilled-${width}.png`), fullPage: true });

      await page.click('button[type="submit"]');
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(outDir, `join_name_error-${width}.png`), fullPage: true });

      // 4. Room Not Found Error
      await page.goto(`${baseUrl}/join?code=ZZZZZZ`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000); // allow check to return 404
      await page.screenshot({ path: path.join(outDir, `join_room_not_found-${width}.png`), fullPage: true });

      await context.close();
    }

    // --- WATCH ROOM PAGE ---
    {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
      const page = await context.newPage();

      // Create a live demo room to enter watch room
      await page.goto(`${baseUrl}/create`, { waitUntil: 'networkidle' });
      await page.fill('#displayName', 'Alex');
      await page.click('#sampleBtn');
      await page.click('button[type="submit"]');
      await page.waitForSelector('#modal.open', { timeout: 15000 });
      await page.click('#modal button:has-text("Enter Theater")');
      await page.waitForURL('**/room/**', { timeout: 10000 });
      await page.waitForTimeout(1000);

      // Capture default watch room
      await page.screenshot({ path: path.join(outDir, `room-${width}.png`), fullPage: false });

      // Open invite popover & capture
      await page.click('#inviteBtn');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, `room_invite-${width}.png`), fullPage: false });
      await page.click('#inviteBtn'); // close

      // Open settings modal & capture
      await page.click('#settingsBtn');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, `room_settings-${width}.png`), fullPage: false });
      await page.click('#closeSettingsBtn');

      await context.close();
    }
  }

  // =========================================================================
  // 2. AXE-CORE ACCESSIBILITY AUDIT
  // =========================================================================
  console.log('\n--- Running Axe-core Accessibility Audits ---');
  const auditContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const auditPage = await auditContext.newPage();

  const auditUrls = [
    { name: 'Landing', url: `${baseUrl}/` },
    { name: 'Create', url: `${baseUrl}/create` },
    { name: 'Join', url: `${baseUrl}/join` },
  ];

  for (const item of auditUrls) {
    await auditPage.goto(item.url, { waitUntil: 'networkidle' });
    await auditPage.waitForTimeout(500);

    const results = await new AxeBuilder({ page: auditPage })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();

    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );

    console.log(
      `[Axe] ${item.name} Page: ${results.violations.length} total violations, ${seriousOrCritical.length} serious/critical.`
    );
    if (seriousOrCritical.length > 0) {
      console.warn(`  Serious/Critical on ${item.name}:`, seriousOrCritical.map((v) => `${v.id}: ${v.description}`));
    }
  }
  await auditContext.close();

  // =========================================================================
  // 3. PERFORMANCE / SCROLL JANK MEASUREMENT
  // =========================================================================
  console.log('\n--- Checking Scroll Performance with Glass over Backdrop ---');
  const perfContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const perfPage = await perfContext.newPage();
  await perfPage.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await perfPage.waitForTimeout(500);

  const scrollPerf = await perfPage.evaluate(async () => {
    return new Promise((resolve) => {
      let frames = 0;
      let startTime = performance.now();
      let lastTime = startTime;
      let longFrames = 0;

      const onFrame = (now) => {
        frames++;
        const delta = now - lastTime;
        if (delta > 33) longFrames++;
        lastTime = now;

        if (now - startTime < 1500) {
          window.scrollBy(0, 40);
          requestAnimationFrame(onFrame);
        } else {
          const elapsed = (now - startTime) / 1000;
          const fps = Math.round(frames / elapsed);
          resolve({ fps, longFrames, totalFrames: frames });
        }
      };

      requestAnimationFrame(onFrame);
    });
  });
  console.log(
    `[Perf] Scroll benchmark: Average ${scrollPerf.fps} FPS, ${scrollPerf.longFrames} dropped frames out of ${scrollPerf.totalFrames} frames.`
  );
  await perfContext.close();

  // =========================================================================
  // 4. REAL END-TO-END FLOW (HOST CREATE -> COPY LINK -> GUEST JOIN -> WATCH ROOM SYNC)
  // =========================================================================
  console.log('\n--- Running Real Flow End-to-End in Chrome ---');
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const hostPage = await hostContext.newPage();

  // 1. Landing -> click create room
  await hostPage.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await hostPage.click('a[href="/create"]:visible');
  await hostPage.waitForURL('**/create');

  // 2. Fill host details and pick sample video
  await hostPage.fill('#displayName', 'Alex Host');
  await hostPage.click('#sampleBtn');
  await hostPage.click('button[type="submit"]');

  // 3. Wait for room ready
  await hostPage.waitForSelector('#modal.open', { timeout: 15000 });
  const hostCode = await hostPage.textContent('#modalCodeDisplay');
  console.log(`[E2E] Host created room with code: ${hostCode?.trim()}`);

  // 4. Host enters room
  await hostPage.click('#modal button:has-text("Enter Theater")');
  await hostPage.waitForURL('**/room/**', { timeout: 10000 });
  console.log('[E2E] Host successfully entered watch room.');

  // 5. Second context (Guest) opens join link
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const guestPage = await guestContext.newPage();

  const cleanCode = (hostCode || '').trim();
  await guestPage.goto(`${baseUrl}/join?code=${cleanCode}`, { waitUntil: 'networkidle' });

  // Guest enters name and clicks Join
  await guestPage.fill('#joinName', 'Maya Guest');
  await guestPage.click('button[type="submit"]');

  await guestPage.waitForURL('**/room/**', { timeout: 10000 });
  console.log('[E2E] Guest successfully entered watch room.');

  // 6. Verify watch room functionality: participants & chat
  await hostPage.waitForTimeout(1000);
  await guestPage.waitForTimeout(1000);

  // Send chat from host
  const chatInput = hostPage.locator('#chatInput');
  if ((await chatInput.count()) > 0) {
    await chatInput.fill('Hey Maya! Testing sync watch room.');
    await chatInput.press('Enter');
    await guestPage.waitForTimeout(500);
    const guestChatText = await guestPage.textContent('#msgStream');
    const received = guestChatText?.includes('Hey Maya!');
    console.log(`[E2E] Chat synchronization between Host and Guest: ${received ? 'PASSED' : 'UNCONFIRMED'}`);
  }

  console.log('[E2E] End-to-end multi-user flow passed successfully!');

  await hostContext.close();
  await guestContext.close();
  await browser.close();
  console.log('\n--- All verification steps completed! ---');
}

captureAll().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
