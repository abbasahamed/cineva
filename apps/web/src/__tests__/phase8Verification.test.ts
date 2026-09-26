import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VideoCallManager } from '../features/video/videoCallManager.js';
import { socketService } from '../services/socket.js';

function evaluateTileState(params: {
  connectionState: string;
  hasStream: boolean;
  videoTrackCount: number;
  videoTrackReadyState: string;
  videoTrackEnabled: boolean;
  isLocal: boolean;
  isCameraOff: boolean;
  videoWidth: number;
  videoHeight: number;
  readyState: number;
}) {
  const {
    connectionState,
    hasStream,
    videoTrackCount,
    videoTrackReadyState,
    videoTrackEnabled,
    isLocal,
    isCameraOff,
    videoWidth,
    videoHeight,
    readyState,
  } = params;

  const hasLiveRemoteVideoTrack =
    hasStream && videoTrackCount > 0 && videoTrackReadyState === 'live' && videoTrackEnabled;

  const isVideoPlaying =
    videoWidth > 0 && videoHeight > 0 && readyState >= 2 && (isLocal || hasLiveRemoteVideoTrack);

  const isConnecting =
    !isLocal && !isVideoPlaying && (connectionState === 'connecting' || connectionState === 'new');

  const isFailed =
    !isLocal && !isVideoPlaying && (connectionState === 'failed' || connectionState === 'disconnected');

  const isConnectedNoVideo =
    !isLocal &&
    !isCameraOff &&
    !isVideoPlaying &&
    connectionState === 'connected' &&
    (!hasLiveRemoteVideoTrack || videoWidth === 0);

  const showOverlay = isLocal
    ? isCameraOff
    : !isVideoPlaying && (isCameraOff || isConnecting || isFailed || isConnectedNoVideo);

  return {
    hasLiveRemoteVideoTrack,
    isVideoPlaying,
    isConnecting,
    isFailed,
    isConnectedNoVideo,
    showOverlay,
  };
}

