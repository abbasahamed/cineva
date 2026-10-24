import { chromium } from 'playwright';
import { attachConsoleGuard } from './verify-console-guards.mjs';

async function run() {
  console.log('--- STARTING STEP 7 VERIFICATION (LANDSCAPE PHONE & TABLET) ---');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  try {
    // 1. Landscape Phone (iPhone 15 landscape: 844x390)
    {
      console.log('\nTesting Landscape Phone (844x390)...');
      const context = await browser.newContext({
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true,
      });

      const page = await context.newPage();
      const guard = attachConsoleGuard(page);

      const res = await fetch('http://localhost:4000/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Landscape User', roomName: 'Landscape Room' }),
      });
      const data = await res.json();
      const roomCode = data.room.roomCode;
      const sessionId = data.hostSessionId;

      await page.addInitScript(
        ({ rCode, sId }) => {
          sessionStorage.setItem('sw_name_' + rCode, 'Landscape User');
          sessionStorage.setItem('cineva_session_' + rCode, sId);
        },
        { rCode: roomCode, sId: sessionId }
      );

      await page.goto(`http://localhost:5173/room/${roomCode}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.stage', { timeout: 10000 });
      await page.waitForTimeout(1000);

      const landscapeMetrics = await page.evaluate(() => {
        const stage = document.querySelector('.stage');
        const toggle = document.querySelector('.landscape-drawer-toggle');
        const drawer = document.querySelector('.mobile-tabs-area');

        const stageRect = stage.getBoundingClientRect();
        const toggleStyle = toggle ? window.getComputedStyle(toggle) : null;
        const drawerStyle = drawer ? window.getComputedStyle(drawer) : null;

        return {
          stageWidth: stageRect.width,
          stageHeight: stageRect.height,
          hasToggle: Boolean(toggle),
          toggleDisplay: toggleStyle ? toggleStyle.display : null,
          drawerOpen: drawer ? drawer.classList.contains('open') : false,
          drawerDisplay: drawerStyle ? drawerStyle.display : null,
        };
      });

      console.log('Landscape phone metrics:', landscapeMetrics);
      if (!landscapeMetrics.hasToggle || landscapeMetrics.toggleDisplay === 'none') {
        throw new Error('Expected landscape-drawer-toggle to be visible on landscape phone');
      }
      if (landscapeMetrics.drawerDisplay !== 'none') {
        throw new Error('Expected drawer to be closed/hidden initially in landscape');
      }
      if (Math.abs(landscapeMetrics.stageHeight - 390) > 2) {
        throw new Error(`Expected stage height 100dvh (390px), got ${landscapeMetrics.stageHeight}px`);
      }

      // Click drawer toggle
      await page.click('.landscape-drawer-toggle');
      await page.waitForTimeout(300);

      const drawerAfterToggle = await page.evaluate(() => {
        const drawer = document.querySelector('.mobile-tabs-area');
        const drawerStyle = window.getComputedStyle(drawer);
        return {
          isOpen: drawer.classList.contains('open'),
          display: drawerStyle.display,
          width: drawer.getBoundingClientRect().width,
        };
      });

      console.log('Drawer after toggle:', drawerAfterToggle);
      if (!drawerAfterToggle.isOpen || drawerAfterToggle.display !== 'flex') {
        throw new Error('Drawer failed to open after clicking toggle');
      }

      guard.assertClean('Landscape Phone');
      console.log('PASS: Landscape Phone verified.');
      await context.close();
    }

    // 2. Tablet (iPad mini / 768x1024)
    {
      console.log('\nTesting Tablet (768x1024)...');
      const context = await browser.newContext({
        viewport: { width: 768, height: 1024 },
        isMobile: true,
        hasTouch: true,
      });

      const page = await context.newPage();
      const guard = attachConsoleGuard(page);

      const res = await fetch('http://localhost:4000/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Tablet User', roomName: 'Tablet Room' }),
      });
      const data = await res.json();
      const roomCode = data.room.roomCode;
      const sessionId = data.hostSessionId;

      await page.addInitScript(
        ({ rCode, sId }) => {
          sessionStorage.setItem('sw_name_' + rCode, 'Tablet User');
          sessionStorage.setItem('cineva_session_' + rCode, sId);
        },
        { rCode: roomCode, sId: sessionId }
      );

      await page.goto(`http://localhost:5173/room/${roomCode}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.stage', { timeout: 10000 });
      await page.waitForTimeout(1000);

      const tabletMetrics = await page.evaluate(() => {
        const stage = document.querySelector('.stage');
        const grid = document.querySelector('.mobile-call-grid');
        const desktopAside = document.querySelector('aside.side');
        const mobileTabs = document.querySelector('.mobile-tabs-area');

        const stageRect = stage.getBoundingClientRect();
        const gridStyle = grid ? window.getComputedStyle(grid) : null;

        return {
          stageWidth: stageRect.width,
          stageHeight: stageRect.height,
          dvh45: window.innerHeight * 0.45,
          hasDesktopAside: Boolean(desktopAside),
          hasMobileTabs: Boolean(mobileTabs),
          gridCols: gridStyle ? gridStyle.gridTemplateColumns.split(' ').length : null,
        };
      });

      console.log('Tablet metrics:', tabletMetrics);
      if (tabletMetrics.hasDesktopAside) {
        throw new Error('Tablet should be stacked layout (no desktop aside)');
      }
      if (!tabletMetrics.hasMobileTabs) {
        throw new Error('Tablet should have mobile tabs area');
      }
      if (tabletMetrics.stageHeight > tabletMetrics.dvh45 + 5) {
        throw new Error(`Stage height ${tabletMetrics.stageHeight}px exceeds 45dvh (${tabletMetrics.dvh45}px)`);
      }
      if (tabletMetrics.gridCols !== 3) {
        throw new Error(`Expected 3-column grid on tablet, got ${tabletMetrics.gridCols} columns`);
      }

      guard.assertClean('Tablet');
      console.log('PASS: Tablet verified.');
      await context.close();
    }

    console.log('\n=======================================');
    console.log('✅ STEP 7 VERIFICATION PASSED');
    console.log('=======================================');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('STEP 7 VERIFICATION FAILED:', err);
  process.exit(1);
});
