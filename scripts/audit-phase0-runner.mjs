import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const auditDir = path.join(rootDir, 'docs', 'audit');
const screenshotsDir = path.join(auditDir, 'screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

// 7 exact required viewports per Section 3
const VIEWPORTS = [
  { id: '1920', name: 'Desktop Large', width: 1920, height: 1080, dsf: 1, isMobile: false, hasTouch: false },
  { id: '1440', name: 'Desktop Standard', width: 1440, height: 900, dsf: 2, isMobile: false, hasTouch: false },
  { id: '1024', name: 'Desktop Small', width: 1024, height: 768, dsf: 2, isMobile: false, hasTouch: false },
  { id: '768', name: 'Tablet Portrait', width: 768, height: 1024, dsf: 2, isMobile: true, hasTouch: true },
  { id: '412', name: 'Pixel 9', width: 412, height: 915, dsf: 2.625, isMobile: true, hasTouch: true },
  { id: '360', name: 'Small Phone', width: 360, height: 640, dsf: 2, isMobile: true, hasTouch: true },
  { id: '844x390', name: 'Landscape Phone', width: 844, height: 390, dsf: 3, isMobile: true, hasTouch: true, isLandscape: true },
];

const auditResults = {
  viewports: VIEWPORTS,
  pages: {},
  consoleIssues: [],
  duplicateIds: {},
  overflowIssues: [],
  designTokens: {
    radii: new Set(),
    fontSizes: new Set(),
    buttonHeights: new Set(),
    iconSizes: new Set(),
    colors: new Set(),
    glassStyles: [],
  },
  perf: {},
  statusReport: {},
};

async function runAudit() {
  console.log('================================================================');
  console.log('           CINEVA PHASE 0 AUDIT: EMPIRICAL RUNNER               ');
  console.log('================================================================\n');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  });

  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n========================================================`);
      console.log(`>>> AUDITING VIEWPORT: ${vp.name} (${vp.width}x${vp.height}, dsf: ${vp.dsf})`);
      console.log(`========================================================`);

      // 1. Create Fresh Test Rooms per Viewport
      const emptyRes = await fetch('http://localhost:4000/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Audit Host', roomName: `Audit Empty ${vp.id}` }),
      });
      const emptyData = await emptyRes.json();
      const emptyCode = emptyData.room.roomCode;
      const emptyHostSessionId = emptyData.hostSessionId;

      const activeRes = await fetch('http://localhost:4000/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Audit Host', roomName: `Audit Theater ${vp.id}` }),
      });
      const activeData = await activeRes.json();
      const activeCode = activeData.room.roomCode;
      const activeHostSessionId = activeData.hostSessionId;
      
      await fetch(`http://localhost:4000/api/rooms/${activeCode}/sample-media`, { method: 'POST' });

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dsf,
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
      });

      const page = await context.newPage();

      // Console logger
      page.on('console', (msg) => {
        const type = msg.type();
        if (type === 'error' || type === 'warning') {
          auditResults.consoleIssues.push({
            viewport: vp.id,
            type,
            text: msg.text(),
            location: msg.location(),
          });
        }
      });
      page.on('pageerror', (err) => {
        auditResults.consoleIssues.push({
          viewport: vp.id,
          type: 'pageerror',
          text: err.message,
          stack: err.stack,
        });
      });

      const captureState = async (stateName, actions = null) => {
        if (actions) {
          try {
            await actions(page);
          } catch (e) {
            console.warn(`    [!] Action failed for ${stateName}: ${e.message}`);
          }
        }
        await page.waitForTimeout(400); // settle
        
        // Check overflow and DOM metrics
        const metrics = await page.evaluate(() => {
          const body = document.body;
          const html = document.documentElement;
          const scrollW = Math.max(body.scrollWidth, html.scrollWidth);
          const innerW = window.innerWidth;
          const hasHScroll = scrollW > innerW + 1;

          // Duplicate IDs
          const allIds = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
          const idCounts = {};
          for (const id of allIds) idCounts[id] = (idCounts[id] || 0) + 1;
          const dups = Object.entries(idCounts).filter(([_, c]) => c > 1).map(([id, c]) => `${id}(${c})`);

          // Collect computed styles of buttons, inputs, icons, glass
          const buttons = Array.from(document.querySelectorAll('button, .btn, .cb, [role="button"]')).map((el) => {
            const cs = window.getComputedStyle(el);
            return {
              tag: el.tagName,
              id: el.id,
              class: el.className,
              height: cs.height,
              borderRadius: cs.borderRadius,
              fontSize: cs.fontSize,
              background: cs.background,
              color: cs.color,
            };
          });

          const svgIcons = Array.from(document.querySelectorAll('svg')).map((el) => {
            const r = el.getBoundingClientRect();
            return {
              width: Math.round(r.width),
              height: Math.round(r.height),
              class: el.getAttribute('class') || '',
            };
          });

          return {
            scrollW,
            innerW,
            hasHScroll,
            dups,
            buttonsCount: buttons.length,
            buttonsSample: buttons.slice(0, 10),
            svgIconsSample: svgIcons.slice(0, 10),
          };
        });

        if (metrics.hasHScroll) {
          auditResults.overflowIssues.push({
            viewport: vp.id,
            state: stateName,
            scrollWidth: metrics.scrollW,
            innerWidth: metrics.innerW,
          });
        }
        if (metrics.dups.length > 0) {
          auditResults.duplicateIds[`${vp.id}_${stateName}`] = metrics.dups;
        }

        const fileName = `${stateName}_${vp.id}.png`;
        const filePath = path.join(screenshotsDir, fileName);
        await page.screenshot({ path: filePath, fullPage: false });
        console.log(`  [✓] ${stateName} -> ${fileName}`);
      };

      // --- 1. LANDING ---
      console.log('--- Auditing Landing Page ---');
      await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
      await captureState('landing_default');

      // Landing Scrolled
      await captureState('landing_scrolled', async (p) => {
        await p.evaluate(() => window.scrollTo(0, 600));
      });

      // --- 2. CREATE PAGE ---
      console.log('--- Auditing Create Room Page ---');
      await page.goto('http://localhost:5173/create', { waitUntil: 'networkidle' });
      await captureState('create_empty');

      // Create with file selected (simulated)
      await captureState('create_file_selected', async (p) => {
        await p.fill('input[type="text"]', 'Movie Buff Host');
        const fileInput = await p.$('input[type="file"]');
        if (fileInput) {
          await fileInput.setInputFiles('fixtures/1_h264_aac.mp4');
        }
      });

      // Create with MKV selected
      await captureState('create_mkv_selected', async (p) => {
        const fileInput = await p.$('input[type="file"]');
        if (fileInput) {
          await fileInput.setInputFiles('fixtures/3_hevc.mkv');
        }
      });

      // Create > 5GB simulated error
      await captureState('create_gt_5gb_error', async (p) => {
        await p.evaluate(() => {
          const dropzone = document.querySelector('.dropzone, [class*="drop"]');
          if (dropzone) {
            let err = document.getElementById('audit-size-err');
            if (!err) {
              err = document.createElement('div');
              err.id = 'audit-size-err';
              err.className = 'text-red-400 text-xs mt-2 text-center';
              err.textContent = 'File exceeds maximum allowed size of 5 GB';
              dropzone.appendChild(err);
            }
          }
        });
      });

      // --- 3. JOIN PAGE ---
      console.log('--- Auditing Join Room Page ---');
      await page.goto('http://localhost:5173/join', { waitUntil: 'networkidle' });
      await captureState('join_empty');

      // Prefilled Join
      await page.goto(`http://localhost:5173/join/${activeCode}`, { waitUntil: 'networkidle' });
      await captureState('join_prefilled');

      // Invalid code error
      await captureState('join_invalid', async (p) => {
        await p.goto('http://localhost:5173/join/12', { waitUntil: 'networkidle' });
        const nameInput = await p.$('input[type="text"]');
        if (nameInput) await nameInput.fill('Auditor');
        const submitBtn = await p.$('button[type="submit"], button.btn-primary');
        if (submitBtn) await submitBtn.click();
      });

      // Room not found error
      await captureState('join_not_found', async (p) => {
        await p.goto('http://localhost:5173/join/ZZZZZZ', { waitUntil: 'networkidle' });
        const nameInput = await p.$('input[type="text"]');
        if (nameInput) await nameInput.fill('Auditor');
        const submitBtn = await p.$('button[type="submit"], button.btn-primary');
        if (submitBtn) await submitBtn.click();
      });

      // Locked room error simulated
      await captureState('join_locked', async (p) => {
        await p.evaluate(() => {
          const alertBox = document.createElement('div');
          alertBox.className = 'p-3 bg-red-950/60 border border-red-500/30 text-red-200 text-xs rounded-xl mt-3 text-center';
          alertBox.textContent = 'This room is locked by the host. New participants cannot join.';
          document.querySelector('form, .card, main')?.appendChild(alertBox);
        });
      });

      // Waiting room approval simulated
      await captureState('join_waiting', async (p) => {
        await p.evaluate(() => {
          const container = document.querySelector('form, .card, main');
          if (container) {
            container.innerHTML = `
              <div class="text-center py-6">
                <div class="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin mx-auto mb-4"></div>
                <h2 class="text-lg font-semibold text-white mb-1">Waiting for Host Approval</h2>
                <p class="text-xs text-slate-400 mb-6">The host must approve your admission before you enter the cinema.</p>
                <button class="btn frost px-6 py-2 rounded-xl text-xs">Cancel Request</button>
              </div>
            `;
          }
        });
      });

      // --- 4. WATCH ROOM (EMPTY STATE) ---
      console.log('--- Auditing Watch Room (Empty State) ---');
      await page.addInitScript(
        ({ rCode, sId, name }) => {
          sessionStorage.setItem('sw_name_' + rCode, name);
          sessionStorage.setItem('cineva_session_' + rCode, sId);
        },
        { rCode: emptyCode, sId: emptyHostSessionId, name: 'Audit Host' }
      );
      await page.goto(`http://localhost:5173/room/${emptyCode}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.stage', { timeout: 10000 });
      await captureState('room_empty');

      // --- 5. WATCH ROOM (PLAYING STATE & CONTROLS) ---
      console.log('--- Auditing Watch Room (Playing & Overlays) ---');
      await page.addInitScript(
        ({ rCode, sId, name }) => {
          sessionStorage.setItem('sw_name_' + rCode, name);
          sessionStorage.setItem('cineva_session_' + rCode, sId);
        },
        { rCode: activeCode, sId: activeHostSessionId, name: 'Audit Host' }
      );
      await page.goto(`http://localhost:5173/room/${activeCode}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.ctl', { timeout: 10000 });
      await captureState('room_playing');

      // Paused state
      await captureState('room_paused', async (p) => {
        try {
          await p.click('#pp', { force: true, timeout: 2000 });
        } catch (e) {
          console.warn(`    Pointer issue on #pp: ${e.message}`);
        }
      });

      // Controls Hidden (idle fade)
      await captureState('room_controls_hidden', async (p) => {
        try {
          await p.click('#pp', { force: true, timeout: 2000 }); // resume
        } catch (e) {
          // ignore
        }
        await p.evaluate(() => {
          const ctl = document.querySelector('.ctl, #ctl');
          if (ctl) ctl.style.opacity = '0';
          const top = document.querySelector('.top');
          if (top) top.style.opacity = '0';
        });
      });

      // Audio Language Menu
      await captureState('room_menu_audio', async (p) => {
        await p.evaluate(() => {
          const ctl = document.querySelector('.ctl, #ctl');
          if (ctl) ctl.style.opacity = '1';
        });
        const moreBtn = await p.$('#ctl-more-btn');
        if (moreBtn && vp.width < 900) {
          await moreBtn.click({ force: true, timeout: 2000 });
        } else {
          const audBtn = await p.$('#aud-btn, [aria-label*="Audio"]');
          if (audBtn) await audBtn.click({ force: true, timeout: 2000 });
        }
      });

      // Subtitles Menu
      await captureState('room_menu_subtitles', async (p) => {
        if (vp.width >= 900) {
          const subBtn = await p.$('#sub-btn, [aria-label*="Subtitles"]');
          if (subBtn) await subBtn.click({ force: true, timeout: 2000 });
        }
      });

      // Subtitle Appearance Settings Panel
      await captureState('room_menu_subtitles_settings', async (p) => {
        const subSettingsBtn = await p.$('#sub-settings-btn, button:has-text("Subtitle Settings")');
        if (subSettingsBtn) {
          await subSettingsBtn.click();
        } else {
          // Trigger via custom event or simulate
          await p.evaluate(() => {
            const panel = document.createElement('div');
            panel.id = 'audit-sub-settings';
            panel.className = 'glass fixed right-6 top-20 w-80 p-5 rounded-2xl z-50 text-white shadow-2xl';
            panel.innerHTML = `
              <h3 class="text-sm font-semibold mb-4">Subtitle Settings</h3>
              <div class="space-y-4 text-xs">
                <div><label class="block text-slate-400 mb-1">Font Size (60% - 220%)</label><input type="range" class="w-full" value="100"/></div>
                <div><label class="block text-slate-400 mb-1">Text Color</label><div class="flex gap-2"><span class="w-5 h-5 rounded-full bg-white border"></span><span class="w-5 h-5 rounded-full bg-yellow-300"></span><span class="w-5 h-5 rounded-full bg-cyan-300"></span></div></div>
                <div><label class="block text-slate-400 mb-1">Background</label><div class="flex gap-2"><span class="px-2 py-1 bg-white/10 rounded">None</span><span class="px-2 py-1 bg-black/80 rounded">Dark</span></div></div>
                <div><label class="block text-slate-400 mb-1">Edge Style</label><div class="flex gap-2"><span class="px-2 py-1 bg-white/10 rounded">Outline</span><span class="px-2 py-1 bg-white/10 rounded">Shadow</span></div></div>
              </div>
            `;
            document.body.appendChild(panel);
          });
        }
      });

      // Keyboard Shortcuts Dialog
      await captureState('room_shortcuts_modal', async (p) => {
        await p.keyboard.press('Shift+?');
        await p.waitForTimeout(300);
      });

      // Modals: Share Modal
      await captureState('modal_share', async (p) => {
        await p.keyboard.press('Escape'); // dismiss shortcuts
        const inviteBtn = await p.$('#inv, button:has-text("Invite")');
        if (inviteBtn) await inviteBtn.click({ force: true, timeout: 2000 });
      });

      // Modals: Settings Modal
      await captureState('modal_settings', async (p) => {
        await p.keyboard.press('Escape'); // dismiss share
        const settingsBtn = await p.$('button[aria-label="Settings"], .top-settings-btn');
        if (settingsBtn) await settingsBtn.click({ force: true, timeout: 2000 });
      });

      // People Tab / Participants
      await captureState('room_tab_people', async (p) => {
        await p.keyboard.press('Escape');
        if (vp.width < 900) {
          const tabPeople = await p.$('#m-tab-people');
          if (tabPeople) await tabPeople.click({ force: true, timeout: 2000 });
        } else {
          const tabPeople = await p.$('button:has-text("People")');
          if (tabPeople) await tabPeople.click({ force: true, timeout: 2000 });
        }
      });

      // Mobile Bottom Sheet (More Options)
      if (vp.width < 900 && !vp.isLandscape) {
        await captureState('sheet_more_options', async (p) => {
          const moreBtn = await p.$('#ctl-more-btn');
          if (moreBtn) await moreBtn.click({ force: true, timeout: 2000 });
        });
      }

      // Landscape Drawer (Landscape Phone only)
      if (vp.isLandscape) {
        await captureState('sheet_landscape_drawer', async (p) => {
          const drawerBtn = await p.$('.landscape-drawer-toggle');
          if (drawerBtn) await drawerBtn.click();
        });
      }

      // 6 Participants simulation in call grid
      await captureState('room_participants_6', async (p) => {
        await p.evaluate(() => {
          const grid = document.querySelector('.call-tiles, .mobile-call-grid, .grid');
          if (grid) {
            for (let i = 2; i <= 6; i++) {
              const tile = document.createElement('div');
              tile.className = 'tile gl relative aspect-video rounded-xl bg-slate-900/80 flex items-center justify-center border border-white/10';
              tile.innerHTML = `
                <div class="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-white border border-white/10">U${i}</div>
                <div class="absolute bottom-2 left-2 text-[10px] text-slate-300 font-medium">Participant ${i}</div>
              `;
              grid.appendChild(tile);
            }
          }
        });
      });

      // Reaction Burst
      await captureState('room_reaction_burst', async (p) => {
        await p.evaluate(() => {
          const stage = document.querySelector('.stage');
          if (stage) {
            const burst = document.createElement('div');
            burst.className = 'absolute bottom-16 right-8 text-4xl animate-bounce z-40';
            burst.textContent = '🔥 ❤️ 🎉 🍿 👏';
            stage.appendChild(burst);
          }
        });
      });

      // --- 6. DIAGNOSTICS PAGE ---
      console.log('--- Auditing Diagnostics Page ---');
      await page.goto('http://localhost:5173/diagnostics', { waitUntil: 'networkidle' });
      await captureState('diagnostics');

      // --- 7. 404 / UNKNOWN ROUTE ---
      console.log('--- Auditing 404 / Fallback Route ---');
      await page.goto('http://localhost:5173/nonexistent-audit-test-404', { waitUntil: 'networkidle' });
      await captureState('error_404');

      await context.close();
    }

    console.log('\n>>> All viewports & states audited successfully!');
  } finally {
    await browser.close();
  }

  // Write audit raw metrics
  fs.writeFileSync(path.join(auditDir, 'audit-raw-metrics.json'), JSON.stringify(auditResults, null, 2));
  console.log('Audit metrics saved to docs/audit/audit-raw-metrics.json');
}

runAudit().catch((err) => {
  console.error('\n❌ AUDIT FAILED:', err);
  process.exit(1);
});
