import { getPublicUrl } from '../services/api.js';

export interface PublicBaseUrlOptions {
  allowFetch?: boolean;
  forceRefresh?: boolean;
  maxWaitMs?: number;
  allowLocalFallback?: boolean;
}

export interface InviteUrlOptions extends PublicBaseUrlOptions {
  route?: 'room' | 'join';
  baseUrl?: string;
  skipFetch?: boolean;
}

let memoryCachedBaseUrl: string | null = null;

export function _clearInviteCacheForTesting(): void {
  memoryCachedBaseUrl = null;
}

export function _setCachedBaseUrlForTesting(url: string | null): void {
  memoryCachedBaseUrl = url;
}

export function getEnvConfiguredPublicUrl(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (import.meta.env.VITE_APP_URL) return String(import.meta.env.VITE_APP_URL).trim();
    if (import.meta.env.VITE_PUBLIC_URL) return String(import.meta.env.VITE_PUBLIC_URL).trim();
  }
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.VITE_APP_URL) return String(process.env.VITE_APP_URL).trim();
    if (process.env.VITE_PUBLIC_URL) return String(process.env.VITE_PUBLIC_URL).trim();
  }
  return '';
}

export function isProductionEnvironment(): boolean {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (typeof import.meta.env.PROD === 'boolean') return import.meta.env.PROD;
    if (import.meta.env.MODE === 'production') return true;
  }
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NODE_ENV === 'production') return true;
  }
  return false;
}

/**
 * Checks whether a given URL string or hostname points to a private development address.
 * Matches localhost, 127.0.0.1, 0.0.0.0, ::1, local networks (192.168.*, 10.*, 172.16-31.*),
 * and .local / .internal domains.
 */
export function isPrivateAddress(urlOrHost: string | null | undefined): boolean {
  if (!urlOrHost) return true;
  try {
    const raw = urlOrHost.trim();
    const hostname = raw.includes('://') ? new URL(raw).hostname : raw.split(':')[0];
    if (!hostname) return true;
    const lower = hostname.toLowerCase();
    const cleanHost = lower.replace(/^\[|\]$/g, '');
    if (cleanHost === 'localhost' || cleanHost === '127.0.0.1' || cleanHost === '0.0.0.0' || cleanHost === '::1') return true;
    if (cleanHost.endsWith('.local') || cleanHost.endsWith('.internal')) return true;
    if (cleanHost.startsWith('192.168.') || cleanHost.startsWith('10.')) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanHost)) return true;
    return false;
  } catch {
    return true;
  }
}

/**
 * Normalizes a base URL by trimming whitespace, removing trailing slashes,
 * and ensuring an http/https protocol.
 */
export function normalizeBaseUrl(rawUrl: string): string {
  let cleaned = rawUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }
  return cleaned;
}

/**
 * Resolves the public base URL for room invitations following strict priority:
 * 1. An explicitly configured, validated production URL from VITE_APP_URL / VITE_PUBLIC_URL.
 * 2. The actual public HTTPS URL returned by the backend's /api/system/public-url endpoint
 *    when a tunnel is active (with async resolution to avoid racing tunnel discovery).
 * 3. The current browser origin only when it is already a valid public production domain.
 *
 * NEVER silently falls back to localhost or a private IP address for shareable invitations.
 * If no public URL exists, throws an informative error explaining the deployment requirement.
 */
export async function getPublicBaseUrl(options?: PublicBaseUrlOptions): Promise<string> {
  const allowFetch = options?.allowFetch !== false;
  const forceRefresh = options?.forceRefresh === true;

  // 1. Priority 1: Configured environment variable (VITE_APP_URL or VITE_PUBLIC_URL)
  const envUrl = getEnvConfiguredPublicUrl();
  if (envUrl && !isPrivateAddress(envUrl)) {
    return normalizeBaseUrl(envUrl);
  }

  // 2. Check in-memory cache if verified non-private and not force-refreshed
  if (!forceRefresh && memoryCachedBaseUrl && !isPrivateAddress(memoryCachedBaseUrl)) {
    return memoryCachedBaseUrl;
  }

  // 3. Priority 2: Query backend for active public tunnel URL (/api/system/public-url)
  if (allowFetch) {
    const maxWait = options?.maxWaitMs ?? 2000;
    const interval = 400;
    const startTime = Date.now();

    while (Date.now() - startTime <= maxWait) {
      try {
        const serverPubUrl = await getPublicUrl();
        if (serverPubUrl && !isPrivateAddress(serverPubUrl)) {
          memoryCachedBaseUrl = normalizeBaseUrl(serverPubUrl);
          return memoryCachedBaseUrl;
        }
      } catch {
        // Backend temporarily unavailable
      }

      if (maxWait <= 0 || Date.now() - startTime >= maxWait) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(interval, maxWait)));
    }
  }

  // 4. Priority 3: Browser window location origin ONLY when it is a valid public domain
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    if (!isPrivateAddress(window.location.origin)) {
      memoryCachedBaseUrl = normalizeBaseUrl(window.location.origin);
      return memoryCachedBaseUrl;
    }
  }

  // 5. Explicit opt-in local fallback (offline developer testing only)
  if (options?.allowLocalFallback) {
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    return origin ? normalizeBaseUrl(origin) : 'http://localhost:5173';
  }

  // 6. No public URL exists: Never silently fall back to localhost!
  throw new Error(
    "No public invitation URL available. CINEVA requires a deployed domain (VITE_APP_URL) or an active public tunnel ('npm run start:share') to generate shareable invitations."
  );
}

