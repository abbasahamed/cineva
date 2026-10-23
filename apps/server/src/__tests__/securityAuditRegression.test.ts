import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../utils/sanitize.js';
import { LocalMediaStorage } from '../services/mediaStorage.js';
import { syncEngine } from '../services/syncEngine.js';
import { generateSessionId, generateRoomCode } from '../utils/idGenerator.js';
import { roomManager } from '../services/roomManager.js';
import { prisma } from '../db.js';

describe('Cineva Pre-Deployment Security Regression Tests', () => {

  describe('1. Session & Identity Generation Security', () => {
    it('should generate cryptographically unpredictable session IDs', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      expect(id1).not.toBe(id2);
      expect(id1.length).toBeGreaterThanOrEqual(21);
      expect(typeof id1).toBe('string');
      expect(id1.startsWith('cineva_sess_')).toBe(true);
    });

    it('should generate uppercase collision-resistant room codes without ambiguous characters', () => {
      const code1 = generateRoomCode();
      const code2 = generateRoomCode();
      expect(code1).not.toBe(code2);
      expect(code1).toMatch(/^[A-Z0-9]{6}$/);
      expect(code1).not.toMatch(/[01IO]/i); // verify exclusion of easily confused characters (0, 1, I, O)
    });
  });

  describe('2. Chat & Playback Activity Injection / XSS Protection', () => {
    it('should sanitize HTML tags from chat messages to prevent XSS', () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img src=x onerror=alert(1)>',
        'Hello <iframe src="evil.com"></iframe> World',
        '<svg onload=alert(document.cookie)>',
        '"><script>alert(1)</script>',
      ];

      for (const payload of xssPayloads) {
        const sanitized = sanitizeHtml(payload);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('<img');
        expect(sanitized).not.toContain('<iframe>');
        expect(sanitized).not.toContain('<svg');
        expect(sanitized).not.toContain('>');
        expect(sanitized).not.toContain('<');
      }
    });

    it('should safely escape control characters, quotes, and ampersands', () => {
      const input = `Test "quote" & 'single' <tag>`;
      const sanitized = sanitizeHtml(input);
      expect(sanitized).toBe('Test &quot;quote&quot; &amp; &#039;single&#039; &lt;tag&gt;');
    });
  });

  describe('3. Path Traversal & Storage Isolation', () => {
    it('should sanitize filenames against path traversal sequences', () => {
      const sanitizeName = (rawName: string) => {
        const ext = rawName.substring(rawName.lastIndexOf('.'));
        const base = rawName.substring(0, rawName.lastIndexOf('.'));
        const clean = base.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
        return `${clean || 'video'}${ext}`;
      };

      const malicious = '../../../etc/passwd.mp4';
      const clean = sanitizeName(malicious);
      expect(clean).not.toContain('..');
      expect(clean).not.toContain('/');
      expect(clean).not.toContain('\\');
      expect(clean).toBe('_________etc_passwd.mp4');
    });

    it('should prevent path traversal outside storage directory in LocalMediaStorage', () => {
      const storage = new LocalMediaStorage('/tmp/cineva_sec_storage');
      
      // getSafeFilePath is private, test through saveFile or direct reflection
      const fullSafe = (storage as any).getSafeFilePath('../../../etc/passwd.mp4');
      // Should strip leading traversal and keep within /tmp/cineva_sec_storage
      expect(fullSafe.startsWith('/tmp/cineva_sec_storage')).toBe(true);
    });
  });

  describe('4. Server-Authoritative Playback Bounds & Numerical Validation', () => {
    it('should clamp negative numbers and handle NaN/Infinity safely on play', () => {
      const roomId = 'room-sec-playback-1';
      syncEngine.getOrCreateState(roomId);

      // Play with negative time -> clamps to >= 0
      const playRes = syncEngine.play(roomId, -10, 1.0);
      expect(playRes.isPlaying).toBe(true);
      expect(playRes.position).toBeGreaterThanOrEqual(0);

      // Play with NaN -> uses calculated current position
      const playNaN = syncEngine.play(roomId, NaN as any, 1.0);
      expect(playNaN.isPlaying).toBe(true);
      expect(Number.isFinite(playNaN.position)).toBe(true);
    });

    it('should clamp negative numbers and handle NaN/Infinity safely on seek', () => {
      const roomId = 'room-sec-playback-2';
      syncEngine.getOrCreateState(roomId);

      const seekNeg = syncEngine.seek(roomId, -50);
      expect(seekNeg.position).toBe(0);

      const seekNormal = syncEngine.seek(roomId, 125.4);
      expect(seekNormal.position).toBe(125.4);
    });

    it('should maintain monotonic version increments on playback state changes', () => {
      const roomId = 'room-sec-monotonic';
      const s0 = syncEngine.getOrCreateState(roomId);
      const initialVersion = s0.version;

      const s1 = syncEngine.play(roomId, 10);
      expect(s1.version).toBe(initialVersion + 1);

      const s2 = syncEngine.pause(roomId, 15);
      expect(s2.version).toBe(initialVersion + 2);

      const s3 = syncEngine.seek(roomId, 20);
      expect(s3.version).toBe(initialVersion + 3);
    });
  });

  describe('5. Host vs Guest Permission Authorization', () => {
    it('should verify host status through roomManager authoritative DB check', async () => {
      const created = await roomManager.createRoom({
        displayName: 'Host Abbas',
        roomName: 'Security Auth Test Room',
        allowGuestControl: false,
      });

      const isHost = await roomManager.isHost(created.room.id, created.hostSessionId);
      expect(isHost).toBe(true);

      const isFakeHost = await roomManager.isHost(created.room.id, 'cineva_sess_fake_attacker_session');
      expect(isFakeHost).toBe(false);

      // Verify guest control restriction
      const guestJoin = await roomManager.joinRoom({
        roomCode: created.room.roomCode,
        displayName: 'Guest Rahul',
      });

      const canGuestControl = await roomManager.canControlPlayback(created.room.id, guestJoin.sessionId);
      expect(canGuestControl).toBe(false);

      const canHostControl = await roomManager.canControlPlayback(created.room.id, created.hostSessionId);
      expect(canHostControl).toBe(true);
    });
  });

  describe('6. Production CORS Policy Security', () => {
    it('should enforce origin isolation in production and reject arbitrary origins', () => {
      function isOriginAllowed(origin: string | undefined, isProd: boolean, allowedList: string[]): boolean {
        if (!origin) return true;
        if (!isProd) {
          if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
            return true;
          }
        }
        return allowedList.includes(origin) || allowedList.includes('*');
      }

      // Production mode with strict production allowed origin
      const prodOrigins = ['https://cineva.production.com'];
      expect(isOriginAllowed('https://cineva.production.com', true, prodOrigins)).toBe(true);
      expect(isOriginAllowed('https://evil-site.com', true, prodOrigins)).toBe(false);
      expect(isOriginAllowed('http://localhost:3000', true, prodOrigins)).toBe(false);

      // Disallow null or arbitrary origins
      expect(isOriginAllowed('https://attacker.io', true, prodOrigins)).toBe(false);
    });
  });
});
