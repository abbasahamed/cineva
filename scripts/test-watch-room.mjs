import { spawn } from 'child_process';
import { execSync } from 'child_process';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

    for (const line of psOutput.split('\n')) {
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

async function testWatchRoom() {
  console.log('--- TESTING REAL CINEVA WATCH ROOM ---');

  // Create room via API
  const res = await fetch('http://localhost:4000/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Diagnostic Abbas', roomName: 'Test Lab' }),
  });
  const data = await res.json();
  const roomCode = data.room.roomCode;
  const sessionId = data.hostSessionId;
  console.log('Created room:', roomCode);

  const userDataDir = '/tmp/cineva-room-diag';
  const chromeProc = spawn(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    [
      '--remote-debugging-port=9224',
      `--user-data-dir=${userDataDir}`,
      '--use-fake-ui-for-media-stream',
      '--no-first-run',
      '--no-default-browser-check',
      `http://localhost:5173/join/${roomCode}`,
    ],
    { stdio: 'ignore' }
  );

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      const list = await (await fetch('http://127.0.0.1:9224/json/list')).json();
      const tab = list.find((t) => t.url && t.url.includes(roomCode));
      if (tab && tab.webSocketDebuggerUrl) {
        wsUrl = tab.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    console.error('Failed to connect to Chrome');
    chromeProc.kill();
    return;
  }

  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  await runCdpCommand(ws, 'Runtime.enable');

  // Wait for room to mount
  await sleep(3000);

  // Set session storage and navigate to room
  await evaluate(
    ws,
    `
    sessionStorage.setItem('sw_name_${roomCode}', 'Diagnostic Abbas');
    sessionStorage.setItem('sw_session_${roomCode}', '${sessionId}');
    window.location.href = '/room/${roomCode}';
  `
  );

  await sleep(4000);

  console.log('1. Baseline in Watch Room (Camera OFF):');
  const baseline = getSystemMetrics();
  console.log(baseline);

  console.log('\n2. Clicking Camera ON in Watch Room...');
  await evaluate(
    ws,
    `
    (() => {
      // Find camera button and click it
      const buttons = Array.from(document.querySelectorAll('button'));
      const camBtn = buttons.find(b => b.textContent && (b.textContent.includes('Camera') || b.textContent.includes('Camera Off')));
      if (camBtn) camBtn.click();
      return !!camBtn;
    })()
  `
  );

  await sleep(5000);

  console.log('\n3. Measuring Watch Room with Camera ON:');
  const camOnMetrics = getSystemMetrics();
  console.log(camOnMetrics);

  const roomDiagnostics = await evaluate(
    ws,
    `
    (() => {
      const videos = Array.from(document.querySelectorAll('video'));
      return {
        videoElementCount: videos.length,
        videoSources: videos.map(v => ({
          hasSrcObject: !!v.srcObject,
          videoWidth: v.videoWidth,
          videoHeight: v.videoHeight,
          paused: v.paused,
          muted: v.muted
        }))
      };
    })()
  `
  );
  console.log('Video Elements in DOM:', roomDiagnostics);

  console.log('\n4. Clicking Camera OFF in Watch Room...');
  await evaluate(
    ws,
    `
    (() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const camBtn = buttons.find(b => b.textContent && b.textContent.includes('Camera'));
      if (camBtn) camBtn.click();
    })()
  `
  );

  await sleep(3000);

  console.log('\n5. Measuring Watch Room with Camera OFF:');
  const camOffMetrics = getSystemMetrics();
  console.log(camOffMetrics);

  ws.close();
  chromeProc.kill();
  console.log('Watch Room test complete.');
}

testWatchRoom().catch(console.error);
