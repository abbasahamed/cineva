import { chromium } from 'playwright';
import { attachConsoleGuard } from './verify-console-guards.mjs';

async function run() {
  console.log('--- STARTING STEP 2 VERIFICATION ---');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  try {
    // 1. Mobile Portrait (Pixel 9 412x924)
    {
      console.log('\nTesting Mobile Portrait (Pixel 9 412x924)...');
      const context = await browser.newContext({
        viewport: { width: 412, height: 924 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const guard = attachConsoleGuard(page);

      const res = await fetch('http://localhost:4000/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Tester', roomName: 'Test Room' }),
      });
      const data = await res.json();
      const roomCode = data.room.roomCode;
      const sessionId = data.hostSessionId;

      await page.addInitScript(
        ({ rCode, sId }) => {
          sessionStorage.setItem('sw_name_' + rCode, 'Tester');
          sessionStorage.setItem('cineva_session_' + rCode, sId);
        },
        { rCode: roomCode, sId: sessionId }
      );

      await page.goto(`http://localhost:5173/room/${roomCode}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.room-shell', { timeout: 10000 });
      await page.waitForTimeout(1000);

      // Verify Call tab
      let ev = await page.evaluate(() => {
        const mobileTabs = document.querySelectorAll('.mobile-tabs-area');
        const desktopAside = document.querySelectorAll('aside.side');
        const drawerToggle = document.querySelectorAll('.landscape-drawer-toggle');
        const tiles = document.querySelectorAll('.tile:not(.add)');
        const allElementsWithId = Array.from(document.querySelectorAll('[id]'));
        const idCounts = {};
        for (const el of allElementsWithId) idCounts[el.id] = (idCounts[el.id] || 0) + 1;
        const duplicateIds = Object.entries(idCounts).filter(([_, c]) => c > 1).map(([id, c]) => `${id}(${c})`);
        return { mobileTabs: mobileTabs.length, desktopAside: desktopAside.length, drawerToggle: drawerToggle.length, tiles: tiles.length, duplicateIds };
      });

      if (ev.mobileTabs !== 1) throw new Error(`Expected 1 mobile-tabs-area, got ${ev.mobileTabs}`);
      if (ev.desktopAside !== 0) throw new Error(`Expected 0 aside.side, got ${ev.desktopAside}`);
      if (ev.drawerToggle !== 0) throw new Error(`Expected 0 landscape-drawer-toggle, got ${ev.drawerToggle}`);
      if (ev.tiles !== 1) throw new Error(`Expected 1 video tile on Call tab, got ${ev.tiles}`);
      if (ev.duplicateIds.length > 0) throw new Error(`Found duplicate IDs on Call tab: ${ev.duplicateIds.join(', ')}`);

      // Switch to Chat tab
      await page.click('#m-tab-chat');
      await page.waitForTimeout(300);

      ev = await page.evaluate(() => {
        const forms = document.querySelectorAll('form.cmp, form.composer');
        const allElementsWithId = Array.from(document.querySelectorAll('[id]'));
        const idCounts = {};
        for (const el of allElementsWithId) idCounts[el.id] = (idCounts[el.id] || 0) + 1;
        const duplicateIds = Object.entries(idCounts).filter(([_, c]) => c > 1).map(([id, c]) => `${id}(${c})`);
        return { forms: forms.length, duplicateIds };
      });

      if (ev.forms !== 1) throw new Error(`Expected 1 chat form on Chat tab, got ${ev.forms}`);
      if (ev.duplicateIds.length > 0) throw new Error(`Found duplicate IDs on Chat tab: ${ev.duplicateIds.join(', ')}`);

      guard.assertClean('Mobile Portrait');
      console.log('PASS: Mobile Portrait verified (1 sidebar, 0 desktop aside, 0 toggle, 1 tile, 1 composer when on chat, 0 duplicate IDs)');
      await context.close();
    }

    // 2. Desktop (1280x800)
    {
      console.log('\nTesting Desktop (1280x800)...');
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      const guard = attachConsoleGuard(page);

      const res = await fetch('http://localhost:4000/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Desktop Tester', roomName: 'Desktop Room' }),
      });
      const data = await res.json();
      const roomCode = data.room.roomCode;
      const sessionId = data.hostSessionId;

      await page.addInitScript(
        ({ rCode, sId }) => {
          sessionStorage.setItem('sw_name_' + rCode, 'Desktop Tester');
          sessionStorage.setItem('cineva_session_' + rCode, sId);
        },
        { rCode: roomCode, sId: sessionId }
      );

      await page.goto(`http://localhost:5173/room/${roomCode}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.room-shell', { timeout: 10000 });
      await page.waitForTimeout(1000);

      const ev = await page.evaluate(() => {
        const mobileTabs = document.querySelectorAll('.mobile-tabs-area');
        const desktopAside = document.querySelectorAll('aside.side');
        const drawerToggle = document.querySelectorAll('.landscape-drawer-toggle');
        const forms = document.querySelectorAll('form.cmp, form.composer');
        const tiles = document.querySelectorAll('.tile:not(.add)');
        const allElementsWithId = Array.from(document.querySelectorAll('[id]'));
        const idCounts = {};
        for (const el of allElementsWithId) idCounts[el.id] = (idCounts[el.id] || 0) + 1;
        const duplicateIds = Object.entries(idCounts).filter(([_, c]) => c > 1).map(([id, c]) => `${id}(${c})`);
        return { mobileTabs: mobileTabs.length, desktopAside: desktopAside.length, drawerToggle: drawerToggle.length, forms: forms.length, tiles: tiles.length, duplicateIds };
      });

      if (ev.mobileTabs !== 0) throw new Error(`Expected 0 mobile-tabs-area, got ${ev.mobileTabs}`);
      if (ev.desktopAside !== 1) throw new Error(`Expected 1 aside.side, got ${ev.desktopAside}`);
      if (ev.drawerToggle !== 0) throw new Error(`Expected 0 landscape-drawer-toggle, got ${ev.drawerToggle}`);
      if (ev.forms !== 1) throw new Error(`Expected 1 chat form, got ${ev.forms}`);
      if (ev.tiles !== 1) throw new Error(`Expected 1 video tile, got ${ev.tiles}`);
      if (ev.duplicateIds.length > 0) throw new Error(`Found duplicate IDs: ${ev.duplicateIds.join(', ')}`);

      guard.assertClean('Desktop');
      console.log('PASS: Desktop verified (0 mobile-tabs-area, 1 aside.side, 0 toggle, 1 tile, 1 composer, 0 duplicate IDs)');
      await context.close();
    }

    // 3. Landscape Phone (844x390)
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
        body: JSON.stringify({ displayName: 'Landscape Tester', roomName: 'Landscape Room' }),
      });
      const data = await res.json();
      const roomCode = data.room.roomCode;
      const sessionId = data.hostSessionId;

      await page.addInitScript(
        ({ rCode, sId }) => {
          sessionStorage.setItem('sw_name_' + rCode, 'Landscape Tester');
          sessionStorage.setItem('cineva_session_' + rCode, sId);
        },
        { rCode: roomCode, sId: sessionId }
      );

      await page.goto(`http://localhost:5173/room/${roomCode}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.room-shell', { timeout: 10000 });
      await page.waitForTimeout(1000);

      const ev = await page.evaluate(() => {
        const mobileTabs = document.querySelectorAll('.mobile-tabs-area');
        const desktopAside = document.querySelectorAll('aside.side');
        const drawerToggle = document.querySelectorAll('.landscape-drawer-toggle');
        const allElementsWithId = Array.from(document.querySelectorAll('[id]'));
        const idCounts = {};
        for (const el of allElementsWithId) idCounts[el.id] = (idCounts[el.id] || 0) + 1;
        const duplicateIds = Object.entries(idCounts).filter(([_, c]) => c > 1).map(([id, c]) => `${id}(${c})`);
        return { mobileTabs: mobileTabs.length, desktopAside: desktopAside.length, drawerToggle: drawerToggle.length, duplicateIds };
      });

      if (ev.mobileTabs !== 1) throw new Error(`Expected 1 mobile-tabs-area, got ${ev.mobileTabs}`);
      if (ev.desktopAside !== 0) throw new Error(`Expected 0 aside.side, got ${ev.desktopAside}`);
      if (ev.drawerToggle !== 1) throw new Error(`Expected 1 landscape-drawer-toggle, got ${ev.drawerToggle}`);
      if (ev.duplicateIds.length > 0) throw new Error(`Found duplicate IDs: ${ev.duplicateIds.join(', ')}`);

      guard.assertClean('Landscape Phone');
      console.log('PASS: Landscape Phone verified (1 mobile-tabs-area, 0 aside.side, 1 drawer toggle, 0 duplicate IDs)');
      await context.close();
    }

    console.log('\n=======================================');
    console.log('✅ STEP 2 VERIFICATION PASSED COMPLETELY');
    console.log('=======================================');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('STEP 2 VERIFICATION FAILED:', err);
  process.exit(1);
});
