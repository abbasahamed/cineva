/**
 * WebRTC ICE Server Configuration
 * Loads production STUN / TURN configurations from environment variables
 * or defaults to reliable public STUN servers for local development.
 */
export function getIceServers(): RTCIceServer[] {
  const envIce = import.meta.env.VITE_WEBRTC_ICE_SERVERS as string | undefined;

  if (envIce) {
    try {
      const parsed = JSON.parse(envIce);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      const urls = envIce.split(',').map((u) => u.trim()).filter(Boolean);
      if (urls.length > 0) {
        return [{ urls }];
      }
    }
  }

  // Development defaults: Standard public Google STUN servers
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];
}