/**
 * Synchronous version of getPublicBaseUrl for immediate render states.
 * Uses env vars, verified cached public tunnel, or public window origin.
 * Throws if no public domain is known unless allowLocalFallback is explicitly true.
 */
export function getPublicBaseUrlSync(options?: { allowLocalFallback?: boolean }): string {
  // 1. Configured environment variable
  const envUrl = getEnvConfiguredPublicUrl();
  if (envUrl && !isPrivateAddress(envUrl)) {
    return normalizeBaseUrl(envUrl);
  }

  // 2. Verified cached non-private URL
  if (memoryCachedBaseUrl && !isPrivateAddress(memoryCachedBaseUrl)) {
    return memoryCachedBaseUrl;
  }

  // 3. Public browser origin
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    if (!isPrivateAddress(window.location.origin)) {
      return normalizeBaseUrl(window.location.origin);
    }
  }

  if (options?.allowLocalFallback) {
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    return origin ? normalizeBaseUrl(origin) : 'http://localhost:5173';
  }

  throw new Error(
    "No public invitation URL available. CINEVA requires a deployed domain (VITE_APP_URL) or an active public tunnel ('npm run start:share') to generate shareable invitations."
  );
}

/**
 * Pre-warms the cached public base URL in the background.
 */
export function prefetchPublicBaseUrl(): void {
  getPublicBaseUrl().catch(() => {});
}

/**
 * Generates the centralized, authoritative public room invitation URL.
 * Preserves room code / room ID and route structure.
 * Default route is 'room' (e.g. https://domain.com/room/CODE) or 'join' (https://domain.com/join/CODE).
 */
export async function getRoomInviteUrl(
  roomCode: string,
  options?: InviteUrlOptions
): Promise<string> {
  const trimmedCode = (roomCode || '').trim();
  if (!trimmedCode) {
    throw new Error('Room code is required to generate an invitation URL.');
  }

  const baseUrl = options?.baseUrl
    ? normalizeBaseUrl(options.baseUrl)
    : await getPublicBaseUrl({
        allowFetch: !options?.skipFetch,
        forceRefresh: options?.forceRefresh,
        maxWaitMs: options?.maxWaitMs,
        allowLocalFallback: options?.allowLocalFallback,
      });

  const route = options?.route || 'room';
  return `${baseUrl}/${route}/${trimmedCode}`;
}

/**
 * Synchronous helper to construct an invitation URL if base URL is already known.
 */
export function getRoomInviteUrlSync(
  roomCode: string,
  options?: InviteUrlOptions
): string {
  const trimmedCode = (roomCode || '').trim();
  if (!trimmedCode) {
    throw new Error('Room code is required to generate an invitation URL.');
  }

  const baseUrl = options?.baseUrl
    ? normalizeBaseUrl(options.baseUrl)
    : getPublicBaseUrlSync({ allowLocalFallback: options?.allowLocalFallback });

  const route = options?.route || 'room';
  return `${baseUrl}/${route}/${trimmedCode}`;
}

/**
 * Constructs the WhatsApp sharing URL using https://wa.me/?text=ENCODED_MESSAGE.
 * The message: "Join my CINEVA watch room! Watch together in sync: [PUBLIC_ROOM_URL]"
 * Throws if the invite URL is a private or localhost address.
 */
export function getWhatsAppShareUrl(
  inviteUrl: string,
  customMessage?: string
): string {
  if (isPrivateAddress(inviteUrl)) {
    throw new Error('Cannot create WhatsApp share link with a private development or localhost address.');
  }
  const message = customMessage || `Join my CINEVA watch room! Open this link to join: ${inviteUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * Safely opens WhatsApp share dialog in a new tab with noopener, noreferrer.
 * Validates that the invitation link is a legitimate public URL.
 */
export function shareOnWhatsApp(
  inviteUrl: string,
  customMessage?: string
): Window | null {
  const waUrl = getWhatsAppShareUrl(inviteUrl, customMessage);
  if (typeof window !== 'undefined') {
    return window.open(waUrl, '_blank', 'noopener,noreferrer');
  }
  return null;
}

/**
 * Cross-browser clipboard copy with fallback to execCommand('copy').
 * Returns true if copied successfully, false on error.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch {
      return false;
    }
  }

  return false;
}
