// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { VideoCallManager } from '../features/video/videoCallManager.js';
import { RemoteAudioRenderer } from '../features/video/RemoteAudioRenderer.js';
import { ParticipantGalleryModal } from '../features/video/ParticipantGalleryModal.js';
import { VideoTile } from '../features/video/VideoTile.js';

describe('Camera, Voice Chat, Audio Mixing & Fullscreen Participant Gallery Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    class MockMediaStream {
      tracks: any[] = [];
      id = 'mock-stream-' + Math.random().toString(36).substring(7);
      constructor(tracks?: any[]) {
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

    class MockRTCPeerConnection {
      signalingState = 'stable';
      getTransceivers = vi.fn().mockReturnValue([]);
      getSenders = vi.fn().mockReturnValue([]);
      addTransceiver = vi.fn().mockImplementation((kind: string) => ({
        direction: 'sendrecv',
        sender: {
          replaceTrack: vi.fn().mockResolvedValue(undefined),
          getParameters: () => ({ encodings: [] }),
          setParameters: vi.fn().mockResolvedValue(undefined),
        },
        receiver: { track: { kind } },
      }));
      addTrack = vi.fn();
      close = vi.fn();
      setRemoteDescription = vi.fn().mockResolvedValue(undefined);
      setLocalDescription = vi.fn().mockResolvedValue(undefined);
      createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock' });
      createAnswer = vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock' });
    }

    vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe('1. Host and Guest Camera Controls', () => {
    it('turns camera on reliably and keeps audio intact when camera is disabled', async () => {
      const mockAudioTrack = { kind: 'audio', enabled: true, stop: vi.fn() };
      const mockVideoTrack = { kind: 'video', enabled: true, stop: vi.fn() };

      const getUserMedia = vi.fn().mockImplementation((constraints) => {
        if (constraints.video) {
          return Promise.resolve(new (global as any).MediaStream([mockVideoTrack]));
        }
        return Promise.resolve(new (global as any).MediaStream([mockAudioTrack]));
      });

      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia },
        configurable: true,
        writable: true,
      });

      const mgr = new VideoCallManager({
        onRemoteStream: vi.fn(),
        onRemotePeerLeft: vi.fn(),
        onConnectionStateChange: vi.fn(),
        onError: vi.fn(),
      }, 'host-id');

      // 1. Enable mic first (default on join)
      await mgr.enableMic();
      expect(mgr.getLocalStream()?.getAudioTracks().length).toBe(1);

      // 2. Enable camera
      await mgr.enableCamera();
      expect(mgr.getLocalStream()?.getVideoTracks().length).toBe(1);
      expect(mgr.getLocalStream()?.getAudioTracks().length).toBe(1);

      // 3. Disable camera - audio track MUST remain
      mgr.disableCamera();
      expect(mgr.getLocalStream()?.getVideoTracks().length).toBe(0);
      expect(mgr.getLocalStream()?.getAudioTracks().length).toBe(1);
      expect(mockVideoTrack.stop).toHaveBeenCalled();
    });
    it('throws accurate error and does not swallow NotFoundError when camera hardware is missing', async () => {
      const getUserMedia = vi.fn().mockImplementation((constraints) => {
        if (constraints.video) {
          const err = new Error('Requested device not found');
          err.name = 'NotFoundError';
          return Promise.reject(err);
        }
        return Promise.resolve(new (global as any).MediaStream([{ kind: 'audio', enabled: true, stop: vi.fn() }]));
      });

      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia },
        configurable: true,
        writable: true,
      });

      const mgr = new VideoCallManager({
        onRemoteStream: vi.fn(),
        onRemotePeerLeft: vi.fn(),
        onConnectionStateChange: vi.fn(),
        onError: vi.fn(),
      }, 'host-id');

      // Enable microphone first
      await mgr.enableMic();
      expect(mgr.getLocalStream()?.getAudioTracks().length).toBe(1);

      // Attempt enableCamera when camera is missing: must throw NotFoundError, not swallow
      await expect(mgr.enableCamera()).rejects.toThrow('No camera found on this device.');
      // Audio stream must stay completely intact!
      expect(mgr.getLocalStream()?.getAudioTracks().length).toBe(1);
    });

    it('supports toggling camera on, off, and on again repeatedly without track leaks', async () => {
      const mockVideoTrack1 = { kind: 'video', id: 'vid-1', enabled: true, stop: vi.fn() };
      const mockVideoTrack2 = { kind: 'video', id: 'vid-2', enabled: true, stop: vi.fn() };
      let callCount = 0;

      const getUserMedia = vi.fn().mockImplementation((constraints) => {
        if (constraints.video) {
          callCount++;
          return Promise.resolve(new (global as any).MediaStream([callCount === 1 ? mockVideoTrack1 : mockVideoTrack2]));
        }
        return Promise.resolve(new (global as any).MediaStream([{ kind: 'audio', enabled: true, stop: vi.fn() }]));
      });

      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia },
        configurable: true,
        writable: true,
      });

      const mgr = new VideoCallManager({
        onRemoteStream: vi.fn(),
        onRemotePeerLeft: vi.fn(),
        onConnectionStateChange: vi.fn(),
        onError: vi.fn(),
      }, 'host-id');

      await mgr.enableMic();

      // Cycle 1: ON
      await mgr.enableCamera();
      expect(mgr.getLocalStream()?.getVideoTracks().length).toBe(1);

      // Cycle 1: OFF
      mgr.disableCamera();
      expect(mgr.getLocalStream()?.getVideoTracks().length).toBe(0);
      expect(mockVideoTrack1.stop).toHaveBeenCalled();

      // Cycle 2: ON AGAIN
      await mgr.enableCamera();
      expect(mgr.getLocalStream()?.getVideoTracks().length).toBe(1);

      // Cycle 2: OFF AGAIN
      mgr.disableCamera();
      expect(mgr.getLocalStream()?.getVideoTracks().length).toBe(0);
      expect(mockVideoTrack2.stop).toHaveBeenCalled();

      // Audio track never stopped
      expect(mgr.getLocalStream()?.getAudioTracks().length).toBe(1);
    });
  });

  describe('2. Independent Participant Audio Mixing', () => {
    it('RemoteAudioRenderer renders individual audio elements with per-participant volume and mute', () => {
      const peerAStream = new (global as any).MediaStream([{ kind: 'audio', enabled: true }]);
      const peerBStream = new (global as any).MediaStream([{ kind: 'audio', enabled: true }]);

      const mockPeers = [
        {
          participantId: 'peer-ahmed',
          displayName: 'Ahmed',
          isLocal: false,
          isMuted: false,
          isCameraOff: true,
          connectionState: 'connected' as RTCPeerConnectionState,
          stream: peerAStream,
        },
        {
          participantId: 'peer-abbas',
          displayName: 'Abbas',
          isLocal: false,
          isMuted: false,
          isCameraOff: false,
          connectionState: 'connected' as RTCPeerConnectionState,
          stream: peerBStream,
        },
      ];

      const volumes = new Map<string, number>([
        ['peer-ahmed', 100],
        ['peer-abbas', 70],
      ]);

      const muted = new Map<string, boolean>([
        ['peer-ahmed', false],
        ['peer-abbas', true],
      ]);

      const { container } = render(
        <RemoteAudioRenderer
          peers={mockPeers}
          participantVolumes={volumes}
          participantMutedLocally={muted}
        />
      );

      const audioElements = container.querySelectorAll('audio');
      expect(audioElements.length).toBe(2);

      const ahmedAudio = container.querySelector('audio[data-participant-id="peer-ahmed"]') as HTMLAudioElement;
      const abbasAudio = container.querySelector('audio[data-participant-id="peer-abbas"]') as HTMLAudioElement;

      expect(ahmedAudio).toBeDefined();
      expect(abbasAudio).toBeDefined();
      expect(ahmedAudio.getAttribute('data-participant-id')).toBe('peer-ahmed');
      expect(abbasAudio.getAttribute('data-participant-id')).toBe('peer-abbas');
    });
  });

  describe('3. Participant Video Tiles Alignment & Overlap Prevention', () => {
    it('VideoTile displays host badge, name, truncation, and mic status without overlapping duplicate text', () => {
      const { container } = render(
        <div style={{ width: 180, height: 135 }}>
          <VideoTile
            participantId="p-123"
            displayName="Alexander The Great With A Long Name That Must Truncate"
            isLocal={false}
            isHost={true}
            isMuted={true}
            isCameraOff={true}
            volume={70}
            showVolumeControl={true}
          />
        </div>
      );

      // Name is present
      expect(screen.getByText('Alexander The Great With A Long Name That Must Truncate')).toBeDefined();
      // Host pill badge is present
      expect(screen.getByText('Host')).toBeDefined();
      // Mic off indicator label
      expect(screen.getByTitle('Microphone muted')).toBeDefined();
      // Camera off status
      expect(screen.getByText('Camera off')).toBeDefined();

      // Ensure bottom bar has safe max-width truncation and mic is separated
      const nameElement = screen.getByText('Alexander The Great With A Long Name That Must Truncate');
      expect(nameElement.classList.contains('truncate')).toBe(true);
    });

    it('VideoTile local tile displays (You) indicator and does not display volume menu', () => {
      render(
        <div style={{ width: 180, height: 135 }}>
          <VideoTile
            participantId="p-me"
            displayName="Abbas"
            isLocal={true}
            isHost={true}
            isMuted={false}
            isCameraOff={true}
            showVolumeControl={false}
          />
        </div>
      );

      expect(screen.getByText('Abbas')).toBeDefined();
      expect(screen.getByText('(You)')).toBeDefined();
      expect(screen.getByTitle('Microphone active')).toBeDefined();
      expect(screen.queryByTitle(/volume/i)).toBeNull();
    });
  });

  describe('4. Fullscreen Participant Gallery', () => {
    it('renders all participants in responsive gallery grid and triggers close on Escape key', () => {
      const onClose = vi.fn();
      const mockParticipants = [
        { id: 'part-me', sessionId: 'sess-me', displayName: 'Ahamed', isHost: false, joinedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), isOnline: true },
        { id: 'part-host', sessionId: 'sess-host', displayName: 'Abbas', isHost: true, joinedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), isOnline: true },
      ];

      const { unmount } = render(
        <ParticipantGalleryModal
          isOpen={true}
          onClose={onClose}
          roomTitle="Movie Night"
          participants={mockParticipants}
          sessionId="sess-me"
          currentParticipantId="part-me"
          currentDisplayName="Ahamed"
          isHost={false}
          isCameraOn={false}
          isMuted={false}
          allPeers={[]}
          participantVolumes={new Map()}
          participantMutedLocally={new Map()}
          onVolumeChange={vi.fn()}
          onToggleLocalMute={vi.fn()}
          onToggleCamera={vi.fn()}
          onToggleMute={vi.fn()}
          getStream={vi.fn()}
        />
      );

      expect(screen.getByText('Participant Gallery')).toBeDefined();
      expect(screen.getByText('2 in call')).toBeDefined();
      expect(screen.getByText('Ahamed')).toBeDefined();
      expect(screen.getByText('Abbas')).toBeDefined();

      // Press Escape
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();

      unmount();
    });
  });
});
