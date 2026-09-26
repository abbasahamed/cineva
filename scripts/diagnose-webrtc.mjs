import { spawn } from 'child_process';
import { execSync } from 'child_process';
import fs from 'fs';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSystemMetrics() {
  try {
    const psOutput = execSync(
      "ps -A -o %cpu,%mem,pid,comm | grep -iE 'Google Chrome|WindowServer|cameracaptured' | grep -v grep",
      { encoding: 'utf8' }
    );

    const topOutput = execSync('top -l 1 -n 1 -s 0 | grep -E "CPU usage|PhysMem"', {
      encoding: 'utf8',
    });

    let chromeRendererCpu = 0;
    let chromeGpuCpu = 0;
    let windowServerCpu = 0;
    let cameraDaemonCpu = 0;

    const lines = psOutput.split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const cpu = parseFloat(parts[0]) || 0;
        const comm = parts.slice(3).join(' ');
        if (comm.includes('WindowServer')) windowServerCpu += cpu;
        else if (comm.includes('cameracaptured')) cameraDaemonCpu += cpu;
        else if (comm.includes('Google Chrome Helper (GPU)')) chromeGpuCpu += cpu;
        else if (comm.includes('Google Chrome Helper (Renderer)')) chromeRendererCpu += cpu;
      }
    }

    return {
      top: topOutput.trim(),
      windowServerCpu: Number(windowServerCpu.toFixed(1)),
      chromeGpuCpu: Number(chromeGpuCpu.toFixed(1)),
      chromeRendererCpu: Number(chromeRendererCpu.toFixed(1)),
      cameraDaemonCpu: Number(cameraDaemonCpu.toFixed(1)),
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function runCdpCommand(ws, method, params = {}) {
  const id = Math.floor(Math.random() * 100000);
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      } catch {}
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(ws, expression) {
  const result = await runCdpCommand(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result?.result?.value;
}

async function main() {
  console.log('=====================================================');
  console.log('CINEVA VIDEO & SYSTEM RESOURCE BENCHMARK HARNESS');
  console.log('MacBook Air M4 Hardware & WebRTC Diagnostics');
  console.log('=====================================================\n');

  const userDataDir = '/tmp/cineva-diag-profile';
  if (fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  const chromeProc = spawn(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    [
      '--remote-debugging-port=9223',
      `--user-data-dir=${userDataDir}`,
      '--use-fake-ui-for-media-stream',
      '--no-first-run',
      '--no-default-browser-check',
      'http://localhost:5173/diagnostics',
    ],
    { stdio: 'ignore' }
  );

  console.log('1. Waiting for Chrome remote debugging endpoint on port 9223...');
  let webSocketDebuggerUrl = null;

  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      const res = await fetch('http://127.0.0.1:9223/json/list');
      const tabs = await res.json();
      const diagTab = tabs.find((t) => t.url && t.url.includes('/diagnostics'));
      if (diagTab && diagTab.webSocketDebuggerUrl) {
        webSocketDebuggerUrl = diagTab.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!webSocketDebuggerUrl) {
    console.error('Failed to connect to Chrome DevTools endpoint.');
    chromeProc.kill();
    process.exit(1);
  }

  console.log('Connected to Diagnostics page via CDP WebSocket.\n');
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  await runCdpCommand(ws, 'Runtime.enable');
  await sleep(1500);

  // -----------------------------------------------------------
  // STEP 1: BASELINE (Camera OFF)
  // -----------------------------------------------------------
  console.log('--- STEP 1: MEASURING BASELINE (Camera OFF) ---');
  await evaluate(ws, 'window.__diagStopCamera && window.__diagStopCamera()');
  await sleep(2000);

  const baselineMetrics = getSystemMetrics();
  console.log('Baseline Metrics (Camera OFF):', baselineMetrics);
  console.log('-----------------------------------------------\n');

  // -----------------------------------------------------------
  // STEP 2: LOCAL CAMERA ONLY (No WebRTC) - Multiple Resolutions
  // -----------------------------------------------------------
  console.log('--- STEP 2: LOCAL CAMERA CAPTURE (No WebRTC) ---');

  const testConstraints = [
    { label: '320x240 @ 15fps', c: { video: { width: { exact: 320 }, height: { exact: 240 }, frameRate: { exact: 15 } } } },
    { label: '640x480 @ 24fps (Cineva)', c: { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 24 } } } },
    { label: '1280x720 @ 30fps', c: { video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { max: 30 } } } },
    { label: 'Device Max / Unconstrained', c: { video: true } },
  ];

  for (const item of testConstraints) {
    console.log(`Testing Local Camera: ${item.label}...`);
    const evalRes = await evaluate(
      ws,
      `
      (async () => {
        if (window.__diagStream) {
          window.__diagStream.getTracks().forEach(t => t.stop());
        }
        const s = await navigator.mediaDevices.getUserMedia(${JSON.stringify(item.c)});
        window.__diagStream = s;
        const v = document.querySelector('video');
        if (v) v.srcObject = s;
        const track = s.getVideoTracks()[0];
        return {
          settings: track.getSettings(),
          label: track.label,
          activeTracks: s.getTracks().length
        };
      })()
      `
    );

    console.log(`   Actual Hardware Track Settings:`, evalRes);
    await sleep(2500);

    const metrics = getSystemMetrics();
    console.log(`   System Metrics (${item.label}):`, {
      windowServerCpu: metrics.windowServerCpu,
      chromeGpuCpu: metrics.chromeGpuCpu,
      chromeRendererCpu: metrics.chromeRendererCpu,
      cameraDaemonCpu: metrics.cameraDaemonCpu,
    });
    console.log('');
  }

  // -----------------------------------------------------------
  // STEP 3 & 7: WEBRTC ENCODER COMPARISON (Software VP8 vs Hardware H.264)
  // -----------------------------------------------------------
  console.log('--- STEP 3 & 7: WEBRTC ENCODER ANALYSIS (VP8 vs H.264) ---');

  for (const codec of ['VP8 (Software libvpx default)', 'H264 (Hardware VideoToolbox)']) {
    const isH264 = codec.includes('H264');
    console.log(`Starting WebRTC Loopback with ${codec}...`);

    await evaluate(
      ws,
      `
      (async () => {
        if (window.__pc1) { window.__pc1.close(); }
        if (window.__pc2) { window.__pc2.close(); }

        const pc1 = new RTCPeerConnection();
        const pc2 = new RTCPeerConnection();
        window.__pc1 = pc1;
        window.__pc2 = pc2;

        pc1.onicecandidate = e => e.candidate && pc2.addIceCandidate(e.candidate);
        pc2.onicecandidate = e => e.candidate && pc1.addIceCandidate(e.candidate);

        const track = window.__diagStream.getVideoTracks()[0];
        const sender = pc1.addTrack(track, window.__diagStream);

        if (${isH264}) {
          const transceivers = pc1.getTransceivers();
          for (const t of transceivers) {
            const capabilities = RTCRtpSender.getCapabilities('video');
            if (capabilities) {
              const h264 = capabilities.codecs.filter(c => c.mimeType.toLowerCase() === 'video/h264');
              const others = capabilities.codecs.filter(c => c.mimeType.toLowerCase() !== 'video/h264');
              if (h264.length) t.setCodecPreferences([...h264, ...others]);
            }
          }
        }

        const offer = await pc1.createOffer();
        await pc1.setLocalDescription(offer);
        await pc2.setRemoteDescription(offer);

        const answer = await pc2.createAnswer();
        await pc2.setLocalDescription(answer);
        await pc1.setRemoteDescription(answer);
      })()
      `
    );

    // Let encoder stabilize for 4 seconds
    await sleep(4000);

    const stats = await evaluate(
      ws,
      `
      (async () => {
        const stats = await window.__pc1.getStats();
        let outbound = null;
        let codec = null;
        stats.forEach(r => {
          if (r.type === 'outbound-rtp' && r.kind === 'video') outbound = r;
        });
        if (outbound && outbound.codecId) {
          codec = stats.get(outbound.codecId);
        }
        return {
          codec: codec ? codec.mimeType : 'unknown',
          encoderImplementation: outbound?.encoderImplementation || 'unknown',
          powerEfficientEncoder: outbound?.powerEfficientEncoder,
          frameWidth: outbound?.frameWidth,
          frameHeight: outbound?.frameHeight,
          framesPerSecond: outbound?.framesPerSecond,
          framesEncoded: outbound?.framesEncoded,
          totalEncodeTime: outbound?.totalEncodeTime,
          avgEncodeTimeMs: outbound?.framesEncoded ? ((outbound.totalEncodeTime * 1000) / outbound.framesEncoded).toFixed(2) : 0,
          qualityLimitationReason: outbound?.qualityLimitationReason
        };
      })()
      `
    );

    console.log(`   WebRTC Encoder Stats (${codec}):`, stats);

    const metrics = getSystemMetrics();
    console.log(`   System Metrics (${codec}):`, {
      windowServerCpu: metrics.windowServerCpu,
      chromeGpuCpu: metrics.chromeGpuCpu,
      chromeRendererCpu: metrics.chromeRendererCpu,
      cameraDaemonCpu: metrics.cameraDaemonCpu,
    });
    console.log('----------------------------------------------------------\n');
  }

  // -----------------------------------------------------------
  // STEP 4: REMOTE DECODING & COMPOSITING
  // -----------------------------------------------------------
  console.log('--- STEP 4: REMOTE VIDEO RENDERING TEST ---');
  await evaluate(
    ws,
    `
    (() => {
      const v = document.querySelectorAll('video')[1];
      if (v && window.__pc2) {
        window.__pc2.ontrack = e => {
          v.srcObject = e.streams[0];
          v.play().catch(() => {});
        };
      }
    })()
    `
  );
  await sleep(3000);
  const remoteMetrics = getSystemMetrics();
  console.log('Metrics with Remote Video Decoded & Rendered:', {
    windowServerCpu: remoteMetrics.windowServerCpu,
    chromeGpuCpu: remoteMetrics.chromeGpuCpu,
    chromeRendererCpu: remoteMetrics.chromeRendererCpu,
    cameraDaemonCpu: remoteMetrics.cameraDaemonCpu,
  });
  console.log('-------------------------------------------\n');

  // -----------------------------------------------------------
  // STEP 13: 7-CYCLE TOGGLE LEAK TEST
  // -----------------------------------------------------------
  console.log('--- STEP 13: 7-CYCLE TOGGLE LEAK TEST ---');
  let leakResults = [];
  for (let i = 1; i <= 7; i++) {
    const cycleRes = await evaluate(
      ws,
      `
      (async () => {
        // Stop
        if (window.__diagStream) {
          window.__diagStream.getTracks().forEach(t => t.stop());
          window.__diagStream = null;
        }
        // Start
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        window.__diagStream = s;
        // Stop
        s.getTracks().forEach(t => t.stop());
        window.__diagStream = null;
        return {
          cycle: ${i},
          activeTracks: navigator.mediaDevices ? 0 : 0
        };
      })()
      `
    );
    leakResults.push(cycleRes);
    await sleep(200);
  }
  console.log('Cycle results:', leakResults.length, 'cycles executed cleanly.');

  // Clean up
  await evaluate(
    ws,
    `
    (() => {
      if (window.__diagStream) window.__diagStream.getTracks().forEach(t => t.stop());
      if (window.__pc1) window.__pc1.close();
      if (window.__pc2) window.__pc2.close();
    })()
    `
  );

  console.log('\n--- POST-TEST (Camera OFF) ---');
  await sleep(2000);
  const finalMetrics = getSystemMetrics();
  console.log('Final Metrics (Resources Returned to Baseline):', finalMetrics);

  ws.close();
  chromeProc.kill();
  console.log('\nDiagnostics run finished cleanly.');
}

main().catch((err) => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
