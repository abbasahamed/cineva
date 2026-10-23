const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');

async function runAllAcceptanceTests() {
  console.log('==================================================');
  console.log('STARTING REAL BROWSER CDP ACCEPTANCE VERIFICATION');
  console.log('==================================================');

  // Spawn Chrome with CDP
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--remote-debugging-port=9222',
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required'
  ]);

  await new Promise((r) => setTimeout(r, 1500));

  class CDPPage {
    constructor(targetId, wsUrl) {
      this.targetId = targetId;
      this.wsUrl = wsUrl;
      this.ws = null;
      this.msgId = 1;
      this.callbacks = new Map();
    }

    async connect() {
      this.ws = new WebSocket(this.wsUrl);
      await new Promise((r) => (this.ws.onopen = r));
      this.ws.onmessage = (event) => {
        const res = JSON.parse(event.data);
        if (res.id && this.callbacks.has(res.id)) {
          const cb = this.callbacks.get(res.id);
          this.callbacks.delete(res.id);
          if (res.error) cb.reject(new Error(res.error.message));
          else cb.resolve(res.result);
        }
      };
      await this.send('Runtime.enable');
      await this.send('Page.enable');
    }

    send(method, params = {}) {
      const id = this.msgId++;
      return new Promise((resolve, reject) => {
        this.callbacks.set(id, { resolve, reject });
        this.ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async navigate(url) {
      await this.send('Page.navigate', { url });
      await new Promise((r) => setTimeout(r, 1000));
    }

    async evaluate(expression) {
      const res = await this.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.text || 'Eval exception');
      }
      return res.result ? res.result.value : undefined;
    }

    async waitForExpr(expression, timeoutMs = 15000, pollMs = 250) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        try {
          const val = await this.evaluate(expression);
          if (val) return val;
        } catch {}
        await new Promise((r) => setTimeout(r, pollMs));
      }
      throw new Error(`Timeout waiting for expression: ${expression}`);
    }

    async close() {
      if (this.ws) {
        try { this.ws.close(); } catch {}
      }
      await fetch(`http://127.0.0.1:9222/json/close/${this.targetId}`, { method: 'GET' }).catch(() => {});
    }
  }

  async function createPage(initialUrl = 'http://localhost:5173/') {
    const res = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(initialUrl)}`, { method: 'PUT' });
    const target = await res.json();
    const page = new CDPPage(target.id, target.webSocketDebuggerUrl);
    await page.connect();
    return page;
  }

  try {
    // ==================================================
    // TEST 1 — BABY VIDEO IN ACTUAL WATCH ROOM
    // ==================================================
    console.log('\n--------------------------------------------------');
    console.log('TEST 1 — BABY VIDEO IN ACTUAL WATCH ROOM');
    console.log('--------------------------------------------------');

    // 1. Create a fresh room
    const createRes = await fetch('http://localhost:4000/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'AcceptanceHost', roomName: 'Baby Movie Acceptance Room' })
    });
    const createData = await createRes.json();
    const roomId = createData.room.id;
    const roomCode = createData.room.roomCode;
    const hostSessionId = createData.hostSessionId;

    console.log(`Created Room Code: ${roomCode}, Room ID: ${roomId}`);

    // 2. Upload Baby MKV file
    const filePath = '/Users/abbas/Downloads/www.5MovieRulz.pw - Baby (2023) 1080p Telugu TRUE WEB-DL - AVC - (DD+5.1 - 384Kbps & AAC) - 3.1GB - ESub.mkv';
    console.log('Uploading Baby MKV file (3.1GB)...');

    const form = new FormData();
    form.append('roomId', roomId);
    form.append('sessionId', hostSessionId);
    form.append('title', 'Baby 2023');
    form.append('video', fs.createReadStream(filePath));

    await new Promise((resolve, reject) => {
      form.submit('http://localhost:4000/api/media/upload', (err, res) => {
        if (err) return reject(err);
        let b = '';
        res.on('data', chunk => b += chunk);
        res.on('end', () => {
          console.log('Upload response status:', res.statusCode);
          resolve(b);
        });
      });
    });

    // 3. Poll for READY state
    console.log('Waiting for media processing job to finish...');
    let isReady = false;
    for (let i = 0; i < 90; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const rRes = await fetch(`http://localhost:4000/api/rooms/${roomCode}`);
      const rData = await rRes.json();
      console.log(`Poll ${i}: status=${rData.media?.status}, progress=${rData.media?.transcodeProgress}%`);
      if (rData.media?.status === 'ready') {
        isReady = true;
        console.log('MEDIA READY RECORD:', JSON.stringify(rData.media, null, 2));
        break;
      }
      if (rData.media?.status === 'failed') {
        console.error('MEDIA TRANSCODING FAILED:', rData.media.transcodeError);
        break;
      }
    }

    if (!isReady) {
      throw new Error('Media processing did not reach READY state.');
    }

    // 4. Open Watch Room in Chrome tab
    const page1 = await createPage(`http://localhost:5173/`);
    await page1.evaluate(`
      localStorage.setItem('cineva_session_id', '${hostSessionId}');
      localStorage.setItem('cineva_display_name', 'AcceptanceHost');
    `);
    await page1.navigate(`http://localhost:5173/room/${roomCode}`);

    console.log('Navigated to Watch Room http://localhost:5173/room/' + roomCode);

    // Wait for video element in DOM
    await page1.waitForExpr(`Boolean(document.querySelector('video'))`, 15000);
    await page1.waitForExpr(`Boolean(document.querySelector('video') && document.querySelector('video').readyState >= 1)`, 15000);
    await new Promise(r => setTimeout(r, 2500));

    // Play video
    await page1.evaluate(`
      (async () => {
        const v = document.querySelector('video');
        if (v) {
          try { await v.play(); } catch (e) {}
        }
      })()
    `);

    await new Promise(r => setTimeout(r, 1500));

    const test1Metrics = await page1.evaluate(`
      (() => {
        const v = document.querySelector('video');
        if (!v) return { error: 'No video element' };
        return {
          mediaStatus: 'ready',
          hasVideoPlayer: Boolean(v),
          src: v.currentSrc || v.src,
          readyState: v.readyState,
          videoWidth: v.videoWidth,
          videoHeight: v.videoHeight,
          duration: v.duration,
          currentTimeBefore: v.currentTime,
          paused: v.paused,
          mediaError: v.error ? v.error.message : null,
        };
      })()
    `);

    console.log('TEST 1 METRICS (INITIAL PLAYBACK):', JSON.stringify(test1Metrics, null, 2));

    // Seek to 300s
    await page1.evaluate(`
      (() => {
        const v = document.querySelector('video');
        if (v) v.currentTime = 300;
      })()
    `);

    await new Promise(r => setTimeout(r, 1500));

    const test1SeekMetrics = await page1.evaluate(`
      (() => {
        const v = document.querySelector('video');
        if (!v) return {};
        return {
          currentTimeAfterSeek: v.currentTime,
          pausedAfterSeek: v.paused,
          readyStateAfterSeek: v.readyState
        };
      })()
    `);

    console.log('TEST 1 METRICS (AFTER SEEK TO 300s):', JSON.stringify(test1SeekMetrics, null, 2));

    const pass1 = test1Metrics.videoWidth > 0 &&
                  test1Metrics.videoHeight > 0 &&
                  test1Metrics.duration > 0 &&
                  test1Metrics.readyState >= 3 &&
                  test1Metrics.mediaError === null &&
                  test1SeekMetrics.currentTimeAfterSeek >= 299;

    console.log('TEST 1 RESULT:', pass1 ? 'PASS' : 'FAIL');
    await page1.close();

    // ==================================================
    // TEST 2 — TWO-BROWSER HOST CANCELLATION
    // ==================================================
    console.log('\n--------------------------------------------------');
    console.log('TEST 2 — TWO-BROWSER HOST CANCELLATION');
    console.log('--------------------------------------------------');

    const room2Res = await fetch('http://localhost:4000/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'HostAlice', roomName: 'Host Cancellation Room' })
    });
    const room2Data = await room2Res.json();
    const room2Code = room2Data.room.roomCode;
    const room2HostSessionId = room2Data.hostSessionId;

    console.log('Test 2 Room Code:', room2Code);

    // Browser A = HOST
    const pageHost = await createPage(`http://localhost:5173/`);
    await pageHost.evaluate(`
      localStorage.setItem('cineva_session_id', '${room2HostSessionId}');
      localStorage.setItem('cineva_display_name', 'HostAlice');
    `);
    await pageHost.navigate(`http://localhost:5173/room/${room2Code}`);
    await pageHost.waitForExpr(`document.body.innerText.includes('HOST') || document.body.innerText.includes('HostAlice')`, 10000);

    // Browser B = GUEST
    const pageGuest = await createPage(`http://localhost:5173/`);
    await pageGuest.evaluate(`
      localStorage.setItem('cineva_session_id', 'guest_sess_t2_${Date.now()}');
      localStorage.setItem('cineva_display_name', 'GuestBob');
    `);
    await pageGuest.navigate(`http://localhost:5173/room/${room2Code}`);
    await pageGuest.waitForExpr(`document.body.innerText.includes('GuestBob') || document.body.innerText.includes('SYNCED')`, 10000);

    const guestConnected = await pageGuest.evaluate(`document.body.innerText.includes('SYNCED')`);
    console.log('Guest B Connected to Room:', guestConnected);

    // Host clicks Exit Room
    console.log('Host A clicking Exit Room button...');
    await pageHost.evaluate(`
      (() => {
        const exitBtn = document.querySelector('button[title="Exit Screening"]');
        if (exitBtn) exitBtn.click();
      })()
    `);

    await new Promise((r) => setTimeout(r, 600));

    const guestCancellationSequence = await pageGuest.evaluate(`
      (() => {
        const bodyText = document.body.innerText;
        return {
          currentUrl: window.location.href,
          hasCancelledHeading: bodyText.includes('Room Cancelled'),
          hasHostLeftText: bodyText.includes('The host has left the room') || bodyText.includes('screening has ended'),
          hasReturningToHomeText: bodyText.includes('Returning to Home') || bodyText.includes('Return to Home'),
        };
      })()
    `);

    console.log('GUEST B CANCELLATION SEQUENCE (IMMEDIATE):', JSON.stringify(guestCancellationSequence, null, 2));

    await new Promise((r) => setTimeout(r, 1600));

    const guestAfterRedirect = await pageGuest.evaluate(`
      (() => {
        return {
          finalUrl: window.location.href,
          isHome: window.location.pathname === '/' || window.location.href.endsWith(':5173/'),
        };
      })()
    `);

    console.log('GUEST B AFTER AUTO REDIRECT:', JSON.stringify(guestAfterRedirect, null, 2));

    const pass2 = guestCancellationSequence.hasHostLeftText &&
                  guestAfterRedirect.isHome;

    console.log('TEST 2 RESULT:', pass2 ? 'PASS' : 'FAIL');

    await pageHost.close();
    await pageGuest.close();

    // ==================================================
    // TEST 3 — GUEST EXIT
    // ==================================================
    console.log('\n--------------------------------------------------');
    console.log('TEST 3 — GUEST EXIT');
    console.log('--------------------------------------------------');

    const room3Res = await fetch('http://localhost:4000/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'HostAlice3', roomName: 'Guest Exit Room' })
    });
    const room3Data = await room3Res.json();
    const room3Code = room3Data.room.roomCode;
    const room3HostSessionId = room3Data.hostSessionId;

    const page3Host = await createPage(`http://localhost:5173/`);
    await page3Host.evaluate(`
      localStorage.setItem('cineva_session_id', '${room3HostSessionId}');
      localStorage.setItem('cineva_display_name', 'HostAlice3');
    `);
    await page3Host.navigate(`http://localhost:5173/room/${room3Code}`);
    await page3Host.waitForExpr(`document.body.innerText.includes('HOST')`, 10000);

    const page3Guest = await createPage(`http://localhost:5173/`);
    await page3Guest.evaluate(`
      localStorage.setItem('cineva_session_id', 'guest_sess_t3_${Date.now()}');
      localStorage.setItem('cineva_display_name', 'GuestBob3');
    `);
    await page3Guest.navigate(`http://localhost:5173/room/${room3Code}`);
    await page3Guest.waitForExpr(`document.body.innerText.includes('GuestBob3')`, 10000);

    console.log('Guest B clicking Exit Room button...');
    await page3Guest.evaluate(`
      (() => {
        const exitBtn = document.querySelector('button[title="Exit Screening"]');
        if (exitBtn) exitBtn.click();
      })()
    `);

    await new Promise((r) => setTimeout(r, 1000));

    const guest3Url = await page3Guest.evaluate(`window.location.pathname`);
    const host3State = await page3Host.evaluate(`
      (() => {
        const bodyText = document.body.innerText;
        return {
          pathname: window.location.pathname,
          isHost: bodyText.includes('HOST'),
          roomActive: !bodyText.includes('Room Cancelled') && !bodyText.includes('Screening Ended'),
          hasNoCancelledToast: !bodyText.includes('ROOM CANCELLED')
        };
      })()
    `);

    console.log('TEST 3 GUEST B PATHNAME:', guest3Url);
    console.log('TEST 3 HOST A STATE:', JSON.stringify(host3State, null, 2));

    const pass3 = guest3Url === '/' && host3State.isHost && host3State.roomActive && host3State.hasNoCancelledToast;
    console.log('TEST 3 RESULT:', pass3 ? 'PASS' : 'FAIL');

    await page3Host.close();
    await page3Guest.close();

    // ==================================================
    // TEST 4 — UNEXPECTED HOST DISCONNECT
    // ==================================================
    console.log('\n--------------------------------------------------');
    console.log('TEST 4 — UNEXPECTED HOST DISCONNECT');
    console.log('--------------------------------------------------');

    const room4Res = await fetch('http://localhost:4000/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'HostAlice4', roomName: 'Unexpected Disconnect Room' })
    });
    const room4Data = await room4Res.json();
    const room4Code = room4Data.room.roomCode;
    const room4HostSessionId = room4Data.hostSessionId;

    const page4Host = await createPage(`http://localhost:5173/`);
    await page4Host.evaluate(`
      localStorage.setItem('cineva_session_id', '${room4HostSessionId}');
      localStorage.setItem('cineva_display_name', 'HostAlice4');
    `);
    await page4Host.navigate(`http://localhost:5173/room/${room4Code}`);
    await page4Host.waitForExpr(`document.body.innerText.includes('HOST')`, 10000);

    const page4Guest = await createPage(`http://localhost:5173/`);
    await page4Guest.evaluate(`
      localStorage.setItem('cineva_session_id', 'guest_sess_t4_${Date.now()}');
      localStorage.setItem('cineva_display_name', 'GuestBob4');
    `);
    await page4Guest.navigate(`http://localhost:5173/room/${room4Code}`);
    await page4Guest.waitForExpr(`document.body.innerText.includes('GuestBob4')`, 10000);

    console.log('Abruptly closing Host A tab (simulating network drop / tab crash)...');
    await page4Host.close();

    await new Promise((r) => setTimeout(r, 1000));
    const immediateGuestState = await page4Guest.evaluate(`
      (() => {
        return {
          isCancelledInstantly: document.body.innerText.includes('Room Cancelled'),
          pathname: window.location.pathname
        };
      })()
    `);
    console.log('GUEST B IMMEDIATE STATE (0-1s after host drop):', JSON.stringify(immediateGuestState, null, 2));

    console.log('Waiting for 30s grace period expiration...');
    let graceCancelled = false;
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const status = await page4Guest.evaluate(`
        (() => {
          return {
            isCancelled: document.body.innerText.includes('Room Cancelled') || document.body.innerText.includes('The host has left the room'),
            pathname: window.location.pathname
          };
        })()
      `);
      console.log(`Grace period check t=${(i+1)*2}s:`, status);
      if (status.isCancelled || status.pathname === '/') {
        graceCancelled = true;
        break;
      }
    }

    await new Promise((r) => setTimeout(r, 1600));
    const finalGuest4Url = await page4Guest.evaluate(`window.location.pathname`);
    console.log('GUEST B FINAL PATHNAME AFTER GRACE PERIOD:', finalGuest4Url);

    const pass4 = !immediateGuestState.isCancelledInstantly && graceCancelled && finalGuest4Url === '/';
    console.log('TEST 4 RESULT:', pass4 ? 'PASS' : 'FAIL');

    await page4Guest.close();

    // ==================================================
    // TEST 5 — ROOM RESURRECTION
    // ==================================================
    console.log('\n--------------------------------------------------');
    console.log('TEST 5 — ROOM RESURRECTION');
    console.log('--------------------------------------------------');

    const page5Resurrect = await createPage(`http://localhost:5173/`);
    await page5Resurrect.evaluate(`
      localStorage.setItem('cineva_session_id', 'late_guest_${Date.now()}');
      localStorage.setItem('cineva_display_name', 'ResurrectGuest');
    `);
    await page5Resurrect.navigate(`http://localhost:5173/room/${room2Code}`);

    await new Promise((r) => setTimeout(r, 1500));

    const test5Metrics = await page5Resurrect.evaluate(`
      (() => {
        const text = document.body.innerText;
        return {
          pathname: window.location.pathname,
          hasEndedMessage: text.includes('This watch room has ended') || text.includes('Room not found') || text.includes('Screening Ended'),
          isActiveRoom: text.includes('SYNCED') && !text.includes('ended')
        };
      })()
    `);

    console.log('TEST 5 RECONNECT TO CANCELLED ROOM RESULT:', JSON.stringify(test5Metrics, null, 2));

    const pass5 = test5Metrics.hasEndedMessage && !test5Metrics.isActiveRoom;
    console.log('TEST 5 RESULT:', pass5 ? 'PASS' : 'FAIL');

    await page5Resurrect.close();

    console.log('\n==================================================');
    console.log('FINAL ACCEPTANCE SUMMARY:');
    console.log(`TEST 1 (Baby Video Playback): ${pass1 ? 'PASS' : 'FAIL'}`);
    console.log(`TEST 2 (Host Exit Cancellation): ${pass2 ? 'PASS' : 'FAIL'}`);
    console.log(`TEST 3 (Guest Exit): ${pass3 ? 'PASS' : 'FAIL'}`);
    console.log(`TEST 4 (Host Unexpected Disconnect): ${pass4 ? 'PASS' : 'FAIL'}`);
    console.log(`TEST 5 (Room Resurrection Protection): ${pass5 ? 'PASS' : 'FAIL'}`);
    console.log('==================================================');

  } finally {
    chrome.kill();
  }
}

runAllAcceptanceTests();
