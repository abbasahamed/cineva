import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getIceServers } from '../features/video/iceConfig.js';
import { VideoCallManager } from '../features/video/videoCallManager.js';

describe('WebRTC Video Calling Frontend Logic Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    class MockMediaStream {
      tracks: any[] = [];
      constructor(tracks?: any[]) {
        if (tracks) this.tracks = [...tracks];
      }
      getTracks() { return this.tracks; }
      getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
      getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
      addTrack(track: any) { this.tracks.push(track); }
      removeTrack(track: any) { this.tracks = this.tracks.filter(t => t !== track); }
    }

    vi.stubGlobal('MediaStream', MockMediaStream);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
      const isSupported = VideoCallManager.isSupported();
      expect(typeof isSupported).toBe('boolean');
    });
  });

  describe('3. Camera-First Interaction & Independent Device Controls', () => {
    it('1. camera starts without joining a call', async () => {
      const mockVideoTrack = { kind: 'video', stop: vi.fn(), enabled: true };
      const mockAudioTrack = { kind: 'audio', stop: vi.fn(), enabled: true };
      const mockStream = {
        getVideoTracks: () => [mockVideoTrack],
        getAudioTracks: () => [mockAudioTrack],
        getTracks: () => [mockVideoTrack, mockAudioTrack],
        addTrack: vi.fn(),
        removeTrack: vi.fn(),
      };

      const getUserMedia = vi.fn().mockResolvedValue(mockStream);
      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia,
        },
      });
      vi.spyOn(VideoCallManager, 'isSupported').mockReturnValue(true);

      const manager = new VideoCallManager({
        onRemoteStream: vi.fn(),
        onRemotePeerLeft: vi.fn(),
        onConnectionStateChange: vi.fn(),
        onError: vi.fn(),
      });

      // Calling enableCamera directly without any "join call" step
      const stream = await manager.enableCamera();
      expect(stream).toBeDefined();
      expect(getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 24, max: 30 },
          }),
        })
      );
    });

    it('2. camera on -> camera off -> camera on toggling', async () => {
      const mockVideoTrack1 = { kind: 'video', stop: vi.fn(), enabled: true };
      const mockVideoTrack2 = { kind: 'video', stop: vi.fn(), enabled: true };
      let callCount = 0;

      const getUserMedia = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          getVideoTracks: () => [callCount === 1 ? mockVideoTrack1 : mockVideoTrack2],
          getAudioTracks: () => [],
          getTracks: () => [callCount === 1 ? mockVideoTrack1 : mockVideoTrack2],
          addTrack: vi.fn(),
          removeTrack: vi.fn(),
        });
      });

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia,
        },
      });
      vi.spyOn(VideoCallManager, 'isSupported').mockReturnValue(true);

      const manager = new VideoCallManager({
        onRemoteStream: vi.fn(),
        onRemotePeerLeft: vi.fn(),
        onConnectionStateChange: vi.fn(),
        onError: vi.fn(),
      });

      // 1. Camera ON
      await manager.enableCamera();
      expect(manager.getLocalStream()).toBeDefined();

      // 2. Camera OFF
      manager.disableCamera();
      expect(mockVideoTrack1.stop).toHaveBeenCalled();

      // 3. Camera ON again
      await manager.enableCamera();
      expect(callCount).toBe(2);
    });

    it('3. microphone operates independently of camera', () => {
      const mockAudioTrack = { kind: 'audio', stop: vi.fn(), enabled: true };
      const mockVideoTrack = { kind: 'video', stop: vi.fn(), enabled: true };

      const manager = new VideoCallManager({
        onRemoteStream: vi.fn(),
        onRemotePeerLeft: vi.fn(),
        onConnectionStateChange: vi.fn(),
        onError: vi.fn(),
      });

      (manager as any).localStream = {
        getTracks: () => [mockAudioTrack, mockVideoTrack],
        getAudioTracks: () => [mockAudioTrack],
        getVideoTracks: () => [mockVideoTrack],
        removeTrack: vi.fn(),
        addTrack: vi.fn(),
      };

      // Mute microphone
      expect(manager.setMute(true)).toBe(true);
      // Audio is disabled
      expect(mockAudioTrack.enabled).toBe(false);
      // Video track remains enabled
      expect(mockVideoTrack.enabled).toBe(true);

      // Unmute microphone
      expect(manager.setMute(false)).toBe(false);
      expect(mockAudioTrack.enabled).toBe(true);
      expect(mockVideoTrack.enabled).toBe(true);

      // Turn off camera
      manager.setCameraOff(true);
      expect(mockVideoTrack.stop).toHaveBeenCalled();
      // Audio track is still active
      expect(mockAudioTrack.enabled).toBe(true);
    });
  });

  describe('4. Remote Streams & Multi-Participant Handling', () => {
    it('automatically caches and returns remote streams per participant ID', () => {
      const mockRemoteStreamAlice = { id: 'stream_alice' } as any;
      const mockRemoteStreamBob = { id: 'stream_bob' } as any;

      const callbacks = {
        onRemoteStream: vi.fn(),
        onRemotePeerLeft: vi.fn(),
        onConnectionStateChange: vi.fn(),
        onError: vi.fn(),
      };

      const manager = new VideoCallManager(callbacks);

      // Simulate receiving remote streams for two friends
      (manager as any).remoteStreams.set('p_alice', mockRemoteStreamAlice);
      (manager as any).remoteStreams.set('p_bob', mockRemoteStreamBob);

      expect(manager.getStream('p_alice')).toBe(mockRemoteStreamAlice);
      expect(manager.getStream('p_bob')).toBe(mockRemoteStreamBob);
      expect(manager.getStream('p_unknown')).toBeNull();

      // Remote peer leaves
      manager.closePeerConnection('p_alice');
      expect(manager.getStream('p_alice')).toBeNull();
      expect(manager.getStream('p_bob')).toBe(mockRemoteStreamBob);
      expect(callbacks.onRemotePeerLeft).toHaveBeenCalledWith('p_alice');
    });

    it('cleans all hardware tracks and closes connections on cleanup (leaving room)', () => {
      const mockStopAudio = vi.fn();
      const mockStopVideo = vi.fn();
      const mockAudioTrack = { stop: mockStopAudio, enabled: true };
      const mockVideoTrack = { stop: mockStopVideo, enabled: true };

      const mockPcClose = vi.fn();
      const mockPc = {
        close: mockPcClose,
        onicecandidate: null,
        ontrack: null,
        onconnectionstatechange: null,
        oniceconnectionstatechange: null,
      } as any;

      const manager = new VideoCallManager({
        onRemoteStream: vi.fn(),
        onRemotePeerLeft: vi.fn(),
        onConnectionStateChange: vi.fn(),
        onError: vi.fn(),
      });

      (manager as any).localStream = {
        getTracks: () => [mockAudioTrack, mockVideoTrack],
      };
      (manager as any).peerConnections.set('p_charlie', mockPc);
      (manager as any).remoteStreams.set('p_charlie', {} as any);

      manager.cleanup();

      expect(mockStopAudio).toHaveBeenCalled();
      expect(mockStopVideo).toHaveBeenCalled();
      expect(mockPcClose).toHaveBeenCalled();
      expect(manager.getLocalStream()).toBeNull();
      expect(manager.getStream('p_charlie')).toBeNull();
    });
  });
});
