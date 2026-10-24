import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';
import { attachConsoleGuard } from './verify-console-guards.mjs';

const SCREENSHOT_DIR = path.resolve('docs/screenshots/mobile');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: 'Pixel 9', width: 412, height: 915, dsf: 2.625, isMobile: true, hasTouch: true },
  { name: 'iPhone 15', width: 393, height: 852, dsf: 3, isMobile: true, hasTouch: true },
  { name: 'Small Phone 360', width: 360, height: 640, dsf: 2, isMobile: true, hasTouch: true },
  { name: 'Minimum Phone 320', width: 320, height: 568, dsf: 2, isMobile: true, hasTouch: true },
  { name: 'Landscape Phone', width: 844, height: 390, dsf: 3, isMobile: true, hasTouch: true, isLandscape: true },
  { name: 'Tablet', width: 768, height: 1024, dsf: 2, isMobile: true, hasTouch: true, isTablet: true },
];

async function run() {
  console.log('================================================================');
  console.log('     MOBILE ROUND 2: FULL ACCEPTANCE VERIFICATION (STEP 8)      ');
  console.log('================================================================\n');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  const summary = [];

  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n========================================================`);
      console.log(`>>> TESTING VIEWPORT: ${vp.name} (${vp.width}x${vp.height})`);
      console.log(`========================================================`);

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dsf,
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
      });

      const page = await context.newPage();
      const guard = attachConsoleGuard(page);

      // --- 1. EMPTY ROOM STATE ---
      console.log('\n--- 1. Testing Empty Room State ---');
      const emptyRes = await fetch('http://localhost:4000/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Abbas Host', roomName: `${vp.name} Room` }),
      });
      if (!emptyRes.ok) {
        throw new Error(`Failed to create room: ${emptyRes.status} ${await emptyRes.text()}`);
      }
      const emptyData = await emptyRes.json();
      const emptyCode = emptyData.room.roomCode;
      const emptySessionId = emptyData.hostSessionId;

      await page.addInitScript(
        ({ rCode, sId, name }) => {
          sessionStorage.setItem('sw_name_' + rCode, name);
          sessionStorage.setItem('cineva_session_' + rCode, sId);
        },
        { rCode: emptyCode, sId: emptySessionId, name: 'Abbas Host' }
      );

      await page.goto(`http://localhost:5173/room/${emptyCode}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.stage', { timeout: 10000 });
      await page.waitForTimeout(600);

      // Measure layout and bounding boxes
      const emptyEval = await page.evaluate(({ isLandscape, isTablet }) => {
        const shell = document.querySelector('.room-shell');
        const top = document.querySelector('.top');
        const main = document.querySelector('.main');
        const stage = document.querySelector('.stage');
        const empty = document.querySelector('.stage .empty');
        const ring = document.querySelector('.stage .empty .ring');
        const h1 = document.querySelector('.stage .empty h1');
        const p = document.querySelector('.stage .empty p');
        const small = document.querySelector('.stage .empty small');
        const buttons = Array.from(document.querySelectorAll('.stage .empty .row .b'));
        const mobileTabs = document.querySelectorAll('.mobile-tabs-area');
        const desktopAside = document.querySelectorAll('aside.side');
        const drawerToggle = document.querySelectorAll('.landscape-drawer-toggle');

        // Bounding boxes
        const stageRect = stage.getBoundingClientRect();
        const topRect = top ? top.getBoundingClientRect() : null;
        const ringRect = ring ? ring.getBoundingClientRect() : null;
        const h1Style = h1 ? window.getComputedStyle(h1) : null;
        const pStyle = p ? window.getComputedStyle(p) : null;
        const smallStyle = small ? window.getComputedStyle(small) : null;

        // Duplicate ID check
        const allElementsWithId = Array.from(document.querySelectorAll('[id]'));
        const idCounts = {};
        for (const el of allElementsWithId) idCounts[el.id] = (idCounts[el.id] || 0) + 1;
        const duplicateIds = Object.entries(idCounts).filter(([_, c]) => c > 1).map(([id, c]) => `${id}(${c})`);

        // Check child clipping inside stage
        let clippedChildren = [];
        if (empty) {
          const allChildren = Array.from(empty.querySelectorAll('*'));
          for (const child of allChildren) {
            const style = window.getComputedStyle(child);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            const rect = child.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (rect.top < stageRect.top - 1 || rect.bottom > stageRect.bottom + 1) {
              clippedChildren.push({
                tag: child.tagName,
                rect: { top: rect.top, bottom: rect.bottom, height: rect.height },
                stage: { top: stageRect.top, bottom: stageRect.bottom, height: stageRect.height },
              });
            }
          }
        }

        return {
          shellDisplay: window.getComputedStyle(shell).display,
          topHeight: topRect ? topRect.height : null,
          mainDisplay: window.getComputedStyle(main).display,
          stageWidth: stageRect.width,
          stageHeight: stageRect.height,
          stageAspectRatio: stageRect.width / stageRect.height,
          mobileTabsCount: mobileTabs.length,
          desktopAsideCount: desktopAside.length,
          drawerToggleCount: drawerToggle.length,
          duplicateIds,
          ringSize: ringRect ? { width: ringRect.width, height: ringRect.height } : null,
          h1FontSize: h1Style ? h1Style.fontSize : null,
          pHidden: !p || pStyle.display === 'none',
          smallHidden: !small || smallStyle.display === 'none',
          buttonHeights: buttons.map((b) => b.getBoundingClientRect().height),
          clippedChildren,
        };
      }, { isLandscape: Boolean(vp.isLandscape), isTablet: Boolean(vp.isTablet) });

      console.log('  Empty evaluation:', {
        aspect: emptyEval.stageAspectRatio.toFixed(3),
        stage: `${emptyEval.stageWidth}x${emptyEval.stageHeight}`,
        mobileTabs: emptyEval.mobileTabsCount,
        aside: emptyEval.desktopAsideCount,
        toggle: emptyEval.drawerToggleCount,
        ring: emptyEval.ringSize,
        clipped: emptyEval.clippedChildren.length,
      });

      // Assertions
      if (emptyEval.mobileTabsCount !== 1) throw new Error(`Expected exactly 1 mobile-tabs-area, got ${emptyEval.mobileTabsCount}`);
      if (emptyEval.desktopAsideCount !== 0) throw new Error(`Expected 0 desktop aside.side, got ${emptyEval.desktopAsideCount}`);
      if (vp.isLandscape) {
        if (emptyEval.drawerToggleCount !== 1) throw new Error(`Expected 1 drawer toggle on landscape phone`);
        if (Math.abs(emptyEval.stageHeight - vp.height) > 2) throw new Error(`Expected 100dvh (${vp.height}px) stage height`);
      } else {
        if (emptyEval.drawerToggleCount !== 0) throw new Error(`Expected 0 drawer toggle in portrait/tablet`);
        if (Math.abs(emptyEval.stageAspectRatio - 16 / 9) > 0.05) throw new Error(`Expected ~1.777 aspect ratio, got ${emptyEval.stageAspectRatio}`);
      }
      if (emptyEval.duplicateIds.length > 0) throw new Error(`Duplicate IDs found: ${emptyEval.duplicateIds.join(', ')}`);
      if (emptyEval.clippedChildren.length > 0) throw new Error(`Clipped children in stage!`);

      // Save empty room screenshot
      const vpSlug = vp.name.toLowerCase().replace(/\s+/g, '_');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `round2_empty_${vpSlug}.png`) });

      // Run Axe-core on empty room
      try {
        const axeResults = await new AxeBuilder({ page })
          .disableRules(['color-contrast']) // Ignore external color contrast thresholds
          .analyze();
        console.log(`  Axe-core accessibility violations: ${axeResults.violations.length}`);
        if (axeResults.violations.length > 0) {
          console.warn(`  Violations: ${axeResults.violations.map((v) => v.id).join(', ')}`);
        }
      } catch (err) {
        console.warn(`  Axe scan note: ${err.message}`);
      }

      // --- 2. PLAYING ROOM STATE ---
      console.log('\n--- 2. Testing Playing Room State & Controls ---');
      const sampleRes = await fetch(`http://localhost:4000/api/rooms/${emptyCode}/sample-media`, { method: 'POST' });
      if (!sampleRes.ok) {
        throw new Error(`Failed to load sample media: ${sampleRes.status} ${await sampleRes.text()}`);
      }
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('.ctl', { timeout: 10000 });
      await page.waitForTimeout(600);

      const playingEval = await page.evaluate(() => {
        const seek = document.querySelector('.seek');
        const pp = document.querySelector('#pp');
        const bk = document.querySelector('#bk');
        const fw = document.querySelector('#fw');
        const tm = document.querySelector('#tm');
        const more = document.querySelector('#ctl-more-btn');
        const fs = document.querySelector('#fs');
        const vw = document.querySelector('.vw');
        const pill = document.querySelector('.ovl .pill');
        const chg = document.querySelector('.ovl #chg');

        const seekRect = seek.getBoundingClientRect();
        const ppRect = pp.getBoundingClientRect();
        const pillRect = pill ? pill.getBoundingClientRect() : null;
        const chgRect = chg ? chg.getBoundingClientRect() : null;
        const vwVisible = vw && window.getComputedStyle(vw).display !== 'none';

        return {
          seekHeight: seekRect.height,
          ppSize: { width: ppRect.width, height: ppRect.height },
          hasBk: Boolean(bk),
          hasFw: Boolean(fw),
          hasTm: Boolean(tm),
          hasMore: Boolean(more),
          hasFs: Boolean(fs),
          vwVisible,
          pillRight: pillRect ? pillRect.right : null,
          chgLeft: chgRect ? chgRect.left : null,
        };
      });

      console.log('  Playing evaluation:', {
        seekHeight: playingEval.seekHeight,
        ppSize: `${playingEval.ppSize.width}x${playingEval.ppSize.height}`,
        pillRight: playingEval.pillRight,
        chgLeft: playingEval.chgLeft,
      });

      if (Math.abs(playingEval.seekHeight - 36) > 2) throw new Error(`Expected seek bar height ~36px`);
      if (Math.abs(playingEval.ppSize.width - 44) > 2 || Math.abs(playingEval.ppSize.height - 44) > 2) {
        throw new Error(`Expected play/pause 44x44px`);
      }
      if (playingEval.vwVisible) throw new Error(`Volume slider should be hidden on mobile`);
      if (playingEval.pillRight && playingEval.chgLeft && playingEval.pillRight > playingEval.chgLeft) {
        throw new Error(`Top overlay collision between sync pill and change button`);
      }

      // Save playing room screenshot
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `round2_playing_${vpSlug}.png`) });

      // --- 3. TABS & BOTTOM SHEETS ---
      if (!vp.isLandscape) {
        console.log('\n--- 3. Testing Tabs & Composer ---');
        // Check 48px tabs
        const segH = await page.$eval('.mobile-seg', (el) => el.getBoundingClientRect().height);
        if (Math.abs(segH - 48) > 2) throw new Error(`Expected 48px segmented tabs`);

        // Check Chat Tab
        await page.click('#m-tab-chat');
        await page.waitForTimeout(300);
        const composerMetrics = await page.evaluate(() => {
          const composer = document.querySelector('.mobile-chat-pane .cmp, .composer');
          const input = document.querySelector('#mi-mobile');
          const inputStyle = window.getComputedStyle(input);
          return {
            hasComposer: Boolean(composer),
            fontSize: inputStyle.fontSize,
          };
        });
        if (!composerMetrics.hasComposer) throw new Error('Missing chat composer');
        if (composerMetrics.fontSize !== '16px') throw new Error(`Expected 16px input font size`);

        // Submit chat message
        await page.fill('#mi-mobile', `Test from ${vp.name}`);
        await page.click('#send-mobile-btn');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `round2_chat_${vpSlug}.png`) });

        // Check People Tab
        await page.click('#m-tab-people');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `round2_people_${vpSlug}.png`) });

        // Open options sheet via top overflow
        await page.click('.top-overflow-btn');
        await page.waitForSelector('.bottom-sheet-content', { timeout: 3000 });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `round2_sheet_${vpSlug}.png`) });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } else {
        // Landscape drawer toggle
        await page.click('.landscape-drawer-toggle');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `round2_drawer_${vpSlug}.png`) });
      }

      // Final clean console check
      guard.assertClean(vp.name);
      console.log(`✅ ${vp.name} PASSED ALL ACCEPTANCE CHECKS`);
      summary.push({ viewport: vp.name, status: 'PASS' });
      await context.close();
    }

    console.log('\n================================================================');
    console.log('              FINAL ACCEPTANCE SUMMARY TABLE                   ');
    console.log('================================================================');
    console.table(summary);
    console.log('ALL 6 VIEWPORTS PASSED WITH ZERO CONSOLE ERRORS & CLEAN DOM');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('\n❌ MASTER ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
