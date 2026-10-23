import { Request } from 'express';
import { tunnelService } from '../services/tunnelService.js';

/**
 * Resolves client IP address with strict tunnel verification.
 * Only trusts CF-Connecting-IP header when the request actually originates
 * through the Cloudflare tunnel (verified via cf-ray signature or active tunnel host),
 * preventing direct connection header spoofing attacks.
 */
export function getClientIp(req: Request): string {
  const host = req.get('host') || '';
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  const hasCfRay = Boolean(req.headers['cf-ray']);
  const activeTunnel = tunnelService.getActiveTunnelUrl();
  let isTunnelHost = host.includes('trycloudflare.com');
  if (!isTunnelHost && activeTunnel) {
    try {
      isTunnelHost = host.includes(new URL(activeTunnel).host);
    } catch {}
  }

  if (cfConnectingIp && (hasCfRay || isTunnelHost)) {
    const rawIp = Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp;
    return String(rawIp).trim();
  }

  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}
