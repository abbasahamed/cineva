import http from 'http';
import fs from 'fs';
import { execSync, spawn } from 'child_process';
import WebSocket from 'ws';

// Create a standalone zero-framework HTML camera test server
const pureHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Pure Isolated Camera</title>
  <style>
    body { margin: 0; background: #000; display: flex; align-items: center; justify-content: center; height: 100vh; }
    video { width: 640px; height: 480px; object-fit: contain; }
  </style>
</head>
<body>
  <video id="v" autoplay playsinline muted></video>
  <script>
    window.startCamera = async (constraints) => {
      if (window.stream) {
        window.stream.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      window.stream = stream;
      const v = document.getElementById('v');
      v.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      return {
        settings: track.getSettings(),
        label: track.label
      };
    };
    window.stopCamera = () => {
      if (window.stream) {
        window.stream.getTracks().forEach(t => t.stop());
        window.stream = null;
      }
      const v = document.getElementById('v');
      v.srcObject = null;
    };
  </script>
</body>
</html>`;

const standaloneServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(pureHtml);
});

standaloneServer.listen(9876, async () => {
  console.log('Standalone pure HTML camera server listening on port 9876');
  runAllTests();
});

function getProcessStats() {
  try {
    const raw = execSync('ps -ax -o %cpu,comm | grep -E "WindowServer|Google Chrome|cameracaptured|appleh16camerad|Safari|kernel_task|Photo Booth|FaceTime" | grep -v grep').toString();
    const lines = raw.trim().split('\n');
    const stats = {
      windowServer: 0,
      chromeGpu: 0,
      chromeRenderer: 0,
      cameracaptured: 0,
      appleh16camerad: 0,
      safari: 0,
      kernelTask: 0,
      rawSummary: lines
    };
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const cpu = parseFloat(parts[0]) || 0;
      const cmd = parts.slice(1).join(' ');
      if (cmd.includes('WindowServer')) stats.windowServer += cpu;
      else if (cmd.includes('Google Chrome Helper (GPU)')) stats.chromeGpu += cpu;
      else if (cmd.includes('Google Chrome Helper (Renderer)')) stats.chromeRenderer += cpu;
      else if (cmd.includes('cameracaptured')) stats.cameracaptured += cpu;
      else if (cmd.includes('appleh16camerad')) stats.appleh16camerad += cpu;
      else if (cmd.includes('Safari')) stats.safari += cpu;
      else if (cmd.includes('kernel_task')) stats.kernelTask += cpu;
    }
    const topSummary = execSync('top -l 1 -n 0 -s 0 | head -n 10').toString();
    return { stats, topSummary };
  } catch (e) {
    return { stats: {}, topSummary: '' };
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runCdpEval(ws, expression) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 100000);
    const msgHandler = (data) => {
      try {
        const res = JSON.parse(data.toString());
        if (res.id === id) {
          ws.off('message', msgHandler);
          if (res.error) reject(res.error);
          else resolve(res.result?.result?.value);
        }
      } catch (e) {
        // ignore
      }
    };
    ws.on('message', msgHandler);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true }
    }));
  });
}

async function runAllTests() {
  console.log('\\n=====================================================');
  console.log('PHASE 4: SYSTEM-WIDE MAC LAG DEEP ISOLATION DIAGNOSTICS');
  console.log('=====================================================\\n');

  // TEST 0: Baseline
  console.log('--- TEST 0: MAC BASELINE (Camera OFF, Idle) ---');
  await sleep(2000);
  const baseline = getProcessStats();
  console.log('Baseline Process Stats:', JSON.stringify(baseline.stats, null, 2));

  // Spawn Chrome child process on dedicated port 9225
  const chromeProc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--remote-debugging-port=9225',
    '--no-first-run',
    '--no-default-browser-check',
    '--use-fake-ui-for-media-stream',
    '--user-data-dir=/tmp/chrome-phase4-deep',
    'http://localhost:9876'
  ], { stdio: 'ignore' });

  let ws = null;
  for (let attempt = 0; attempt < 15; attempt++) {
    await sleep(500);
    try {
      const res = await fetch('http://localhost:9225/json');
      const tabs = await res.json();
      const tab = tabs.find(t => t.type === 'page');
      if (tab && tab.webSocketDebuggerUrl) {
        ws = new WebSocket(tab.webSocketDebuggerUrl);
        await new Promise(r => ws.on('open', r));
        console.log('Connected to Chrome DevTools Protocol.');
        break;
      }
    } catch {}
  }

  if (ws) {
    // Navigate tab to standalone pure HTML camera page
    console.log('\\n--- TEST 1: PURE HTML ISOLATED CAMERA (No React, No CSS, No WebRTC) ---');
    await runCdpEval(ws, `window.location.href = "http://localhost:9876";`);
    await sleep(2000);

    // Test 1A: 320x240 @ 15fps
    console.log('\\n[Test 1A] Pure HTML: 320x240 @ 15fps');
    const res1A = await runCdpEval(ws, `window.startCamera({ video: { width: 320, height: 240, frameRate: 15 }, audio: false });`);
    console.log('Track Settings:', res1A);
    await sleep(5000);
    console.log('System Stats (320x240 @ 15fps):', JSON.stringify(getProcessStats().stats, null, 2));

    // Test 1B: 640x480 @ 24fps
    console.log('\\n[Test 1B] Pure HTML: 640x480 @ 24fps');
    const res1B = await runCdpEval(ws, `window.startCamera({ video: { width: 640, height: 480, frameRate: 24 }, audio: false });`);
    console.log('Track Settings:', res1B);
    await sleep(5000);
    console.log('System Stats (640x480 @ 24fps):', JSON.stringify(getProcessStats().stats, null, 2));

    // Test 1C: 1280x720 @ 30fps
    console.log('\\n[Test 1C] Pure HTML: 1280x720 @ 30fps');
    const res1C = await runCdpEval(ws, `window.startCamera({ video: { width: 1280, height: 720, frameRate: 30 }, audio: false });`);
    console.log('Track Settings:', res1C);
    await sleep(5000);
    console.log('System Stats (1280x720 @ 30fps):', JSON.stringify(getProcessStats().stats, null, 2));

    // Stop camera
    await runCdpEval(ws, `window.stopCamera();`);
    await sleep(2000);

    // Navigate to Cineva Watch Room / Diagnostics
    console.log('\\n--- TEST 4 & 5: CINEVA UI ISOLATION ---');
    await runCdpEval(ws, `window.location.href = "http://localhost:5173/diagnostics";`);
    await sleep(3000);

    console.log('\\n[Test 4] Local Camera in Diagnostics Harness (640x480 @ 24fps)');
    await runCdpEval(ws, `window.runDiagnosticTest ? window.runDiagnosticTest('local-640x480') : null;`);
    await sleep(5000);
    console.log('System Stats (Local Camera in Harness):', JSON.stringify(getProcessStats().stats, null, 2));

    console.log('\\n[Test 6] Starfield / WebGL / Canvas Stress Check');
    await runCdpEval(ws, `
      (function() {
        const c = document.createElement('canvas');
        c.width = 1920; c.height = 1080;
        c.id = 'bench-starfield';
        document.body.appendChild(c);
        const gl = c.getContext('webgl');
        if (gl) {
          gl.clearColor(0.1, 0.1, 0.2, 1.0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
      })()
    `);
    await sleep(3000);
    console.log('System Stats with WebGL Canvas + Camera:', JSON.stringify(getProcessStats().stats, null, 2));

    // Clean up bench canvas
    await runCdpEval(ws, `const c = document.getElementById('bench-starfield'); if (c) c.remove();`);

    console.log('\\n[Test 10] Multiple Video Elements (1 vs 2 vs 3)');
    await runCdpEval(ws, `
      (async function() {
        window.extraVideos = [];
        const stream = window.localStream || await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        for (let i = 0; i < 3; i++) {
          const v = document.createElement('video');
          v.autoplay = true; v.playsInline = true; v.muted = true;
          v.srcObject = stream;
          v.style.width = '320px'; v.style.height = '240px';
          document.body.appendChild(v);
          window.extraVideos.push(v);
        }
      })()
    `);
    await sleep(5000);
    console.log('System Stats with 3 Simultaneous Video Elements:', JSON.stringify(getProcessStats().stats, null, 2));

    await runCdpEval(ws, `if (window.extraVideos) { window.extraVideos.forEach(v => v.remove()); window.extraVideos = []; }`);

    console.log('\\n--- TEST 18: ACTIVITY MONITOR SNAPSHOT OF CAMERA DAEMONS ---');
    const daemons = execSync('ps aux | grep -E "cameracaptured|appleh16camerad|WindowServer" | grep -v grep').toString();
    console.log('Active daemons:\\n', daemons);

    console.log('\\n--- TEST 20: 10-CYCLE CAMERA TOGGLE LEAK TEST ---');
    for (let cycle = 1; cycle <= 10; cycle++) {
      await runCdpEval(ws, `
        (async function() {
          const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
          s.getTracks().forEach(t => t.stop());
        })()
      `);
      if (cycle === 1 || cycle === 5 || cycle === 10) {
        console.log(`Cycle ${cycle}/10 completed. Process stats:`, JSON.stringify(getProcessStats().stats, null, 2));
      }
    }

    console.log('\\nDiagnostics complete. Closing test server.');
    standaloneServer.close();
    process.exit(0);
  } else {
    console.log('Chrome CDP not available on port 9223.');
    standaloneServer.close();
    process.exit(0);
  }
}
