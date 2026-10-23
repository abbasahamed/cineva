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
    execFileSync('which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // 1. Check required binaries and print the exact install command if missing.
  const missing = ['ffmpeg', 'ffprobe', 'cloudflared'].filter((bin) => !checkBinary(bin));
  if (missing.length > 0) {
    console.log('\n\u274c Missing required tools:\n');
    const formulas = [...new Set(missing.map((b) => BREW_FORMULA[b]))];
    for (const formula of formulas) {
      console.log(`   brew install ${formula}`);
    }
    console.log('\nInstall the above with Homebrew, then re-run `npm run start:share`.\n');
    process.exit(1);
  }

  // 2. Build the server and web app (idempotent, picks up latest changes).
  console.log('\u{1F528} Building Cineva (server + web)...\n');
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });

  // 3. Start the server with the tunnel enabled. The server spawns cloudflared
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

  // 4. Poll for the tunnel URL and print the banner.
  const port = process.env.PORT || '4000';
  const base = `http://localhost:${port}`;
  let publicUrl = null;
  for (let i = 0; i < 60; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const res = await fetch(`${base}/api/system/public-url`);
      const data = await res.json();
      if (data && data.publicUrl) {
        publicUrl = data.publicUrl;
        break;
      }
    } catch {
      // Server not ready yet; keep polling.
    }
  }

  const bar = '='.repeat(64);
  console.log(`\n${bar}`);
  console.log('  CINEVA \u2014 your private screening room is live');
  console.log(bar);
  if (publicUrl) {
    console.log(`  Public link:   ${publicUrl}`);
    console.log(`  Create a room: ${publicUrl}/create`);
  } else {
    console.log(`  Local:         ${base}`);
    let dnsFailed = false;
    try {
      const dns = await import('node:dns/promises');
      await dns.lookup('api.trycloudflare.com');
    } catch {
      dnsFailed = true;
    }
    if (dnsFailed) {
      console.log('  ⚠️  DNS lookup failed for api.trycloudflare.com.');
      console.log('     Your local Wi-Fi or router DNS cannot resolve Cloudflare quick tunnels.');
      console.log('     To fix, you can manually switch macOS DNS to 1.1.1.1 / 8.8.8.8:');
      console.log('     networksetup -setdnsservers Wi-Fi 1.1.1.1 8.8.8.8');
    } else {
      console.log('  (The public tunnel URL did not appear yet. It usually takes a');
      console.log('   few seconds after cloudflared starts. If it never appears,');
      console.log('   run: brew install cloudflared, then retry.)');
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
