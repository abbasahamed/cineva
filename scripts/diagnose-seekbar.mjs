import { chromium } from 'playwright';
import path from 'node:path';

const FIXTURES = {
  mp4: path.resolve('fixtures/1_h264_aac.mp4'),
};

async function diagnose() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('1. Navigating to /create...');
  await page.goto('http://localhost:5173/create', { waitUntil: 'networkidle' });
  await page.fill('#displayName', 'Abbas');
  const fileInput = await page.$('#videoFile');
  await fileInput.setInputFiles(FIXTURES.mp4);
  await page.waitForTimeout(500);
  await page.click('#submitBtn');

  console.log('2. Entering theater...');
  const enterBtn = page.locator('#modal.open button:has-text("Enter Theater")');
  await enterBtn.waitFor({ state: 'visible', timeout: 50000 });
  await page.waitForTimeout(500);
  await enterBtn.click({ force: true });
  await page.waitForURL('**/room/**', { timeout: 15000 });

  console.log('3. Room URL:', page.url());
  await page.waitForTimeout(3000);

  // Play movie
  await page.click('#pp');
  await page.waitForTimeout(1000);

  // Diagnose .seek and #ctl
  const diagnostics = await page.evaluate(() => {
    const ctl = document.querySelector('#ctl');
    const seek = document.querySelector('#seek, .seek');
    const buf = document.querySelector('#buf, .buf');
    const pl = document.querySelector('#pl, .pl');
    const tip = document.querySelector('#tip, .tip');
    const video = document.querySelector('video#v');

    const getStyles = (el) => {
      if (!el) return null;
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        rect: { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, left: r.left },
        display: s.display,
        position: s.position,
        height: s.height,
        width: s.width,
        opacity: s.opacity,
        visibility: s.visibility,
        overflow: s.overflow,
        zIndex: s.zIndex,
        background: s.background,
        backgroundColor: s.backgroundColor,
        pointerEvents: s.pointerEvents,
      };
    };

    const seekBefore = seek ? window.getComputedStyle(seek, '::before') : null;
    const plAfter = pl ? window.getComputedStyle(pl, '::after') : null;

    return {
      ctl: {
        exists: !!ctl,
        outerHTMLSnippet: ctl ? ctl.outerHTML.slice(0, 300) : null,
        styles: getStyles(ctl),
      },
      seek: {
        exists: !!seek,
        outerHTML: seek ? seek.outerHTML : null,
        styles: getStyles(seek),
        pseudoBefore: seekBefore ? {
          content: seekBefore.content,
          position: seekBefore.position,
          height: seekBefore.height,
          background: seekBefore.background,
          backgroundColor: seekBefore.backgroundColor,
          borderRadius: seekBefore.borderRadius,
        } : null,
      },
      buf: {
        exists: !!buf,
        styles: getStyles(buf),
      },
      pl: {
        exists: !!pl,
        styles: getStyles(pl),
        pseudoAfter: plAfter ? {
          content: plAfter.content,
          transform: plAfter.transform,
          width: plAfter.width,
          height: plAfter.height,
          background: plAfter.background,
        } : null,
      },
      tip: {
        exists: !!tip,
        styles: getStyles(tip),
      },
      video: {
        currentTime: video?.currentTime,
        duration: video?.duration,
        isFiniteDuration: Number.isFinite(video?.duration),
        readyState: video?.readyState,
        paused: video?.paused,
        seekableRanges: video ? Array.from({ length: video.seekable.length }, (_, i) => ({
          start: video.seekable.start(i),
          end: video.seekable.end(i),
        })) : [],
      },
    };
  });

  console.log('DIAGNOSTICS_RESULT:');
  console.log(JSON.stringify(diagnostics, null, 2));

  // Screenshot before
  await page.screenshot({ path: 'docs/screenshots/seek_before_1440.png' });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshots/seek_before_360.png' });

  await browser.close();
}

diagnose().catch(err => {
  console.error('DIAGNOSE_ERROR:', err);
  process.exit(1);
});
