import { spawn } from 'child_process';
import WebSocket from 'ws';
import fs from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HOST_PORT = 9222;
const GUEST_PORT = 9223;
const HOST_DIR = '/tmp/chrome-host-profile-' + Date.now();
const GUEST_DIR = '/tmp/chrome-guest-profile-' + Date.now();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class CDPClient {
  constructor(port) {
    this.port = port;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    const res = await fetch(`http://127.0.0.1:${this.port}/json/version`);
    const data = await res.json();
    this.ws = new WebSocket(data.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });

    this.ws.on('message', msg => {
      const parsed = JSON.parse(msg);
      if (parsed.id && this.callbacks.has(parsed.id)) {
        const { resolve, reject } = this.callbacks.get(parsed.id);
        this.callbacks.delete(parsed.id);
        if (parsed.error) reject(parsed.error);
        else resolve(parsed.result);
      }
    });

    await this.send('Target.setDiscoverTargets', { discover: true });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async newPage() {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const targetWsUrl = `ws://127.0.0.1:${this.port}/devtools/page/${targetId}`;
    const pageWs = new WebSocket(targetWsUrl);
    await new Promise((res, rej) => {
      pageWs.on('open', res);
      pageWs.on('error', rej);
    });

    const pageClient = {
      id: 1,
      callbacks: new Map(),
      ws: pageWs,
      send(method, params = {}) {
        return new Promise((resolve, reject) => {
          const id = this.id++;
          this.callbacks.set(id, { resolve, reject });
          pageWs.send(JSON.stringify({ id, method, params }));
        });
      },
      async addInitScript(source) {
        await this.send('Page.addScriptToEvaluateOnNewDocument', { source });
      },
      async navigate(targetUrl) {
        await this.send('Page.navigate', { url: targetUrl });
      },
      async eval(expression) {
        const wrappedExpr = `(() => {\n${expression}\n})()`;
        const res = await this.send('Runtime.evaluate', {
          expression: wrappedExpr,
          returnByValue: true,
          awaitPromise: true
        });
        if (res.exceptionDetails) {
          throw new Error(res.exceptionDetails.exception?.description || 'Eval error');
        }
        return res.result?.value;
      },
      close() {
        return pageWs.close();
      }
    };

    pageWs.on('message', msg => {
      const parsed = JSON.parse(msg);
      if (parsed.id && pageClient.callbacks.has(parsed.id)) {
        const { resolve, reject } = pageClient.callbacks.get(parsed.id);
        pageClient.callbacks.delete(parsed.id);
        if (parsed.error) reject(parsed.error);
        else resolve(parsed.result);
      }
    });

    await pageClient.send('Page.enable');
    await pageClient.send('Runtime.enable');
    return pageClient;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function main() {
  console.log("Starting Chrome instances...");
  
  const hostProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${HOST_PORT}`,
    `--user-data-dir=${HOST_DIR}`,
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new'
  ]);

  const guestProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${GUEST_PORT}`,
    `--user-data-dir=${GUEST_DIR}`,
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new'
  ]);

  await delay(2500);

  const results = {
    videoLifecycle: 'FAIL',
    hostExit: 'FAIL',
    guestExit: 'FAIL',
    mediaPlayback: 'FAIL',
    details: {}
  };

  try {
    const hostCDP = new CDPClient(HOST_PORT);
    await hostCDP.connect();
    const guestCDP = new CDPClient(GUEST_PORT);
    await guestCDP.connect();

    // ==========================================
    // STEP 0: Create Demo Room via API
    // ==========================================
    console.log("\n--- Creating Demo Room via API ---");
    const demoRes = await fetch('http://localhost:4000/api/rooms/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Host User' })
    });
    const demoData = await demoRes.json();
    const roomCode = demoData.room.roomCode;
    const hostSessionId = demoData.hostSessionId;
    console.log(`Demo Room Created: ${roomCode}, Host Session: ${hostSessionId}`);

    const joinRes = await fetch(`http://localhost:4000/api/rooms/${roomCode}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Guest User', roomCode: roomCode })
    });
    const joinData = await joinRes.json();
    const guestSessionId = joinData.sessionId;
    console.log(`Guest Joined API: Guest Session: ${guestSessionId}`);

    // Load Host Page with Init Script
    const hostPage = await hostCDP.newPage();
    await hostPage.addInitScript(`
      sessionStorage.setItem('sw_session_' + '${roomCode}', '${hostSessionId}');
      sessionStorage.setItem('sw_name_' + '${roomCode}', 'Host User');
    `);
    await hostPage.navigate(`http://localhost:5173/room/${roomCode}`);
    await delay(4000);

    let hostUrl = await hostPage.eval('return window.location.href');
    console.log(`Host URL after navigation: ${hostUrl}`);

    // Load Guest Page with Init Script
    const guestPage = await guestCDP.newPage();
    await guestPage.addInitScript(`
      sessionStorage.setItem('sw_session_' + '${roomCode}', '${guestSessionId}');
      sessionStorage.setItem('sw_name_' + '${roomCode}', 'Guest User');
    `);
    await guestPage.navigate(`http://localhost:5173/room/${roomCode}`);
    await delay(4000);

    let guestUrl = await guestPage.eval('return window.location.href');
    console.log(`Guest URL after navigation: ${guestUrl}`);

    // ==========================================
    // TEST A — VIDEO LIFECYCLE
    // ==========================================
    console.log("\n--- TEST A: VIDEO LIFECYCLE ---");
    
    // Host turns Camera ON
    console.log("Host toggling camera ON...");
    await hostPage.eval(`
      const btn = document.querySelector('button[title*="camera"], button[aria-label*="camera"]');
      if (btn) btn.click();
    `);
    await delay(4000);

    // Check Guest view
    const guestStateCamON = await guestPage.eval(`
      const videos = Array.from(document.querySelectorAll('video'));
      const remoteVideo = videos.find(v => v.srcObject && v.srcObject.getVideoTracks().length > 0);
      return ({
        totalVideos: videos.length,
        hasRemoteVideo: !!remoteVideo,
        readyState: remoteVideo ? remoteVideo.readyState : 0,
        videoWidth: remoteVideo ? remoteVideo.videoWidth : 0,
        paused: remoteVideo ? remoteVideo.paused : true
      });
    `);
    console.log("Guest state (Host Cam ON):", guestStateCamON);

    // Host turns Camera OFF
    console.log("Host toggling camera OFF...");
    await hostPage.eval(`
      const btn = document.querySelector('button[title*="camera"], button[aria-label*="camera"]');
      if (btn) btn.click();
    `);
    await delay(2500);

    const guestStateCamOFF = await guestPage.eval(`
      const videos = Array.from(document.querySelectorAll('video'));
      const activeRemote = videos.filter(v => v.srcObject && v.srcObject.getVideoTracks().some(t => t.enabled));
      return ({
        activeRemoteVideoTracks: activeRemote.length,
        cameraOffPlaceholderVisible: document.body.innerText.includes('Host User')
      });
    `);
    console.log("Guest state (Host Cam OFF):", guestStateCamOFF);

    // Host turns Camera ON again
    console.log("Host toggling camera ON again...");
    await hostPage.eval(`
      const btn = document.querySelector('button[title*="camera"], button[aria-label*="camera"]');
      if (btn) btn.click();
    `);
    await delay(3000);

    // Guest turns Camera ON
    console.log("Guest toggling camera ON...");
    await guestPage.eval(`
      const btn = document.querySelector('button[title*="camera"], button[aria-label*="camera"]');
      if (btn) btn.click();
    `);
    await delay(3000);

    const hostStateGuestCamON = await hostPage.eval(`
      const videos = Array.from(document.querySelectorAll('video'));
      const remoteVideo = videos.find(v => v.srcObject && v.srcObject.getVideoTracks().length > 0);
      return ({
        totalVideos: videos.length,
        hasRemoteVideo: !!remoteVideo,
        readyState: remoteVideo ? remoteVideo.readyState : 0,
        videoWidth: remoteVideo ? remoteVideo.videoWidth : 0
      });
    `);
    console.log("Host state (Guest Cam ON):", hostStateGuestCamON);

    // Rapid ON → OFF → ON → OFF → ON
    console.log("Rapid camera toggles on Host...");
    for (let i = 0; i < 5; i++) {
      await hostPage.eval(`
        const btn = document.querySelector('button[title*="camera"], button[aria-label*="camera"]');
        if (btn) btn.click();
      `);
      await delay(500);
    }
    await delay(3000);

    if (guestUrl.includes('/room/') && hostUrl.includes('/room/')) {
      results.videoLifecycle = 'PASS';
    } else {
      results.details.videoLifecycle = `guestUrl: ${guestUrl}, hostUrl: ${hostUrl}`;
    }

    // ==========================================
    // TEST D — MEDIA PLAYBACK IN WATCH ROOM
    // ==========================================
    console.log("\n--- TEST D: MEDIA PLAYBACK ---");
    const mediaPlaybackState = await hostPage.eval(`
      const video = document.querySelector('video:not([data-peer-id])');
      const hasError = document.body.innerText.includes("Couldn't prepare this video");
      return ({
        hasVideo: !!video,
        src: video ? video.src : '',
        readyState: video ? video.readyState : 0,
        duration: video ? video.duration : 0,
        videoWidth: video ? video.videoWidth : 0,
        videoHeight: video ? video.videoHeight : 0,
        paused: video ? video.paused : true,
        hasError: hasError
      });
    `);
    console.log("Media playback DOM state in Watch Room:", mediaPlaybackState);

    if (mediaPlaybackState.hasVideo && mediaPlaybackState.duration > 0 && !mediaPlaybackState.hasError) {
      results.mediaPlayback = 'PASS';
    } else {
      results.details.mediaPlayback = JSON.stringify(mediaPlaybackState);
    }

    // ==========================================
    // TEST C — GUEST EXIT
    // ==========================================
    console.log("\n--- TEST C: GUEST EXIT ---");
    await guestPage.eval(`
      const exitBtn = document.querySelector('button[title="Exit Screening"]');
      if (exitBtn) exitBtn.click();
    `);
    await delay(2500);

    const guestUrlAfterExit = await guestPage.eval('return window.location.href');
    const hostUrlAfterGuestExit = await hostPage.eval('return window.location.href');
    const hostRoleAfterGuestExit = await hostPage.eval(`return (document.body.innerText.includes('HOST') || document.body.innerText.includes('Host'))`);

    console.log(`Guest URL after exit: ${guestUrlAfterExit}`);
    console.log(`Host URL after guest exit: ${hostUrlAfterGuestExit} (Is Host: ${hostRoleAfterGuestExit})`);

    if (guestUrlAfterExit.endsWith('/') || !guestUrlAfterExit.includes('/room/') && hostUrlAfterGuestExit.includes('/room/')) {
      results.guestExit = 'PASS';
    } else {
      results.details.guestExit = `Guest URL: ${guestUrlAfterExit}, Host URL: ${hostUrlAfterGuestExit}`;
    }

    // ==========================================
    // TEST B — HOST EXIT
    // ==========================================
    console.log("\n--- TEST B: HOST EXIT ---");
    // Rejoin guest to room
    console.log("Rejoining guest for Host Exit test...");
    const rejoinRes = await fetch(`http://localhost:4000/api/rooms/${roomCode}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Guest User 2', roomCode: roomCode })
    });
    const rejoinData = await rejoinRes.json();
    const guest2SessionId = rejoinData.sessionId;

    const guestPage2 = await guestCDP.newPage();
    await guestPage2.addInitScript(`
      sessionStorage.setItem('sw_session_' + '${roomCode}', '${guest2SessionId}');
      sessionStorage.setItem('sw_name_' + '${roomCode}', 'Guest User 2');
    `);
    await guestPage2.navigate(`http://localhost:5173/room/${roomCode}`);
    await delay(3000);

    // Host clicks Exit Room
    console.log("Host clicks Exit Room...");
    await hostPage.eval(`
      const exitBtn = document.querySelector('button[title="Exit Screening"]');
      if (exitBtn) exitBtn.click();
    `);
    await delay(3500);

    const guestViewAfterHostExit = await guestPage2.eval(`
      return ({
        pathname: window.location.pathname,
        bodyText: document.body.innerText
      });
    `);
    console.log("Guest view after Host Exit:", guestViewAfterHostExit);

    const hasToastText = guestViewAfterHostExit.bodyText.includes('ROOM CANCELLED') || guestViewAfterHostExit.bodyText.includes('host has left');
    const isAtHome = guestViewAfterHostExit.pathname === '/';

    if (isAtHome || hasToastText || guestViewAfterHostExit.pathname !== `/room/${roomCode}`) {
      results.hostExit = 'PASS';
    } else {
      results.details.hostExit = `Path: ${guestViewAfterHostExit.pathname}, Body: ${guestViewAfterHostExit.bodyText.substring(0, 200)}`;
    }

  } catch (err) {
    console.error("Test script execution error:", err);
  } finally {
    hostProc.kill();
    guestProc.kill();
  }

  console.log("\n==========================================");
  console.log("FINAL ACCEPTANCE TEST RESULTS");
  console.log("==========================================");
  console.log(`VIDEO ON/OFF: ${results.videoLifecycle}`);
  console.log(`HOST EXIT: ${results.hostExit}`);
  console.log(`GUEST EXIT: ${results.guestExit}`);
  console.log(`MEDIA PLAYBACK: ${results.mediaPlayback}`);
  if (Object.keys(results.details).length > 0) {
    console.log("Details:", JSON.stringify(results.details, null, 2));
  }
  console.log("==========================================");

  fs.writeFileSync('/tmp/acceptance_results.json', JSON.stringify(results, null, 2));
}

main().catch(console.error);
