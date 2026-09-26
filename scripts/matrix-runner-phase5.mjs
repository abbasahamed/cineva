import http from 'http';
import { execSync, spawn } from 'child_process';
import WebSocket from 'ws';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function sampleProcesses() {
  try {
    const raw = execSync('ps -ax -o %cpu,comm | grep -E "WindowServer|Google Chrome|cameracaptured|appleh16camerad|kernel_task|VTDecoderXPCService|mediaserverd" | grep -v grep').toString();
    const lines = raw.trim().split('\n');
    let windowServer = 0;
    let cameracaptured = 0;
    let appleh16camerad = 0;
    let kernelTask = 0;
    let chromeGpu = 0;
    let chromeRenderer = 0;
    let chromeOther = 0;
    let vtDecoder = 0;

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const cpu = parseFloat(parts[0]) || 0;
      const cmd = parts.slice(1).join(' ');

      if (cmd.includes('WindowServer')) windowServer += cpu;
      else if (cmd.includes('cameracaptured')) cameracaptured += cpu;
      else if (cmd.includes('appleh16camerad')) appleh16camerad += cpu;
      else if (cmd.includes('kernel_task')) kernelTask += cpu;
      else if (cmd.includes('Google Chrome Helper (GPU)')) chromeGpu += cpu;
      else if (cmd.includes('Google Chrome Helper (Renderer)')) chromeRenderer += cpu;
      else if (cmd.includes('Google Chrome')) chromeOther += cpu;
      else if (cmd.includes('VTDecoderXPCService')) vtDecoder += cpu;
    }

    return {
      windowServer: Math.round(windowServer * 10) / 10,
      cameracaptured: Math.round(cameracaptured * 10) / 10,
      appleh16camerad: Math.round(appleh16camerad * 10) / 10,
      kernelTask: Math.round(kernelTask * 10) / 10,
      chromeGpu: Math.round(chromeGpu * 10) / 10,
      chromeRenderer: Math.round(chromeRenderer * 10) / 10,
      chromeOther: Math.round(chromeOther * 10) / 10,
      vtDecoder: Math.round(vtDecoder * 10) / 10,
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function collectContinuousSamples(durationSec = 10, intervalMs = 1000) {
  const samples = [];
  const count = Math.floor((durationSec * 1000) / intervalMs);
  for (let i = 0; i < count; i++) {
    samples.push(sampleProcesses());
    await sleep(intervalMs);
  }

  // Calculate averages
  const avg = {
    windowServer: 0,
    cameracaptured: 0,
    appleh16camerad: 0,
    kernelTask: 0,
    chromeGpu: 0,
    chromeRenderer: 0,
  };

  for (const s of samples) {
    avg.windowServer += s.windowServer || 0;
    avg.cameracaptured += s.cameracaptured || 0;
    avg.appleh16camerad += s.appleh16camerad || 0;
    avg.kernelTask += s.kernelTask || 0;
    avg.chromeGpu += s.chromeGpu || 0;
    avg.chromeRenderer += s.chromeRenderer || 0;
  }

  const n = samples.length || 1;
  return {
    sampleCount: n,
    averages: {
      windowServer: Math.round((avg.windowServer / n) * 10) / 10,
      cameracaptured: Math.round((avg.cameracaptured / n) * 10) / 10,
      appleh16camerad: Math.round((avg.appleh16camerad / n) * 10) / 10,
      kernelTask: Math.round((avg.kernelTask / n) * 10) / 10,
      chromeGpu: Math.round((avg.chromeGpu / n) * 10) / 10,
      chromeRenderer: Math.round((avg.chromeRenderer / n) * 10) / 10,
    },
    latestSample: samples[samples.length - 1],
  };
}

async function runMatrix() {
  console.log('================================================================');
  console.log('CINEVA PHASE 5: CONTROLLED REPRODUCTION & A/B MEASUREMENT MATRIX');
  console.log('================================================================\n');

  console.log('1. Baseline (System Idle, No Camera Active)');
  const baseline = await collectContinuousSamples(5, 1000);
  console.log('Baseline Averages (5s sample):', JSON.stringify(baseline.averages, null, 2));

  // Let's check native macOS camera hardware settings
  console.log('\n2. System Camera Hardware Information:');
  try {
    const sysProfile = execSync('system_profiler SPCameraDataType -json 2>/dev/null').toString();
    console.log(sysProfile);
  } catch (e) {
    console.log('system_profiler error:', e.message);
  }

  // Check top memory and CPU breakdown
  console.log('\n3. macOS top snapshot:');
  try {
    const top = execSync('top -l 1 -n 0 -s 0 | head -n 12').toString();
    console.log(top);
  } catch (e) {}

  // Check display info and refresh rate
  console.log('\n4. Display & Refresh Rate:');
  try {
    const display = execSync('system_profiler SPDisplaysDataType 2>/dev/null | grep -E "Resolution|UI Looks like|Main Display|Mirror|Refresh Rate"').toString();
    console.log(display);
  } catch (e) {}

  console.log('\nMatrix runner setup ready.');
}

runMatrix();
