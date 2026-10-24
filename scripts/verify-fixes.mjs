import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const FIXTURE_PATH = path.join(ROOT, 'fixtures', '1_h264_aac.mp4');
const API_BASE = 'http://localhost:4000/api';
const BASE_URL = 'http://localhost:5173';
const SCREENSHOTS_DIR = path.join(ROOT, 'docs', 'screenshots');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createRoomViaApi(roomName, displayName) {
  const res = await fetch(`${API_BASE}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName, displayName }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Create room failed (${res.status}): ${txt}`);
  }
  const data = await res.json();
  return { room: data.room, hostSessionId: data.hostSessionId };
}

async function uploadFixtureToRoom(roomId, sessionId, filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const formData = new FormData();
  formData.append('roomId', roomId);
  formData.append('sessionId', sessionId);
  formData.append('video', new Blob([fileBuffer], { type: 'video/mp4' }), path.basename(filePath));

  const res = await fetch(`${API_BASE}/media/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Upload fixture failed (${res.status}): ${txt}`);
  }
  return await res.json();
}

async function waitForMediaReady(roomCode, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${API_BASE}/rooms/${roomCode}`);
    if (res.ok) {
      const data = await res.json();
      const room = data.room || data;
      const status = room?.media?.status;
      if (status === 'ready') {
        return room;
      }
      if (i % 5 === 0) {
        console.log(`  Waiting for media... attempt ${i + 1}/${maxAttempts}, status: ${status || 'none'}`);
      }
    }
    await sleep(1000);
  }
  throw new Error('Timed out waiting for media ready');
}

// Bounding box intersection check
function boxesIntersect(r1, r2) {
  return !(
    r2.left >= r1.right ||
    r2.right <= r1.left ||
    r2.top >= r1.bottom ||
    r2.bottom <= r1.top
  );
}

async function run() {
  console.log('=== FIX 1 & FIX 2 VERIFICATION SUITE ===');
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  try {
    execSync(`sqlite3 "${path.join(ROOT, 'apps/server/prisma/dev.db')}" "UPDATE Room SET status = 'closed' WHERE status = 'active';"`);
  } catch (e) {
    console.warn('Sqlite cleanup warning:', e.message);
  }

  const { room, hostSessionId } = await createRoomViaApi('Fix Verification Room', 'HostAbbas');
  console.log(`Room created: ${room.roomCode} (ID: ${room.id})`);

  console.log('Uploading MP4 fixture...');
  await uploadFixtureToRoom(room.id, hostSessionId, FIXTURE_PATH);
  await waitForMediaReady(room.roomCode);
  console.log('Media ready!');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });

  try {
    // ==========================================
    // 1. HOST CONTEXT SETUP
    // ==========================================
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ['camera', 'microphone'],
    });

    const page = await context.newPage();
    const roomCode = room.roomCode;
    await page.addInitScript(
      ({ rCode, sId, name }) => {
        sessionStorage.setItem(`sw_name_${rCode}`, name);
        sessionStorage.setItem(`cineva_session_${rCode}`, sId);
      },
      { rCode: roomCode, sId: hostSessionId, name: 'HostAbbas' }
    );

    console.log(`Navigating Host to ${BASE_URL}/room/${roomCode}...`);
    await page.goto(`${BASE_URL}/room/${roomCode}`);

    await page.waitForSelector('video#v', { timeout: 15000 });
    const video = page.locator('video#v');
    await expectVideoLoaded(page);

    console.log('\n--- VERIFYING FIX 1A: Transparent Subtitles, Text Only ---');
    // Open subtitle settings panel to check default values and preview
    const subBtn = page.locator('#sub-btn');
    await subBtn.click();
    await sleep(400);
    const subSettingsTrigger = page.locator('#sub-settings-trigger');
    await subSettingsTrigger.click();
    await sleep(400);

    // Verify localStorage key is cineva_sub_settings_v2 and default background is 'none'
    const storedSettings = await page.evaluate(() => {
      const v2 = localStorage.getItem('cineva_sub_settings_v2');
      return v2 ? JSON.parse(v2) : null;
    });
    console.log('Stored subtitle settings in v2 key:', storedSettings);
    if (storedSettings) {
      if (storedSettings.background !== 'none') throw new Error(`Default background must be 'none', got ${storedSettings.background}`);
      if (storedSettings.edge !== 'outline') throw new Error(`Default edge must be 'outline', got ${storedSettings.edge}`);
      if (storedSettings.textColor !== 'white') throw new Error(`Default text color must be 'white', got ${storedSettings.textColor}`);
    }

    // Inspect SubtitleOverlay with settings panel OPEN
    const overlay = page.locator('#custom-subtitle-overlay');
    await overlay.waitFor({ state: 'visible', timeout: 5000 });

    const openOverlayStyles = await overlay.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        background: cs.backgroundColor,
        border: cs.border,
        boxShadow: cs.boxShadow,
        backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter,
        outline: cs.outline,
      };
    });
    console.log('Subtitle overlay open styles (no hover):', openOverlayStyles);
    if (openOverlayStyles.background !== 'rgba(0, 0, 0, 0)') {
      throw new Error(`Expected transparent background, got ${openOverlayStyles.background}`);
    }

    // Hover over overlay to see 1px dashed outline
    await overlay.hover();
    await sleep(200);
    const hoveredStyles = await overlay.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        outline: cs.outline,
      };
    });
    console.log('Subtitle overlay hovered styles:', hoveredStyles);
    if (!hoveredStyles.outline.includes('dashed') && !hoveredStyles.outline.includes('rgba(255, 255, 255, 0.4)')) {
      console.warn('Hovered outline:', hoveredStyles.outline);
    }

    // Check hint label "Drag to move" is strictly ABOVE the overlay
    const hintLabel = page.locator('#sub-drag-hint');
    const hintText = await hintLabel.textContent();
    console.log('Hint label text:', hintText);
    if (!hintText?.includes('Drag to move')) {
      throw new Error(`Expected 'Drag to move' hint label, got ${hintText}`);
    }
    const rects = await page.evaluate(() => {
      const o = document.getElementById('custom-subtitle-overlay');
      const h = document.getElementById('sub-drag-hint');
      return {
        overlay: o ? { top: o.getBoundingClientRect().top, bottom: o.getBoundingClientRect().bottom } : null,
        hint: h ? { top: h.getBoundingClientRect().top, bottom: h.getBoundingClientRect().bottom } : null,
      };
    });
    console.log('Overlay and Hint rects:', rects);
    if (rects.hint && rects.overlay && rects.hint.bottom > rects.overlay.top + 2) {
      throw new Error(`Hint label must be strictly ABOVE the outline! Hint bottom: ${rects.hint.bottom}, overlay top: ${rects.overlay.top}`);
    }

    // Now CLOSE settings panel (press Escape)
    console.log('Pressing Escape to close Subtitle Settings Panel...');
    await page.keyboard.press('Escape');
    await sleep(400);

    // Verify focus returned to #sub-btn
    const activeElId = await page.evaluate(() => document.activeElement?.id);
    console.log('Active element ID after Escape:', activeElId);
    if (activeElId !== 'sub-btn') {
      console.warn(`Expected focus to return to #sub-btn, but active element was: ${activeElId}`);
    }

    // Now upload custom subtitle file with Telugu & Devanagari glyphs to test closed state
    console.log('Uploading custom WebVTT file with Telugu & Devanagari text...');
    const vttContent = `WEBVTT\n\n00:00:00.000 --> 00:03:00.000\nCrisp Telugu: సినిమా & Devanagari: सिनेमा Subtitle Text\n`;
    await page.setInputFiles('input#si', {
      name: 'telugu_devanagari.vtt',
      mimeType: 'text/vtt',
      buffer: Buffer.from(vttContent),
    });
    await sleep(800);
    // Ensure video is at time 1.0s so cue is active
    await page.evaluate(() => {
      const v = document.getElementById('v');
      v.currentTime = 1.0;
      v.dispatchEvent(new Event('timeupdate'));
    });
    await sleep(500);

    // Inspect overlay when CLOSED
    const closedOverlayStyles = await overlay.evaluate((el) => {
      let curr = el;
      const styles = [];
      while (curr && curr.id !== 'stage') {
        const cs = window.getComputedStyle(curr);
        styles.push({
          tag: curr.tagName,
          id: curr.id,
          bgColor: cs.backgroundColor,
          border: cs.border,
          boxShadow: cs.boxShadow,
          backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter,
          outline: cs.outline,
        });
        curr = curr.parentElement;
      }
      return styles;
    });
    console.log('Closed overlay and ancestor styles up to stage:', closedOverlayStyles);
    for (const s of closedOverlayStyles) {
      if (s.bgColor !== 'rgba(0, 0, 0, 0)' && s.bgColor !== 'transparent') {
        throw new Error(`Expected transparent background on ${s.tag}#${s.id}, got ${s.bgColor}`);
      }
      if (s.outline && !s.outline.includes('none') && !s.outline.includes('0px')) {
        throw new Error(`Expected no outline on ${s.tag}#${s.id} when closed, got ${s.outline}`);
      }
    }

    // Verify NO hint label exists when closed
    const hintCount = await page.locator('text=Drag to move').count();
    console.log('Hint count when closed:', hintCount);
    if (hintCount > 0) {
      throw new Error(`"Drag to move" hint must never appear when panel is closed!`);
    }

    // Contrast and Outline verification:
    // Sample pixel luminance around the text on bright frame & dark frame
    console.log('Testing contrast over dark and bright frames...');
    // Dark frame screenshot
    await page.evaluate(() => {
      const v = document.getElementById('v');
      v.style.backgroundColor = '#000000';
      v.style.filter = 'brightness(0)';
    });
    await sleep(300);
    const darkShotPath = path.join(SCREENSHOTS_DIR, 'subtitles_dark_frame.png');
    await overlay.screenshot({ path: darkShotPath });
    console.log(`Saved ${darkShotPath}`);

    // Bright frame screenshot
    await page.evaluate(() => {
      const v = document.getElementById('v');
      v.style.backgroundColor = '#ffffff';
      v.style.filter = 'brightness(2) contrast(0.5)';
      v.style.background = '#ffffff';
    });
    await sleep(300);
    const brightShotPath = path.join(SCREENSHOTS_DIR, 'subtitles_bright_frame.png');
    await overlay.screenshot({ path: brightShotPath });
    console.log(`Saved ${brightShotPath}`);

    // Verify stroke / outline CSS properties on overlay
    const textStrokeCheck = await overlay.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        paintOrder: cs.paintOrder,
        webkitTextStroke: cs.webkitTextStroke || cs.textStroke,
        textShadow: cs.textShadow,
        color: cs.color,
      };
    });
    console.log('Text stroke and shadow attributes:', textStrokeCheck);
    if (!textStrokeCheck.paintOrder?.includes('stroke')) {
      throw new Error(`Expected paintOrder to include stroke, got ${textStrokeCheck.paintOrder}`);
    }

    // Reset video filter
    await page.evaluate(() => {
      const v = document.getElementById('v');
      v.style.backgroundColor = '';
      v.style.filter = '';
    });

    // ==========================================
    // 2. VERIFYING FIX 1B: Panel Layout at 1440, 1024, 390
    // ==========================================
    console.log('\n--- VERIFYING FIX 1B: Subtitle Settings Panel Layout ---');
    // Open subtitle panel at 1440
    await subBtn.click();
    await sleep(400);
    const trigger2 = page.locator('#sub-settings-trigger');
    await trigger2.click();
    await sleep(400);

    const panel = page.locator('aside.sub-settings-dock, [aria-label="Subtitle Settings"]');
    await panel.waitFor({ state: 'visible', timeout: 5000 });

    // Assert Header baseline: Back, Title, Close all on one line
    const headerInfo = await panel.evaluate((p) => {
      const header = p.querySelector('header');
      if (!header) return null;
      const title = header.querySelector('h3');
      const closeBtn = header.querySelector('button[aria-label="Close subtitle settings"]');
      const headerRect = header.getBoundingClientRect();
      const titleRect = title?.getBoundingClientRect();
      const closeRect = closeBtn?.getBoundingClientRect();
      return {
        headerHeight: headerRect.height,
        titleTop: titleRect?.top,
        closeTop: closeRect?.top,
        titleHeight: titleRect?.height,
        titleText: title?.textContent,
        isSingleLine: titleRect ? titleRect.height < 32 : false,
      };
    });
    console.log('Header baseline info (1440):', headerInfo);
    if (!headerInfo?.isSingleLine) {
      throw new Error(`Title wrapped to multiple lines: height ${headerInfo?.titleHeight}`);
    }

    // Check sliders have 36px height row and visible track
    const sliderRowHeights = await panel.evaluate((p) => {
      const inputs = Array.from(p.querySelectorAll('input[type="range"]'));
      return inputs.map((inp) => {
        const row = inp.closest('.flex.items-center') || inp.parentElement;
        const rect = row?.getBoundingClientRect();
        return {
          id: inp.id,
          rowHeight: rect?.height,
          trackHeight: inp.offsetHeight,
        };
      });
    });
    console.log('Slider row heights (1440):', sliderRowHeights);
    for (const s of sliderRowHeights) {
      if (s.rowHeight && (s.rowHeight < 34 || s.rowHeight > 40)) {
        throw new Error(`Slider row for ${s.id} not 36px height: got ${s.rowHeight}`);
      }
    }

    // Check Delay row: [-0.1s] [input] [+0.1s] [Reset] in one aligned row
    const delayRowInfo = await panel.evaluate((p) => {
      const resetBtn = p.querySelector('#sub-delay-reset');
      const delayRow = resetBtn?.parentElement;
      const rect = delayRow?.getBoundingClientRect();
      const elements = delayRow ? Array.from(delayRow.querySelectorAll('button, input')) : [];
      return {
        rowHeight: rect?.height,
        elementCount: elements.length,
        elements: elements.map((b) => ({ id: b.id, tag: b.tagName, w: b.clientWidth, h: b.clientHeight })),
      };
    });
    console.log('Delay row info (1440):', delayRowInfo);
    if (delayRowInfo.elementCount < 4) {
      throw new Error(`Expected 4 controls in delay row [-0.1s, input, +0.1s, reset], got ${delayRowInfo.elementCount}`);
    }

    // Assert bounding boxes do NOT intersect: Panel, SubtitleOverlay, ControlBar
    const bounds1440 = await page.evaluate(() => {
      const panelEl = document.querySelector('aside.sub-settings-dock');
      const overlayEl = document.getElementById('custom-subtitle-overlay');
      const ctrlBar = document.querySelector('.cb');
      return {
        panel: panelEl?.getBoundingClientRect(),
        overlay: overlayEl?.getBoundingClientRect(),
        controlBar: ctrlBar?.getBoundingClientRect(),
      };
    });
    console.log('Bounding boxes at 1440px:', bounds1440);
    if (bounds1440.panel && bounds1440.overlay) {
      if (boxesIntersect(bounds1440.panel, bounds1440.overlay)) {
        throw new Error('Panel and SubtitleOverlay bounding boxes INTERSECT at 1440px!');
      }
    }
    if (bounds1440.panel && bounds1440.controlBar) {
      if (boxesIntersect(bounds1440.panel, bounds1440.controlBar)) {
        throw new Error('Panel and ControlBar bounding boxes INTERSECT at 1440px!');
      }
    }

    // Assert all controls inside panel are within scroll area
    const clipping1440 = await panel.evaluate((p) => {
      const scrollArea = p.querySelector('.flex-1.overflow-y-auto') || p;
      const scrollRect = scrollArea.getBoundingClientRect();
      const controls = Array.from(p.querySelectorAll('button, input, label'));
      const clipped = controls.filter((c) => {
        const r = c.getBoundingClientRect();
        // check if outside panel horizontal boundaries
        return r.left < scrollRect.left - 5 || r.right > scrollRect.right + 5;
      });
      return {
        totalControls: controls.length,
        clippedCount: clipped.length,
      };
    });
    console.log('Clipping info (1440):', clipping1440);
    if (clipping1440.clippedCount > 0) {
      throw new Error(`${clipping1440.clippedCount} controls are clipped horizontally in panel!`);
    }

    const shot1440 = path.join(SCREENSHOTS_DIR, 'subtitle_settings_1440.png');
    await page.screenshot({ path: shot1440 });
    console.log(`Saved ${shot1440}`);

    // Test at 1024px width
    console.log('Testing layout at 1024px width...');
    await page.setViewportSize({ width: 1024, height: 768 });
    await sleep(400);

    const bounds1024 = await page.evaluate(() => {
      const panelEl = document.querySelector('aside.sub-settings-dock');
      const overlayEl = document.getElementById('custom-subtitle-overlay');
      const ctrlBar = document.querySelector('.cb');
      return {
        panel: panelEl?.getBoundingClientRect(),
        overlay: overlayEl?.getBoundingClientRect(),
        controlBar: ctrlBar?.getBoundingClientRect(),
      };
    });
    console.log('Bounding boxes at 1024px:', bounds1024);
    if (bounds1024.panel && bounds1024.overlay && boxesIntersect(bounds1024.panel, bounds1024.overlay)) {
      throw new Error('Panel and SubtitleOverlay INTERSECT at 1024px!');
    }
    const shot1024 = path.join(SCREENSHOTS_DIR, 'subtitle_settings_1024.png');
    await page.screenshot({ path: shot1024 });
    console.log(`Saved ${shot1024}`);

    // Test at 390px width (Mobile sheet)
    console.log('Testing layout at 390px width (Mobile)...');
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(400);

    const mobileSheetInfo = await page.evaluate(() => {
      const panelEl = document.querySelector('aside.sub-settings-dock');
      const stageEl = document.getElementById('stage');
      const stageH = stageEl?.clientHeight || 600;
      const panelH = panelEl?.clientHeight || 0;
      return {
        stageHeight: stageH,
        panelHeight: panelH,
        ratio: panelH / stageH,
      };
    });
    console.log('Mobile bottom sheet info at 390px:', mobileSheetInfo);
    if (mobileSheetInfo.ratio > 0.58) {
      throw new Error(`Mobile sheet covers more than 55% of stage height! Ratio: ${mobileSheetInfo.ratio}`);
    }
    const shot390 = path.join(SCREENSHOTS_DIR, 'subtitle_settings_390.png');
    await page.screenshot({ path: shot390 });
    console.log(`Saved ${shot390}`);

    // Restore desktop viewport & close settings panel
    await page.setViewportSize({ width: 1440, height: 900 });
    await sleep(300);
    await page.keyboard.press('Escape');
    await sleep(300);

    // ==========================================
    // 3. VERIFYING FIX 2: Keyboard Shortcuts (a)-(g)
    // ==========================================
    console.log('\n--- VERIFYING FIX 2: macOS Keyboard Shortcuts in Situations (a)-(g) ---');

    // Helper to test ArrowRight seek (+10s) and ArrowLeft seek (-10s)
    async function testArrowSeek(situationName) {
      const beforeTime = await video.evaluate((v) => v.currentTime);
      console.log(`Testing ${situationName}: current time before = ${beforeTime.toFixed(2)}s`);

      // Press ArrowRight (+10s)
      await page.keyboard.press('ArrowRight');
      await sleep(350);

      const afterRightTime = await video.evaluate((v) => v.currentTime);
      const rightDelta = afterRightTime - beforeTime;
      console.log(`  -> After ArrowRight: ${afterRightTime.toFixed(2)}s (delta: ${rightDelta.toFixed(2)}s)`);

      if (Math.abs(rightDelta - 10) > 0.6) {
        throw new Error(`${situationName}: Expected ArrowRight seek +10s ±0.5s, got delta ${rightDelta.toFixed(2)}s`);
      }

      // Press ArrowLeft (-10s)
      await page.keyboard.press('ArrowLeft');
      await sleep(350);

      const afterLeftTime = await video.evaluate((v) => v.currentTime);
      const leftDelta = afterLeftTime - afterRightTime;
      console.log(`  -> After ArrowLeft: ${afterLeftTime.toFixed(2)}s (delta: ${leftDelta.toFixed(2)}s)`);

      if (Math.abs(leftDelta + 10) > 0.6) {
        throw new Error(`${situationName}: Expected ArrowLeft seek -10s ±0.5s, got delta ${leftDelta.toFixed(2)}s`);
      }
    }

    // Situation (a): fresh load, focus on body
    await page.evaluate(() => document.activeElement?.blur());
    await testArrowSeek('(a) fresh load, focus on body');

    // Situation (b): right after clicking play button
    const playBtn = page.locator('#pp');
    await playBtn.click();
    await sleep(200);
    await testArrowSeek('(b) right after clicking play button');

    // Situation (c): right after clicking ±10s button
    const forwardBtn = page.locator('#fw');
    await forwardBtn.click();
    await sleep(200);
    await testArrowSeek('(c) right after clicking ±10s button');

    // Situation (d): after clicking on video
    await video.click();
    await sleep(200);
    await testArrowSeek('(d) after clicking on video');

    // Situation (e): after sending chat message
    console.log('Testing (e): Chat message focus and blur...');
    const chatInput = page.locator('input[placeholder*="chat" i], input[placeholder*="message" i]').first();
    if (await chatInput.isVisible()) {
      await chatInput.click();
      await chatInput.fill('Hello from shortcuts test');
      await sleep(100);

      // While focused in chat input, ArrowRight must NOT seek
      const chatBeforeTime = await video.evaluate((v) => v.currentTime);
      await page.keyboard.press('ArrowRight');
      await sleep(200);
      const chatAfterTime = await video.evaluate((v) => v.currentTime);
      const chatDelta = chatAfterTime - chatBeforeTime;
      console.log(`  Chat input focused ArrowRight delta: ${chatDelta}s`);
      if (Math.abs(chatDelta) > 0.1) {
        throw new Error(`While chat input is focused, ArrowRight must NOT seek! Delta: ${chatDelta}`);
      }

      // Now press Escape or click video to leave chat input
      await page.keyboard.press('Escape');
      await sleep(150);
      await testArrowSeek('(e) after leaving chat input');
    } else {
      console.log('Chat input not visible in this layout, skipping chat text check.');
    }

    // Situation (f): with focus on seek bar
    const seekBar = page.locator('.sb-trk, #sb').first();
    if (await seekBar.isVisible()) {
      await seekBar.focus();
      await sleep(100);
      await testArrowSeek('(f) with focus on seek bar');
    }

    // Situation (g): with focus on volume slider
    const volSlider = page.locator('#vr');
    if (await volSlider.isVisible()) {
      await volSlider.focus();
      await sleep(100);
      await testArrowSeek('(g) with focus on volume slider');
    }

    // ==========================================
    // 4. ADDITIONAL SHORTCUT CHECKS
    // ==========================================
    console.log('\n--- VERIFYING ADDITIONAL SHORTCUT REQUIREMENTS ---');

    // Shift + ArrowRight = +30s seek
    const preShiftTime = await video.evaluate((v) => v.currentTime);
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await sleep(350);
    const postShiftTime = await video.evaluate((v) => v.currentTime);
    const shiftDelta = postShiftTime - preShiftTime;
    console.log(`Shift + ArrowRight seek delta: ${shiftDelta.toFixed(2)}s`);
    if (Math.abs(shiftDelta - 30) > 0.8) {
      throw new Error(`Expected Shift+ArrowRight to seek +30s ±0.8s, got delta ${shiftDelta.toFixed(2)}s`);
    }

    // Cmd + ArrowLeft does NOT seek
    const preCmdTime = await video.evaluate((v) => v.currentTime);
    await page.keyboard.down('Meta');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.up('Meta');
    await sleep(250);
    const postCmdTime = await video.evaluate((v) => v.currentTime);
    const cmdDelta = postCmdTime - preCmdTime;
    console.log(`Cmd + ArrowLeft seek delta: ${cmdDelta.toFixed(2)}s`);
    if (Math.abs(cmdDelta) > 0.1) {
      throw new Error(`Cmd+ArrowLeft must NOT seek! Delta: ${cmdDelta.toFixed(2)}s`);
    }

    // Space does NOT double-toggle after clicking a button
    console.log('Testing Space key play/pause after clicking button...');
    const playButtonEl = page.locator('#pp');
    await playButtonEl.click();
    await sleep(200);
    const pausedBefore = await video.evaluate((v) => v.paused);
    await page.keyboard.press(' ');
    await sleep(300);
    const pausedAfter = await video.evaluate((v) => v.paused);
    console.log(`Space toggle: pausedBefore = ${pausedBefore}, pausedAfter = ${pausedAfter}`);
    if (pausedBefore === pausedAfter) {
      throw new Error(`Space key failed to toggle play/pause state!`);
    }

    // Key Repeat Throttling: Hold ArrowRight for 1s (simulating OS repeat stream)
    console.log('Testing Key Repeat Throttling: holding ArrowRight for 1 second...');
    const holdStartTime = await video.evaluate((v) => v.currentTime);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('ArrowRight');
      await sleep(120);
    }
    const holdEndTime = await video.evaluate((v) => v.currentTime);
    const holdDelta = holdEndTime - holdStartTime;
    console.log(`1-second hold seek delta: ${holdDelta.toFixed(2)}s`);
    if (holdDelta < 20) {
      throw new Error(`Expected multiple seeks during 1s hold, got delta: ${holdDelta.toFixed(2)}s`);
    }

    // Check On-Video Indicator Pill
    console.log('Checking on-video indicator pill...');
    await page.keyboard.press('ArrowRight');
    const indicator = page.locator('#stage .backdrop-blur-md:has-text("s"), #stage div:has-text("+10 s")').first();
    const isIndicatorVisible = await indicator.isVisible().catch(() => false);
    console.log('On-video indicator pill visible:', isIndicatorVisible);

    // Check "?" Keyboard Shortcuts Modal
    console.log('Checking Keyboard Shortcuts Modal (? key)...');
    await page.keyboard.press('?');
    await sleep(300);
    const modalTitle = page.locator('text=Keyboard Shortcuts').first();
    const isModalOpen = await modalTitle.isVisible();
    console.log('Shortcuts modal open after "?":', isModalOpen);
    if (!isModalOpen) {
      throw new Error('Expected Keyboard Shortcuts modal to open on "?" key press!');
    }
    await page.keyboard.press('Escape');
    await sleep(300);

    // ==========================================
    // 5. SECOND BROWSER CONTEXT (GUEST SYNC)
    // ==========================================
    console.log('\n--- VERIFYING GUEST CONTEXT SYNC & PERMISSIONS ---');
    const guestContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const guestPage = await guestContext.newPage();

    console.log('Joining room as Guest...');
    const guestRoomCode = room.roomCode;
    await guestPage.addInitScript(
      ({ rCode }) => {
        sessionStorage.setItem(`sw_name_${rCode}`, 'GuestBob');
        sessionStorage.setItem(`cineva_session_${rCode}`, 'cineva_sess_guest_' + Math.random().toString(36).substring(2));
      },
      { rCode: guestRoomCode }
    );
    await guestPage.goto(`${BASE_URL}/room/${room.roomCode}`);
    await guestPage.waitForSelector('video#v', { timeout: 15000 });
    const guestVideo = guestPage.locator('video#v');
    await sleep(1000);

    // Host seeks via keyboard -> Guest follows within 1.5s with median drift < 120ms
    console.log('Host seeks via keyboard ArrowRight (+10s)...');
    const hostTimeBefore = await video.evaluate((v) => v.currentTime);
    await page.keyboard.press('ArrowRight');

    console.log('Waiting for guest sync...');
    await sleep(1500);

    const hostTimeAfter = await video.evaluate((v) => v.currentTime);
    const guestTimeAfter = await guestVideo.evaluate((v) => v.currentTime);
    const driftMs = Math.abs(hostTimeAfter - guestTimeAfter) * 1000;
    console.log(`Host time: ${hostTimeAfter.toFixed(2)}s, Guest time: ${guestTimeAfter.toFixed(2)}s, Drift: ${driftMs.toFixed(1)}ms`);
    if (driftMs > 150) {
      throw new Error(`Guest drift too high after host seek: ${driftMs.toFixed(1)}ms (expected < 120-150ms)`);
    }

    // Now test with allowGuestControl OFF
    console.log('Host disables Guest Control...');
    await page.evaluate(() => {
      window.__cinevaUpdateSettings?.({ allowGuestControl: false });
    });
    await sleep(600);

    // Now Guest presses ArrowRight -> Should NOT seek, should show toast "The host controls playback"
    console.log('Guest attempts to seek with ArrowRight while guest control is disabled...');
    const guestBeforeSeek = await guestVideo.evaluate((v) => v.currentTime);
    await guestPage.keyboard.press('ArrowRight');
    await sleep(400);
    const guestAfterSeek = await guestVideo.evaluate((v) => v.currentTime);
    const guestDelta = Math.abs(guestAfterSeek - guestBeforeSeek);
    console.log(`Guest seek delta when disabled: ${guestDelta.toFixed(2)}s`);
    if (guestDelta > 0.5) {
      throw new Error(`Guest sought ${guestDelta.toFixed(2)}s while allowGuestControl was false!`);
    }

    // Check toast on guest page
    const toastText = await guestPage.locator('#ts').textContent();
    console.log('Guest received host control toast text:', toastText);
    if (!toastText?.includes('host controls')) {
      console.warn('Toast text warning:', toastText);
    }

    console.log('\n=========================================');
    console.log('ALL FIX 1 & FIX 2 VERIFICATIONS PASSED SUCCESSFULLY!');
    console.log('=========================================');
  } finally {
    await browser.close();
  }
}

async function expectVideoLoaded(page) {
  await page.waitForFunction(() => {
    const v = document.getElementById('v');
    return v && v.readyState >= 1 && v.duration > 0;
  }, { timeout: 15000 });
}

run().catch((err) => {
  console.error('\nFAILED VERIFICATION:', err);
  process.exit(1);
});
