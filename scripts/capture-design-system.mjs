import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('docs/screenshots/baseline');
fs.mkdirSync(outDir, { recursive: true });

async function waitForServer(url, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200 || res.status === 304) return true;
    } catch {
      // Wait a bit
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server at ${url} did not respond within ${timeout}ms`);
}

async function run() {
  console.log('[Capture] Checking Vite dev server on port 5173...');
  let viteProcess = null;
  let isRunning = false;
  try {
    await waitForServer('http://localhost:5173', 2000);
    isRunning = true;
    console.log('[Capture] Vite dev server already running on port 5173.');
  } catch {
    console.log('[Capture] Spawning Vite dev server...');
    viteProcess = spawn('npx', ['vite', '--port', '5173'], {
      cwd: path.resolve('apps/web'),
      stdio: 'pipe',
    });
    await waitForServer('http://localhost:5173', 15000);
    console.log('[Capture] Vite dev server ready.');
  }

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });

  console.log('[Capture] Navigating to http://localhost:5173/design-system...');
  await page.goto('http://localhost:5173/design-system', { waitUntil: 'networkidle' });

  // 1. Capture Ambient Dark Backdrop
  console.log('[Capture] Capturing Ambient Dark backdrop...');
  await page.screenshot({
    path: path.join(outDir, 'design_system_ambient_dark.png'),
    fullPage: true,
  });

  // 2. Switch to Bright Video Backdrop & Capture
  console.log('[Capture] Capturing Bright Video backdrop...');
  const brightBtn = page.getByRole('button', { name: 'Bright Video' });
  await brightBtn.click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(outDir, 'design_system_bright_video.png'),
    fullPage: true,
  });

  // 3. Switch to Dark Video Backdrop & Capture
  console.log('[Capture] Capturing Dark Video backdrop...');
  const darkBtn = page.getByRole('button', { name: 'Dark Video' });
  await darkBtn.click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(outDir, 'design_system_dark_video.png'),
    fullPage: true,
  });

  // 4. Capture Mobile Viewport (412px Pixel 9)
  console.log('[Capture] Capturing Mobile Viewport (412x915)...');
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(outDir, 'design_system_mobile_412.png'),
    fullPage: true,
  });

  await browser.close();

  if (viteProcess) {
    viteProcess.kill('SIGTERM');
  }

  console.log('[Capture] Complete! Baseline screenshots written to docs/screenshots/baseline/');
}

run().catch((err) => {
  console.error('[Capture] Error:', err);
  process.exit(1);
});
