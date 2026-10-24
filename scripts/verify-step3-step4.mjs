import { chromium } from 'playwright';
import { attachConsoleGuard } from './verify-console-guards.mjs';

const VIEWPORTS = [
  { name: 'Pixel 9', width: 412, height: 924 },
  { name: 'iPhone 15', width: 393, height: 852 },
  { name: 'Small Phone', width: 360, height: 640 },
  { name: 'Minimum Phone', width: 320, height: 568 },
];

async function run() {
  console.log('--- STARTING STEP 3 & 4 VERIFICATION ACROSS VIEWPORTS ---');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  try {
    for (const vp of VIEWPORTS) {
      console.log(`\nTesting ${vp.name} (${vp.width}x${vp.height})...`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: true,
        hasTouch: true,
      });

      const page = await context.newPage();
      const guard = attachConsoleGuard(page);

      // Create empty room
      const res = await fetch('http://localhost:4000/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Abbas Host', roomName: "Abbas's Room" }),
      });
      const data = await res.json();
      const roomCode = data.room.roomCode;
      const sessionId = data.hostSessionId;

      await page.addInitScript(
        ({ rCode, sId }) => {
          sessionStorage.setItem('sw_name_' + rCode, 'Abbas Host');
          sessionStorage.setItem('cineva_session_' + rCode, sId);
        },
        { rCode: roomCode, sId: sessionId }
      );

      await page.goto(`http://localhost:5173/room/${roomCode}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.stage', { timeout: 10000 });
      await page.waitForTimeout(600);

      const measurements = await page.evaluate(() => {
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

        const shellStyle = window.getComputedStyle(shell);
        const topRect = top.getBoundingClientRect();
        const mainStyle = window.getComputedStyle(main);
        const stageRect = stage.getBoundingClientRect();
        const ringRect = ring ? ring.getBoundingClientRect() : null;
        const h1Style = h1 ? window.getComputedStyle(h1) : null;
        const pStyle = p ? window.getComputedStyle(p) : null;
        const smallStyle = small ? window.getComputedStyle(small) : null;
        const buttonRects = buttons.map((b) => b.getBoundingClientRect());

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
                id: child.id,
                class: child.className,
                rect: { top: rect.top, bottom: rect.bottom, height: rect.height },
                stage: { top: stageRect.top, bottom: stageRect.bottom, height: stageRect.height },
              });
            }
          }
        }

        return {
          shellDisplay: shellStyle.display,
          topHeight: topRect.height,
          mainDisplay: mainStyle.display,
          stageWidth: stageRect.width,
          stageHeight: stageRect.height,
          stageAspectRatio: stageRect.width / stageRect.height,
          dvh40: window.innerHeight * 0.4,
          ringSize: ringRect ? { width: ringRect.width, height: ringRect.height } : null,
          h1FontSize: h1Style ? h1Style.fontSize : null,
          pHidden: !p || pStyle.display === 'none',
          smallHidden: !small || smallStyle.display === 'none',
          buttonHeights: buttonRects.map((b) => b.height),
          clippedChildren,
        };
      });

      console.log(`  Stage: ${measurements.stageWidth}x${measurements.stageHeight} (aspect: ${measurements.stageAspectRatio.toFixed(3)})`);
      console.log(`  Ring: ${measurements.ringSize.width}x${measurements.ringSize.height}, h1: ${measurements.h1FontSize}, p hidden: ${measurements.pHidden}`);
      console.log(`  Clipped: ${measurements.clippedChildren.length}`);

      if (measurements.shellDisplay !== 'grid') throw new Error(`Expected display: grid`);
      if (Math.abs(measurements.stageAspectRatio - 16 / 9) > 0.05) throw new Error(`Expected 16:9 aspect ratio`);
      if (measurements.stageHeight > measurements.dvh40 + 5) throw new Error(`Exceeds 40dvh`);
      if (measurements.clippedChildren.length > 0) throw new Error(`Children clipped!`);

      guard.assertClean(vp.name);
      await context.close();
    }

    console.log('\n======================================================');
    console.log('✅ STEP 3 & STEP 4 VERIFIED ACROSS ALL 4 VIEWPORTS');
    console.log('======================================================');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('STEP 3 & 4 VERIFICATION FAILED:', err);
  process.exit(1);
});
