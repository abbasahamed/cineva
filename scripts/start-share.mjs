#!/usr/bin/env node
/**
 * One-command share: checks the required binaries, builds the app, starts the
 * server with a Cloudflare quick tunnel, and prints a banner with the public
 * link. The server process spawns the `caffeinate -dims` keep-awake guard and
 * kills it again on shutdown, so it stays tied to the server's lifetime.
 */
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Homebrew formula that provides each binary (ffmpeg provides ffprobe too).
const BREW_FORMULA = {
  ffmpeg: 'ffmpeg',
  ffprobe: 'ffmpeg',
  cloudflared: 'cloudflared',
};

function checkBinary(bin) {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(whichCmd, [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // 1. Check required media binaries (ffmpeg, ffprobe).
  const missing = ['ffmpeg', 'ffprobe'].filter((bin) => !checkBinary(bin));
  if (missing.length > 0) {
    console.log('\n\u274c Missing required tools:\n');
    if (process.platform === 'darwin') {
      const formulas = [...new Set(missing.map((b) => BREW_FORMULA[b]))];
      for (const formula of formulas) {
        console.log(`   brew install ${formula}`);
      }
      console.log('\nInstall the above with Homebrew, then re-run `npm run start:share`.\n');
    } else if (process.platform === 'win32') {
      console.log('   winget install Gyan.FFmpeg');
      console.log('   (or download from https://ffmpeg.org/download.html and add to PATH)');
      console.log('\nInstall FFmpeg, ensure it is added to your PATH, and restart your terminal.\n');
    } else {
      console.log('   sudo apt update && sudo apt install -y ffmpeg');
      console.log('\nInstall FFmpeg with your package manager, then re-run `npm run start:share`.\n');
    }
    process.exit(1);
  }

  if (!checkBinary('cloudflared')) {
    console.log('\u2139\ufe0f  cloudflared not detected in PATH; CINEVA will use native SSH-HTTPS tunnel fallback.\n');
  }

  // 2. Build the server and web app (idempotent, picks up latest changes).
  console.log('\u{1F528} Building Cineva (server + web)...\n');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npmCmd, ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });

  // 3. Start the server with the tunnel enabled. The server spawns cloudflared (or SSH tunnel)
  //    and `caffeinate -dims` (tied to its own lifetime).
  const server = spawn('node', ['dist/index.js'], {
    cwd: path.join(ROOT, 'apps', 'server'),
    env: { ...process.env, ENABLE_TUNNEL: 'true', KEEP_AWAKE: 'true' },
    stdio: 'inherit',
  });

  // Forward termination signals to the server so it can shut down gracefully.
  const forwardSignal = (signal) => {
    try { server.kill(signal); } catch { /* already exited */ }
  };
  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));
  process.on('exit', () => forwardSignal('SIGTERM'));
  server.on('exit', (code) => process.exit(code ?? 0));

  // 4. Poll for the tunnel URL and wait until it is available before announcing readiness.
  const port = process.env.PORT || '4000';
  const base = `http://localhost:${port}`;
  let publicUrl = null;
  let lastTunnelError = null;
  process.stdout.write('⏳ Waiting for public HTTPS tunnel to establish...');
  for (let i = 0; i < 60; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    process.stdout.write('.');
    try {
      const res = await fetch(`${base}/api/system/public-url`);
      const data = await res.json();
      if (data && data.publicUrl) {
        publicUrl = data.publicUrl;
        break;
      }
      if (data && data.tunnelError) {
        lastTunnelError = data.tunnelError;
      }
    } catch {
      // Server not ready yet; keep polling.
    }
  }
  console.log('\n');

  const bar = '='.repeat(64);
  console.log(`\n${bar}`);
  console.log('  CINEVA \u2014 your private screening room is live');
  console.log(bar);
  if (publicUrl) {
    console.log(`  Public link:   ${publicUrl}`);
    console.log(`  Create a room: ${publicUrl}/create`);
    console.log(`  Status:        READY \u2014 friends can join from any network`);
  } else {
    console.log(`  Local:         ${base}`);
    if (lastTunnelError) {
      console.log(`  \u26a0\ufe0f  Tunnel error: ${lastTunnelError}`);
    }
    let dnsFailed = false;
    try {
      const dns = await import('node:dns/promises');
      await dns.lookup('api.trycloudflare.com');
    } catch {
      dnsFailed = true;
    }
    if (dnsFailed) {
      console.log('  \u26a0\ufe0f  DNS lookup failed for api.trycloudflare.com.');
      console.log('     Your local Wi-Fi or router DNS cannot resolve Cloudflare quick tunnels.');
      if (process.platform === 'darwin') {
        console.log('     To fix on macOS, switch DNS to 1.1.1.1 / 8.8.8.8:');
        console.log('     networksetup -setdnsservers Wi-Fi 1.1.1.1 8.8.8.8');
      } else if (process.platform === 'win32') {
        console.log('     To fix on Windows, switch your network adapter DNS to 1.1.1.1 / 8.8.8.8 in Windows Settings.');
      } else {
        console.log('     To fix on Linux, configure 1.1.1.1 / 8.8.8.8 in /etc/resolv.conf.');
      }
    } else {
      console.log('  (The public tunnel URL did not appear yet.');
      console.log('   Check server logs or re-run `npm run start:share`.)');
    }
  }
  console.log('  Room code:    created when you start a screening \u2014 open the');
  console.log('                link above and click "Create a room".');
  console.log(`${bar}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
