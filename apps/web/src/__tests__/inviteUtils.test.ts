// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isPrivateAddress,
  normalizeBaseUrl,
  getRoomInviteUrl,
  getRoomInviteUrlSync,
  getWhatsAppShareUrl,
  shareOnWhatsApp,
  copyToClipboard,
  _clearInviteCacheForTesting,
} from '../utils/inviteUtils.js';
import * as api from '../services/api.js';

describe('inviteUtils unit & regression tests', () => {
  beforeEach(() => {
    _clearInviteCacheForTesting();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    _clearInviteCacheForTesting();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('isPrivateAddress', () => {
    it('detects localhost and loopback variations', () => {
      expect(isPrivateAddress('localhost')).toBe(true);
      expect(isPrivateAddress('http://localhost:5173')).toBe(true);
      expect(isPrivateAddress('http://127.0.0.1:4000')).toBe(true);
      expect(isPrivateAddress('http://0.0.0.0:8080')).toBe(true);
      expect(isPrivateAddress('http://[::1]:5173')).toBe(true);
    });

    it('detects private network subnets', () => {
      expect(isPrivateAddress('http://192.168.1.50:5173')).toBe(true);
      expect(isPrivateAddress('http://10.0.0.1')).toBe(true);
      expect(isPrivateAddress('http://172.16.0.1')).toBe(true);
      expect(isPrivateAddress('http://172.24.5.1')).toBe(true);
      expect(isPrivateAddress('http://172.31.255.255')).toBe(true);
    });

    it('detects .local and .internal hostnames', () => {
      expect(isPrivateAddress('http://my-mac.local:3000')).toBe(true);
      expect(isPrivateAddress('http://app.internal')).toBe(true);
    });

    it('allows valid public domains and Cloudflare tunnels', () => {
      expect(isPrivateAddress('https://cineva.vercel.app')).toBe(false);
      expect(isPrivateAddress('https://patients-tuesday-tomorrow-whereas.trycloudflare.com')).toBe(false);
      expect(isPrivateAddress('https://watch.cineva.io')).toBe(false);
    });
  });

  describe('normalizeBaseUrl', () => {
    it('strips trailing slashes and ensures https scheme', () => {
      expect(normalizeBaseUrl('https://cineva.app///')).toBe('https://cineva.app');
      expect(normalizeBaseUrl('cineva.vercel.app')).toBe('https://cineva.vercel.app');
      expect(normalizeBaseUrl('http://localhost:5173/')).toBe('http://localhost:5173');
    });
  });

  describe('Bug Regression: Browser on localhost + Backend provides public tunnel', () => {
    it('reproduces bug fix: copied room invite uses the public tunnel URL instead of localhost', async () => {
      // Simulate browser running on localhost:5173
      vi.stubEnv('VITE_APP_URL', '');
      vi.stubEnv('VITE_PUBLIC_URL', '');

      // Backend provides live Cloudflare quick-tunnel URL
      const publicTunnelUrl = 'https://patients-tuesday-tomorrow-whereas.trycloudflare.com';
      vi.spyOn(api, 'getPublicUrl').mockResolvedValue(publicTunnelUrl);

      // Act
      const inviteUrl = await getRoomInviteUrl('ERTEHP');

      // Assert: Must be the public tunnel URL, NOT localhost
      expect(inviteUrl).toBe('https://patients-tuesday-tomorrow-whereas.trycloudflare.com/room/ERTEHP');
      expect(inviteUrl).not.toContain('localhost');
      expect(inviteUrl).not.toContain('127.0.0.1');

      // WhatsApp share URL must also use the public tunnel URL
      const waUrl = getWhatsAppShareUrl(inviteUrl);
      expect(waUrl).toContain('https%3A%2F%2Fpatients-tuesday-tomorrow-whereas.trycloudflare.com%2Froom%2FERTEHP');
      expect(waUrl).not.toContain('localhost');
    });

    it('reproduces bug fix: throws clear error if running on localhost with no public tunnel or domain, refusing silent localhost fallback', async () => {
      vi.stubEnv('VITE_APP_URL', '');
      vi.stubEnv('VITE_PUBLIC_URL', '');
      vi.spyOn(api, 'getPublicUrl').mockResolvedValue(null);

      // Must throw an error instead of returning localhost
      await expect(getRoomInviteUrl('FY8VFA', { maxWaitMs: 0 })).rejects.toThrow(
        /No public invitation URL available/
      );
    });

    it('WhatsApp share URL throws error if an attempt is made to share a localhost or private address', () => {
      expect(() => getWhatsAppShareUrl('http://localhost:5173/room/FY8VFA')).toThrow(
        /Cannot create WhatsApp share link with a private development or localhost address/
      );
      expect(() => getWhatsAppShareUrl('http://192.168.1.15:4000/room/FY8VFA')).toThrow(
        /Cannot create WhatsApp share link with a private development or localhost address/
      );
    });
  });

  describe('Public URL priority hierarchy', () => {
    it('Priority 1: Configured VITE_APP_URL takes precedence over backend tunnel', async () => {
      vi.stubEnv('VITE_APP_URL', 'https://cineva.vercel.app');
      vi.spyOn(api, 'getPublicUrl').mockResolvedValue('https://some-tunnel.trycloudflare.com');

      const url = await getRoomInviteUrl('ABC123');
      expect(url).toBe('https://cineva.vercel.app/room/ABC123');
    });

    it('Priority 2: Live backend tunnel URL used when VITE_APP_URL is not set', async () => {
      vi.stubEnv('VITE_APP_URL', '');
      vi.spyOn(api, 'getPublicUrl').mockResolvedValue('https://active-tunnel.trycloudflare.com');

      const url = await getRoomInviteUrl('XYZ999');
      expect(url).toBe('https://active-tunnel.trycloudflare.com/room/XYZ999');
    });

    it('Priority 3: Browser window.location.origin used when already running on a public production domain', async () => {
      vi.stubEnv('VITE_APP_URL', '');
      vi.spyOn(api, 'getPublicUrl').mockResolvedValue(null);

      delete (window as any).location;
      window.location = new URL('https://cineva-prod.fly.dev/room/ABC') as any;

      const url = await getRoomInviteUrl('FLY123', { maxWaitMs: 0 });
      expect(url).toBe('https://cineva-prod.fly.dev/room/FLY123');
    });

    it('supports custom route option (join vs room)', async () => {
      vi.stubEnv('VITE_APP_URL', 'https://cineva.app');

      const joinUrl = await getRoomInviteUrl('ABC123', { route: 'join' });
      expect(joinUrl).toBe('https://cineva.app/join/ABC123');

      const roomUrl = await getRoomInviteUrl('ABC123', { route: 'room' });
      expect(roomUrl).toBe('https://cineva.app/room/ABC123');
    });

    it('preserves room codes with dashes or special characters', async () => {
      vi.stubEnv('VITE_APP_URL', 'https://cineva.app');

      const url = await getRoomInviteUrl('CN-8892');
      expect(url).toBe('https://cineva.app/room/CN-8892');
    });

    it('allows explicit local fallback only when allowLocalFallback option is true', async () => {
      vi.stubEnv('VITE_APP_URL', '');
      vi.spyOn(api, 'getPublicUrl').mockResolvedValue(null);

      delete (window as any).location;
      window.location = new URL('http://localhost:5173') as any;

      const url = await getRoomInviteUrl('DEV123', { allowLocalFallback: true, maxWaitMs: 0 });
      expect(url).toBe('http://localhost:5173/room/DEV123');
    });

    it('throws error if roomCode is missing or empty', async () => {
      await expect(getRoomInviteUrl('')).rejects.toThrow(/Room code is required/);
    });
  });

  describe('getWhatsAppShareUrl & shareOnWhatsApp', () => {
    it('constructs wa.me URL with correctly encoded message containing invite link', () => {
      const inviteUrl = 'https://cineva.vercel.app/room/CN-8892';
      const waUrl = getWhatsAppShareUrl(inviteUrl);

      expect(waUrl.startsWith('https://wa.me/?text=')).toBe(true);
      const encodedMsg = waUrl.replace('https://wa.me/?text=', '');
      const decodedMsg = decodeURIComponent(encodedMsg);

      expect(decodedMsg).toContain('Join my CINEVA watch room! Open this link to join:');
      expect(decodedMsg).toContain('https://cineva.vercel.app/room/CN-8892');
    });

    it('supports custom message in WhatsApp URL generation', () => {
      const inviteUrl = 'https://cineva.app/room/ABC';
      const waUrl = getWhatsAppShareUrl(inviteUrl, `Movie time: ${inviteUrl}`);

      const decodedMsg = decodeURIComponent(waUrl.replace('https://wa.me/?text=', ''));
      expect(decodedMsg).toBe('Movie time: https://cineva.app/room/ABC');
    });

    it('shareOnWhatsApp opens URL in new window with security parameters', () => {
      const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as any);

      shareOnWhatsApp('https://cineva.vercel.app/room/ABC123');

      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining('https://wa.me/?text='),
        '_blank',
        'noopener,noreferrer'
      );
    });
  });

  describe('copyToClipboard', () => {
    it('uses navigator.clipboard.writeText when available and returns true', async () => {
      const writeTextSpy = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextSpy },
      });

      const success = await copyToClipboard('https://cineva.vercel.app/room/TEST');
      expect(success).toBe(true);
      expect(writeTextSpy).toHaveBeenCalledWith('https://cineva.vercel.app/room/TEST');
    });

    it('falls back to execCommand if navigator.clipboard throws', async () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
        },
      });

      const execSpy = vi.fn().mockReturnValue(true);
      (document as any).execCommand = execSpy;

      const success = await copyToClipboard('https://cineva.vercel.app/room/TEST');
      expect(success).toBe(true);
      expect(execSpy).toHaveBeenCalledWith('copy');
    });

    it('returns false when text is empty', async () => {
      const success = await copyToClipboard('');
      expect(success).toBe(false);
    });
  });
});
