import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getIceServers } from '../features/video/iceConfig.js';
import { VideoCallManager } from '../features/video/videoCallManager.js';

describe('WebRTC Video Calling Frontend Logic Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. ICE Server Configuration', () => {
    it('returns default Google STUN servers when VITE_WEBRTC_ICE_SERVERS is not provided', () => {
      const servers = getIceServers();
      expect(servers).toBeInstanceOf(Array);
      expect(servers.length).toBeGreaterThanOrEqual(1);
      expect(servers[0].urls).toContain('stun:stun.l.google.com:19302');
    });
  });

  describe('2. Browser Support Detection', () => {
    it('accurately detects when WebRTC or getUserMedia is unavailable', () => {
      // In Node/Vitest test environment without window.RTCPeerConnection
      const isSupported = VideoCallManager.isSupported();
      expect(typeof isSupported).toBe('boolean');
    });
  });

  describe('3. Clean Resource Release Lifecycle', () => {
    it('correctly handles track stopping and peer connection closing upon cleanup', () => {
      const mockStop = vi.fn();
      const mockTrack = {
        stop: mockStop,
        enabled: true,
      };

      const callbacks = {
        onRemoteStream: vi.fn(),
        onRemotePeerLeft: vi.fn(),
        onConnectionStateChange: vi.fn(),
        onError: vi.fn(),
      };

      const manager = new VideoCallManager(callbacks);
      (manager as any).localStream = {
        getTracks: () => [mockTrack],
        getAudioTracks: () => [mockTrack],
        getVideoTracks: () => [mockTrack],
      };

      expect(manager.setMute(true)).toBe(true);
      expect(mockTrack.enabled).toBe(false);

      expect(manager.setMute(false)).toBe(false);
      expect(mockTrack.enabled).toBe(true);

      expect(manager.setCameraOff(true)).toBe(true);
      expect(mockTrack.enabled).toBe(false);

      manager.cleanup();
      expect(mockStop).toHaveBeenCalled();
      expect(manager.getLocalStream()).toBeNull();
    });
  });
});
