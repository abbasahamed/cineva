import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import dns from 'dns';
import { execSync, spawn } from 'child_process';
import { CONFIG } from '../config.js';
import { logger } from '../utils/logger.js';

const dnsPromises = dns.promises;

class TunnelService {
  private activeTunnelUrl: string | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private isChecking = false;

  constructor() {
    const rawEnv = (process.env.CINEVA_PUBLIC_URL || process.env.CLOUDFLARE_TUNNEL_DOMAIN || '').trim().replace(/\/+$/, '');
    if (rawEnv && !rawEnv.includes('localhost') && !rawEnv.includes('127.0.0.1')) {
      this.activeTunnelUrl = rawEnv.startsWith('http') ? rawEnv : `https://${rawEnv}`;
    }
  }

  /**
   * Validates if a public hostname is syntactically valid AND resolves via DNS.
   */
  public async isUrlLive(urlStr: string | null): Promise<boolean> {
    if (!urlStr) return false;
    if (process.env.NODE_ENV === 'test') return true;
    try {
      const parsed = new URL(urlStr);
      if (!parsed.hostname || parsed.hostname.length <= 3) return false;
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return true;

      return await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 1200);
        dns.lookup(parsed.hostname, (err, address) => {
          clearTimeout(timer);
          if (err || !address) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    } catch {
      return false;
    }
  }

  private cloudflaredChild: any = null;

  /**
   * Forcibly restarts cloudflared to obtain a fresh quick tunnel.
   */
  public restartCloudflared(localPort: number = CONFIG.PORT || 4000): void {
    logger.warn('[TunnelService] Restarting cloudflared process to obtain fresh live tunnel...');
    if (this.cloudflaredChild) {
      try {
        this.cloudflaredChild.kill('SIGTERM');
      } catch {}
      this.cloudflaredChild = null;
    } else {
      try {
        execSync('pkill -9 -f cloudflared || true', { encoding: 'utf8', timeout: 2000 });
      } catch {}
    }
    this.activeTunnelUrl = null;
    this.ensureCloudflaredRunning(localPort);
  }

  public getActiveTunnelUrl(): string | null {
    return this.activeTunnelUrl;
  }

  /**
   * Set or update active public tunnel URL.
   */
  public setActiveTunnelUrl(url: string | null): void {
    if (!url) return;
    const cleanUrl = url.trim().replace(/\/+$/, '');
    if (
      cleanUrl &&
      !cleanUrl.includes('localhost') &&
      !cleanUrl.includes('127.0.0.1') &&
      !cleanUrl.includes('192.168.') &&
      !cleanUrl.includes('10.')
    ) {
      const formatted = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
      if (this.activeTunnelUrl !== formatted) {
        this.activeTunnelUrl = formatted;
        logger.info('[TunnelService] Active public tunnel URL updated', { publicUrl: this.activeTunnelUrl });
      }
    }
  }

  /**
  /**
   * Attempt to discover Cloudflare quick-tunnel hostname by querying local cloudflared metrics / quicktunnel API.
   */
  public async discoverCloudflaredTunnel(): Promise<string | null> {
    const candidatePorts = [20241, 20242, 20243, 20244, 20245, 60123];

    for (const port of candidatePorts) {
      try {
        const tunnelUrl = await this.queryCloudflaredQuickTunnel(port);
        if (tunnelUrl) {
          const live = await this.isUrlLive(tunnelUrl);
          if (live) {
            this.setActiveTunnelUrl(tunnelUrl);
            return tunnelUrl;
          } else {
            logger.warn('[TunnelService] Stale cloudflared process detected (DNS resolution failed). Restarting cloudflared...', { deadUrl: tunnelUrl });
            this.restartCloudflared(CONFIG.PORT || 4000);
            return null;
          }
        }
      } catch {}
    }

    // Dynamic port discovery via process inspection on macOS/Linux
    try {
      if (process.platform === 'darwin' || process.platform === 'linux') {
        const pidsRaw = execSync('pgrep -f cloudflared', { encoding: 'utf8', timeout: 1000 }).trim();
        if (pidsRaw) {
          const pids = pidsRaw.split('\n');
          for (const pidStr of pids) {
            const pid = parseInt(pidStr.trim(), 10);
            if (isNaN(pid) || pid <= 0) continue;
            try {
              const lsofOut = execSync(`lsof -p ${pid} -i TCP -P -n`, { encoding: 'utf8', timeout: 1000 });
              const matches = Array.from(lsofOut.matchAll(/127\.0\.0\.1:(\d+)\s+\(LISTEN\)/g));
              for (const m of matches) {
                const port = parseInt(m[1], 10);
                if (port && !candidatePorts.includes(port)) {
                  const tunnelUrl = await this.queryCloudflaredQuickTunnel(port);
                  if (tunnelUrl) {
                    const live = await this.isUrlLive(tunnelUrl);
                    if (live) {
                      this.setActiveTunnelUrl(tunnelUrl);
                      return tunnelUrl;
                    }
                  }
                }
              }
            } catch {}
          }
        }
      }
    } catch {}
    // Also check runtime state file (~/.cineva/tunnel.json or scratch/tunnel.json)
    try {
      const statePaths = [
        path.join(os.homedir(), '.cineva', 'tunnel.json'),
        path.resolve(process.cwd(), 'scratch', 'tunnel.json'),
        path.resolve(process.cwd(), 'tunnel.json'),
      ];
      for (const sp of statePaths) {
        if (fs.existsSync(sp)) {
          const raw = JSON.parse(fs.readFileSync(sp, 'utf8'));
          if (raw?.publicUrl) {
            const live = await this.isUrlLive(raw.publicUrl);
            if (live) {
              this.setActiveTunnelUrl(raw.publicUrl);
              return this.activeTunnelUrl;
            }
          }
        }
      }
    } catch {}

    return this.activeTunnelUrl;
  }

  /**
   * Auto-spawn cloudflared quick tunnel if no cloudflared process is running and binary is available.
   */
  public ensureCloudflaredRunning(localPort: number = CONFIG.PORT || 4000): void {
    if (this.cloudflaredChild && !this.cloudflaredChild.killed) {
      return;
    }
    try {
      const pids = execSync('pgrep -f cloudflared', { encoding: 'utf8', timeout: 1000 }).trim();
      if (pids) return; // Already running
    } catch {}

    let whichBin = '';
    try {
      whichBin = execSync('which cloudflared', { encoding: 'utf8', timeout: 1000 }).trim();
    } catch {
      logger.warn(`[TunnelService] cloudflared not found in PATH. Operating in local mode (http://localhost:${localPort}). Install via 'brew install cloudflared' to enable public tunnels.`);
      return;
    }

    // Check if trycloudflare.com resolves via current DNS
    dns.lookup('api.trycloudflare.com', (dnsErr) => {
      if (dnsErr) {
        logger.warn(`[TunnelService] DNS lookup for api.trycloudflare.com failed (${dnsErr.code || dnsErr.message}). Your ISP/router DNS might be blocking trycloudflare.com. If the tunnel fails to connect, consider manually configuring DNS (e.g. 'networksetup -setdnsservers Wi-Fi 1.1.1.1 8.8.8.8').`);
      }
    });

    try {
      const token = (process.env.CLOUDFLARE_TUNNEL_TOKEN || '').trim();
      const onChildError = (err: any) => {
        logger.warn('[TunnelService] cloudflared process error', { error: err?.message });
        if (this.cloudflaredChild === child) this.cloudflaredChild = null;
      };
      const onChildExit = () => {
        if (this.cloudflaredChild === child) this.cloudflaredChild = null;
      };

      let child: any;
      if (token) {
        logger.info('[TunnelService] Auto-spawning Cloudflare Named Tunnel process with token...', { bin: whichBin });
        child = spawn(whichBin, ['tunnel', 'run', '--token', token], {
          stdio: 'ignore',
        });
      } else {
        logger.info('[TunnelService] Auto-spawning Cloudflare Quick Tunnel process...', { bin: whichBin, localPort });
        child = spawn(whichBin, ['tunnel', '--url', `http://localhost:${localPort}`, '--metrics', '127.0.0.1:20241'], {
          stdio: 'ignore',
        });
      }
      child.on('error', onChildError);
      child.on('exit', onChildExit);
      this.cloudflaredChild = child;
    } catch (err: any) {
      logger.warn('[TunnelService] Failed to auto-spawn cloudflared', { error: err?.message });
    }
  }

  private queryCloudflaredQuickTunnel(port: number): Promise<string | null> {
    return new Promise((resolve) => {
      const req = http.get(
        {
          hostname: '127.0.0.1',
          port,
          path: '/quicktunnel',
          timeout: 400,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              if (res.statusCode === 200 && data) {
                const parsed = JSON.parse(data);
                if (parsed?.hostname) {
                  return resolve(`https://${parsed.hostname}`);
                }
              }
            } catch {}
            // Fallback: check /metrics if /quicktunnel was not JSON
            this.queryCloudflaredMetrics(port)
              .then(resolve)
              .catch(() => resolve(null));
          });
        }
      );

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  private queryCloudflaredMetrics(port: number): Promise<string | null> {
    return new Promise((resolve) => {
      const req = http.get(
        {
          hostname: '127.0.0.1',
          port,
          path: '/metrics',
          timeout: 400,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const match = data.match(/userHostname="(https?:\/\/[^"]+)"/);
              if (match && match[1]) {
                return resolve(match[1]);
              }
            } catch {}
            resolve(null);
          });
        }
      );

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  /**
   * Resolves the authoritative public URL with strict priority:
   * 1. Explicit CINEVA_PUBLIC_URL if configured
   * 2. Active Cloudflare quick-tunnel / public URL discovered or observed
   * 3. Incoming request Host if non-localhost
   * 4. Fallback to CONFIG.PUBLIC_URL or localhost
   */
  public async getAuthoritativePublicUrl(req?: { get: (name: string) => string | undefined; secure?: boolean; headers?: Record<string, any> }): Promise<string> {
    // 1. Explicit CINEVA_PUBLIC_URL or CLOUDFLARE_TUNNEL_DOMAIN from env
    const envPublic = (process.env.CINEVA_PUBLIC_URL || process.env.CLOUDFLARE_TUNNEL_DOMAIN || '').trim().replace(/\/+$/, '');
    if (
      envPublic &&
      !envPublic.includes('localhost') &&
      !envPublic.includes('127.0.0.1') &&
      !envPublic.includes('192.168.') &&
      !envPublic.includes('10.')
    ) {
      return envPublic.startsWith('http') ? envPublic : `https://${envPublic}`;
    }

    // 2. Incoming request if through public tunnel/domain
    if (req) {
      const host = req.get('host');
      const proto = (req.headers && req.headers['x-forwarded-proto']) || (req.secure ? 'https' : 'http');
      if (
        host &&
        !host.includes('localhost') &&
        !host.includes('127.0.0.1') &&
        !host.includes('192.168.') &&
        !host.includes('10.')
      ) {
        const incomingUrl = `${proto}://${host}`;
        this.setActiveTunnelUrl(incomingUrl);
        return incomingUrl;
      }
    }

    // 3. Active discovered tunnel URL
    if (this.activeTunnelUrl) {
      const isLive = await this.isUrlLive(this.activeTunnelUrl);
      if (isLive) {
        return this.activeTunnelUrl;
      }
      logger.warn('[TunnelService] Active public tunnel URL failed DNS lookup. Invalidating...', { deadUrl: this.activeTunnelUrl });
      this.activeTunnelUrl = null;
      this.restartCloudflared(CONFIG.PORT || 4000);
    }

    // Try quick discovery
    const discovered = await this.discoverCloudflaredTunnel();
    if (discovered) {
      return discovered;
    }

    // 4. Fallback: local development origin
    if (req) {
      const host = req.get('host');
      const proto = (req.headers && req.headers['x-forwarded-proto']) || (req.secure ? 'https' : 'http');
      if (host) {
        return `${proto}://${host}`;
      }
    }

    return (CONFIG as any).PUBLIC_URL || CONFIG.CLIENT_URL || 'http://localhost:5173';
  }

  /**
   * Start periodic background tunnel discovery.
   */
  public startDiscovery(intervalMs = 4000): void {
    this.ensureCloudflaredRunning(CONFIG.PORT || 4000);
    this.discoverCloudflaredTunnel().catch(() => {});
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(async () => {
      if (this.isChecking) return;
      this.isChecking = true;
      try {
        this.ensureCloudflaredRunning(CONFIG.PORT || 4000);
        await this.discoverCloudflaredTunnel();
      } finally {
        this.isChecking = false;
      }
    }, intervalMs);
    if (this.pollTimer.unref) {
      this.pollTimer.unref();
    }
  }

  public stopDiscovery(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public stop(): void {
    this.stopDiscovery();
    if (this.cloudflaredChild) {
      try {
        this.cloudflaredChild.kill('SIGTERM');
      } catch {}
      this.cloudflaredChild = null;
    }
  }
}

export const tunnelService = new TunnelService();
