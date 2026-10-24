import { chromium } from 'playwright';

const DEVICES = [
  { name: 'Pixel 9', width: 412, height: 915, dsf: 2.625, isMobile: true, hasTouch: true },
  { name: 'iPhone 15', width: 393, height: 852, dsf: 3, isMobile: true, hasTouch: true },
  { name: 'Small Phone', width: 360, height: 640, dsf: 2, isMobile: true, hasTouch: true },
];

async function diagnose() {
  console.log('================================================================');
  console.log('        STEP 1: MOBILE OVERFLOW DIAGNOSIS ACROSS DEVICES        ');
  console.log('================================================================\n');

  // Create demo room
  const demoRes = await fetch('http://localhost:4000/api/rooms/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Dev Host' }),
  });
  const demoData = await demoRes.json();
  const roomCode = demoData.room.roomCode;
  const hostSessionId = demoData.hostSessionId;
  console.log(`Created test room ${roomCode} for mobile diagnosis\n`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--no-sandbox'],
  });

  for (const dev of DEVICES) {
    console.log(`\n=================== ${dev.name} (${dev.width}x${dev.height}) ===================`);
    const context = await browser.newContext({
      viewport: { width: dev.width, height: dev.height },
      deviceScaleFactor: dev.dsf,
      isMobile: dev.isMobile,
      hasTouch: dev.hasTouch,
    });

    const page = await context.newPage();
    await page.addInitScript(
      ({ rCode, sId }) => {
        sessionStorage.setItem('sw_name_' + rCode, 'Dev Host');
        sessionStorage.setItem('cineva_session_' + rCode, sId);
        sessionStorage.setItem('sessionId', sId);
      },
      { rCode: roomCode, sId: hostSessionId }
    );

    // 1. Empty Room State (Before Media)
    // Create an empty room
    const emptyRes = await fetch('http://localhost:4000/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Host Empty', roomName: 'Empty Watch Room' }),
    });
    const emptyData = await emptyRes.json();
    const emptyCode = emptyData.room.roomCode;
    const emptySessionId = emptyData.hostSessionId;

    await page.addInitScript(
      ({ rCode, sId }) => {
        sessionStorage.setItem('sw_name_' + rCode, 'Host Empty');
        sessionStorage.setItem('cineva_session_' + rCode, sId);
        sessionStorage.setItem('sessionId', sId);
      },
      { rCode: emptyCode, sId: emptySessionId }
    );

    await page.goto(`http://localhost:5173/room/${emptyCode}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const emptyReport = await page.evaluate(() => {
      const scrollW = document.documentElement.scrollWidth;
      const innerW = window.innerWidth;
      const offenders = [...document.querySelectorAll('body *')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.right > innerW + 1 || r.width > innerW + 1;
        })
        .map((e) => ({
          tag: e.tagName,
          id: e.id || '',
          cls: (e.className && e.className.toString().slice(0, 80)) || '',
          w: Math.round(e.getBoundingClientRect().width),
          right: Math.round(e.getBoundingClientRect().right),
        }));
      return { scrollW, innerW, overflow: scrollW > innerW, count: offenders.length, offenders };
    });

    console.log(`[EMPTY STATE] scrollWidth: ${emptyReport.scrollW}px | innerWidth: ${emptyReport.innerW}px | Overflow: ${emptyReport.overflow}`);
    console.log(`Widest Offending Elements (${emptyReport.offenders.length} total):`);
    // Deduplicate and group by tag+id+cls
    const topEmpty = emptyReport.offenders.sort((a, b) => b.w - a.w).slice(0, 10);
    topEmpty.forEach((o, i) => {
      console.log(`  #${i + 1} <${o.tag.toLowerCase()}${o.id ? '#' + o.id : ''}> w=${o.w}px, right=${o.right}px | cls="${o.cls}"`);
    });

    // 2. Playing / Media State
    await page.goto(`http://localhost:5173/room/${roomCode}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const playingReport = await page.evaluate(() => {
      const scrollW = document.documentElement.scrollWidth;
      const innerW = window.innerWidth;
      const offenders = [...document.querySelectorAll('body *')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.right > innerW + 1 || r.width > innerW + 1;
        })
        .map((e) => ({
          tag: e.tagName,
          id: e.id || '',
          cls: (e.className && e.className.toString().slice(0, 80)) || '',
          w: Math.round(e.getBoundingClientRect().width),
          right: Math.round(e.getBoundingClientRect().right),
        }));
      return { scrollW, innerW, overflow: scrollW > innerW, count: offenders.length, offenders };
    });

    console.log(`\n[PLAYING STATE] scrollWidth: ${playingReport.scrollW}px | innerWidth: ${playingReport.innerW}px | Overflow: ${playingReport.overflow}`);
    console.log(`Widest Offending Elements (${playingReport.offenders.length} total):`);
    const topPlaying = playingReport.offenders.sort((a, b) => b.w - a.w).slice(0, 15);
    topPlaying.forEach((o, i) => {
      console.log(`  #${i + 1} <${o.tag.toLowerCase()}${o.id ? '#' + o.id : ''}> w=${o.w}px, right=${o.right}px | cls="${o.cls}"`);
    });

    await context.close();
  }

  await browser.close();
}

diagnose().catch(console.error);
