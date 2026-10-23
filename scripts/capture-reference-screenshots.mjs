import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'docs', 'design-reference');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const widths = [360, 768, 1440, 2560];
const pages = [
  { name: 'landing', file: 'claude/index.html' },
  { name: 'create', file: 'claude/create.html' },
  { name: 'join', file: 'claude/join.html' },
  { name: 'room', file: 'claude/room.html' },
];

async function main() {
  console.log('Launching Chrome via Playwright...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  for (const pageInfo of pages) {
    const filePath = path.join(rootDir, pageInfo.file);
    const fileUrl = `file://${filePath}`;

    for (const width of widths) {
      const height = width <= 480 ? 800 : width <= 768 ? 1024 : 900;
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
      });

      const page = await context.newPage();
      await page.goto(fileUrl, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500); // Allow fonts & CSS transitions to settle

      const outPath = path.join(outDir, `${pageInfo.name}-${width}.png`);
      await page.screenshot({ path: outPath, fullPage: true });
      console.log(`Saved reference screenshot: ${outPath}`);

      await context.close();
    }
  }

  await browser.close();
  console.log('Finished capturing all reference screenshots!');
}

main().catch((err) => {
  console.error('Error capturing reference screenshots:', err);
  process.exit(1);
});
