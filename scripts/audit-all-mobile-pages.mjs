import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const VIEWPORTS = [
  { name: '320px', width: 320, height: 600, isMobile: true, hasTouch: true },
  { name: '360px', width: 360, height: 640, isMobile: true, hasTouch: true },
  { name: '390px', width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: '412px', width: 412, height: 915, isMobile: true, hasTouch: true },
  { name: '430px', width: 430, height: 932, isMobile: true, hasTouch: true },
  { name: '768px', width: 768, height: 1024, isMobile: true, hasTouch: true },
  { name: '844x390-landscape', width: 844, height: 390, isMobile: true, hasTouch: true },
];

const SCREENSHOT_DIR = path.resolve('docs/screenshots/mobile');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function audit() {
  console.log('================================================================');
  console.log('       STEP 3: COMPREHENSIVE MOBILE AUDIT ACROSS ALL PAGES      ');
  console.log('================================================================\n');

  // Create demo room for WatchRoom checks
  const demoRes = await fetch('http://localhost:4000/api/rooms/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Dev Host' }),
  });
  const demoData = await demoRes.json();
  const roomCode = demoData.room.roomCode;
  const hostSessionId = demoData.hostSessionId;

  // Create empty room for WatchRoom Empty State
  const emptyRes = await fetch('http://localhost:4000/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Host Empty', roomName: 'Empty Watch Room' }),
  });
  const emptyData = await emptyRes.json();
  const emptyCode = emptyData.room.roomCode;
  const emptySessionId = emptyData.hostSessionId;

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--no-sandbox'],
  });

  const pagesToTest = [
    { id: 'landing', path: '/', name: 'Landing Page' },
    { id: 'create', path: '/create', name: 'Create Room Page' },
    { id: 'join', path: '/join', name: 'Join Room Page' },
    { id: 'join-prefilled', path: `/join/${roomCode}`, name: 'Join Room (Prefilled Code)' },
    { id: 'diagnostics', path: '/diagnostics', name: 'Diagnostics Page' },
    { id: 'room-empty', path: `/room/${emptyCode}`, name: 'Watch Room (Empty)', auth: { rCode: emptyCode, sId: emptySessionId, name: 'Host Empty' } },
    { id: 'room-playing', path: `/room/${roomCode}`, name: 'Watch Room (Playing)', auth: { rCode: roomCode, sId: hostSessionId, name: 'Dev Host' } },
  ];

  let totalFailures = 0;
  const results = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n=================== Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ===================`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
    });

    const page = await context.newPage();

    for (const pageConfig of pagesToTest) {
      if (pageConfig.auth) {
        await page.addInitScript(
          ({ rCode, sId, name }) => {
            sessionStorage.setItem('sw_name_' + rCode, name);
            sessionStorage.setItem('cineva_session_' + rCode, sId);
            sessionStorage.setItem('sessionId', sId);
          },
          pageConfig.auth
        );
      }

      const targetUrl = `http://localhost:5173${pageConfig.path}`;
      await page.goto(targetUrl, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      // Measure layout metrics
      const report = await page.evaluate(() => {
        const scrollW = document.documentElement.scrollWidth;
        const innerW = window.innerWidth;
        const bodyScrollW = document.body.scrollWidth;

        // Check if any element overflows the viewport horizontally
        const offenders = [...document.querySelectorAll('body *')]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            // allow 1px rounding tolerance
            return r.right > innerW + 1.5 || r.width > innerW + 1.5;
          })
          .map((e) => ({
            tag: e.tagName,
            id: e.id || '',
            cls: (e.className && e.className.toString().slice(0, 80)) || '',
            w: Math.round(e.getBoundingClientRect().width),
            right: Math.round(e.getBoundingClientRect().right),
          }));

        // Check input font sizes (should be >= 16px to prevent iOS auto-zoom)
        const inputs = [...document.querySelectorAll('input:not([type="hidden"]):not([type="range"]):not([type="checkbox"])')]
          .map((el) => {
            const cs = window.getComputedStyle(el);
            const fs = parseFloat(cs.fontSize);
            return {
              id: el.id || '',
              fontSize: fs,
              name: el.getAttribute('name') || el.getAttribute('aria-label') || el.placeholder || '',
            };
          })
          .filter((inp) => inp.fontSize < 15.5);

        return {
          scrollW,
          innerW,
          bodyScrollW,
          hasOverflow: scrollW > innerW + 1 || bodyScrollW > innerW + 1,
          offendersCount: offenders.length,
          topOffenders: offenders.slice(0, 5),
          smallInputs: inputs,
        };
      });

      const pass = !report.hasOverflow && report.offendersCount === 0;
      if (!pass) totalFailures++;

      const statusStr = pass ? 'PASS ✅' : 'FAIL ❌';
      console.log(`[${vp.name}] ${pageConfig.name.padEnd(28)}: ${statusStr} (scrollW: ${report.scrollW}px, innerW: ${report.innerW}px)`);

      if (!pass) {
        console.log(`   ⚠️ Found ${report.offendersCount} offending overflow elements:`);
        report.topOffenders.forEach((o) => {
          console.log(`      <${o.tag.toLowerCase()}${o.id ? '#' + o.id : ''}> w=${o.w}px, right=${o.right}px | cls="${o.cls}"`);
        });
      }

      if (report.smallInputs.length > 0) {
        console.log(`   ℹ️ Note: ${report.smallInputs.length} inputs with font-size < 16px:`, report.smallInputs);
      }

      // Save screenshot for key device sizes
      if (['360px', '390px', '412px', '844x390-landscape'].includes(vp.name)) {
        const shotName = `${pageConfig.id}_${vp.name}.png`;
        const shotPath = path.join(SCREENSHOT_DIR, shotName);
        await page.screenshot({ path: shotPath, fullPage: false });
      }

      results.push({
        viewport: vp.name,
        page: pageConfig.name,
        pass,
        scrollW: report.scrollW,
        innerW: report.innerW,
        offenders: report.offendersCount,
      });
    }

    await context.close();
  }

  await browser.close();

  console.log('\n================================================================');
  console.log(`AUDIT COMPLETE: ${totalFailures === 0 ? 'ALL PASSED ✅' : `${totalFailures} FAILURES DETECTED ❌`}`);
  console.log('================================================================');

  return totalFailures === 0;
}

audit()
  .then((success) => process.exit(success ? 0 : 1))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