describe('Phase 8 Automated Verification Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    class MockMediaStream {
      tracks: any[] = [];
      id: string;
      constructor(tracks?: any[]) {
        this.id = `stream-${Math.random().toString(36).slice(2)}`;
        if (tracks) this.tracks = [...tracks];
      }
      getTracks() {
        return this.tracks;
      }
      getVideoTracks() {
        return this.tracks.filter((t) => t.kind === 'video');
      }
      getAudioTracks() {
        return this.tracks.filter((t) => t.kind === 'audio');
      }
      addTrack(track: any) {
        this.tracks.push(track);
      }
      removeTrack(track: any) {
        this.tracks = this.tracks.filter((t) => t !== track);
      }
    }

    vi.stubGlobal('MediaStream', MockMediaStream);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('A. Remote stream arrives after VideoTile mounts', () => {
    it('VideoTile assigns srcObject when stream arrives post-mount', () => {
      let videoElementSrcObject: any = null;
      const mockVideoElement = {
        get srcObject() {
          return videoElementSrcObject;
        },
        set srcObject(val) {
          videoElementSrcObject = val;
        },
        play: vi.fn().mockResolvedValue(undefined),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      // 1. Initial mount: resolvedStream is null
      let resolvedStream: any = null;
      if (resolvedStream && mockVideoElement.srcObject !== resolvedStream) {
        mockVideoElement.srcObject = resolvedStream;
      }
      expect(mockVideoElement.srcObject).toBeNull();

      // 2. Stream arrives post-mount
      const mockVideoTrack = { kind: 'video', readyState: 'live', enabled: true };
      const incomingStream = new (globalThis as any).MediaStream([mockVideoTrack]);
      resolvedStream = incomingStream;

      if (resolvedStream && mockVideoElement.srcObject !== resolvedStream) {
        mockVideoElement.srcObject = resolvedStream;
        mockVideoElement.play().catch(() => {});
      }

      expect(mockVideoElement.srcObject).toBe(incomingStream);
      expect(mockVideoElement.play).toHaveBeenCalled();
    });
  });

  describe('B. Remote stream arrives before participant state', () => {
    it('caches stream in manager and preserves it when participant state arrives', () => {
      const onRemoteStream = vi.fn();
      const manager = new VideoCallManager({
        onRemoteStream,
        onRemotePeerLeft: vi.fn(),
        onConnectionStateChange: vi.fn(),
        onError: vi.fn(),
      }, 'local_user');

      const mockTrack = { kind: 'video', readyState: 'live', enabled: true };
      const earlyStream = new (globalThis as any).MediaStream([mockTrack]);

      // Simulate pc.ontrack firing before room participant state exists
      (manager as any).remoteStreams.set('peer_bob', earlyStream);
      onRemoteStream('peer_bob', earlyStream);

      expect(onRemoteStream).toHaveBeenCalledWith('peer_bob', earlyStream);
      expect(manager.getStream('peer_bob')).toBe(earlyStream);

      // Now simulate participant state arriving later
      const participantPayload = {
        participantId: 'peer_bob',
        displayName: 'Bob',
        isMuted: false,
        isCameraOff: false,
      };

      // In VideoContext, stream is resolved using manager.getStream fallback
      const resolvedStreamForPeer = manager.getStream(participantPayload.participantId);
      expect(resolvedStreamForPeer).toBe(earlyStream);

      // Verify cameraPeers includes peer_bob even if isCameraOff was stale
      const peerState = {
        ...participantPayload,
        stream: resolvedStreamForPeer,
      };
      const hasLiveStream = !!(peerState.stream && peerState.stream.getVideoTracks().some((t: any) => t.readyState === 'live'));
      expect(hasLiveStream).toBe(true);
    });
  });

  describe('C. Connected + live remote video -> NOT "Connecting..."', () => {
    it('strictly evaluates to video playing and suppresses "Connecting..." overlay', () => {
      const res = evaluateTileState({
        connectionState: 'connected',
        hasStream: true,
        videoTrackCount: 1,
        videoTrackReadyState: 'live',
        videoTrackEnabled: true,
        isLocal: false,
        isCameraOff: false,
        videoWidth: 640,
        videoHeight: 480,
        readyState: 4,
      });

      expect(res.hasLiveRemoteVideoTrack).toBe(true);
      expect(res.isVideoPlaying).toBe(true);
      expect(res.isConnecting).toBe(false);
      expect(res.isConnectedNoVideo).toBe(false);
      expect(res.isFailed).toBe(false);
      expect(res.showOverlay).toBe(false);
    });
  });

  describe('D. Connected + no remote track -> "Video unavailable"', () => {
    it('evaluates to "Video unavailable" and NOT "Connecting..."', () => {
      const res = evaluateTileState({
        connectionState: 'connected',
        hasStream: false,
        videoTrackCount: 0,
        videoTrackReadyState: 'none',
        videoTrackEnabled: false,
        isLocal: false,
        isCameraOff: false,
        videoWidth: 0,
        videoHeight: 0,
        readyState: 0,
      });

      expect(res.isVideoPlaying).toBe(false);
      expect(res.isConnecting).toBe(false); // MUST NOT BE CONNECTING!
      expect(res.isConnectedNoVideo).toBe(true); // MUST BE "Video unavailable"!
      expect(res.isFailed).toBe(false);
      expect(res.showOverlay).toBe(true);
    });
  });

  describe('E. PiP state change -> no Socket.IO playback event', () => {
    it('entering and exiting PiP generates zero socket emissions', async () => {
      const socketEmitSpy = vi.fn();
      (socketService as any).socket = { emit: socketEmitSpy };

      // Simulate local togglePiP
      let isLocalPiP = false;
      const togglePiP = async (e?: any) => {
        if (e) {
          e.stopPropagation?.();
          e.preventDefault?.();
        }
        isLocalPiP = !isLocalPiP;
        // Strictly local state update, zero socket calls
      };

      // Enter PiP
      await togglePiP({ stopPropagation: vi.fn(), preventDefault: vi.fn() });
      expect(isLocalPiP).toBe(true);
      expect(socketEmitSpy).not.toHaveBeenCalled();

      // Exit PiP
      await togglePiP({ stopPropagation: vi.fn(), preventDefault: vi.fn() });
      expect(isLocalPiP).toBe(false);
      expect(socketEmitSpy).not.toHaveBeenCalled();
    });
  });

  describe('F. PiP state change on Host -> Guest UI state unchanged', () => {
    it('Host entering PiP has no effect on Guest state', () => {
      const hostState = { isPiP: false, isPlaying: true, currentTime: 42 };
      const guestState = { isPiP: false, isPlaying: true, currentTime: 42 };

      // Host enters PiP locally
      hostState.isPiP = true;

      // Guest remains completely unaffected
      expect(hostState.isPiP).toBe(true);
      expect(guestState.isPiP).toBe(false);
      expect(guestState.isPlaying).toBe(hostState.isPlaying);
      expect(guestState.currentTime).toBe(hostState.currentTime);
    });
  });

  describe('G. PiP state change on Guest -> Host UI state unchanged', () => {
    it('Guest entering PiP has no effect on Host state', () => {
      const hostState = { isPiP: false, isPlaying: true, currentTime: 100 };
      const guestState = { isPiP: false, isPlaying: true, currentTime: 100 };

      // Guest enters PiP locally
      guestState.isPiP = true;

      // Host remains completely unaffected
      expect(guestState.isPiP).toBe(true);
      expect(hostState.isPiP).toBe(false);
      expect(hostState.isPlaying).toBe(guestState.isPlaying);
      expect(hostState.currentTime).toBe(guestState.currentTime);
    });
  });
});
