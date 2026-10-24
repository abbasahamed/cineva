import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { socketService } from '../../services/socket.js';
import {
  SOCKET_EVENTS,
  VideoParticipant,
  RelayedVideoOfferPayload,
  RelayedVideoAnswerPayload,
  RelayedVideoIceCandidatePayload,
  RelayedVideoStatePayload,
} from '@cineva/shared';
import { VideoCallManager } from './videoCallManager.js';
import { VideoPeerDisplayState } from './videoCallTypes.js';
import { RemoteAudioRenderer } from './RemoteAudioRenderer.js';

interface VideoContextValue {
  isCameraOn: boolean;
  isMuted: boolean;
  isConnecting: boolean;
  permissionError: string | null;
  cameraPeers: VideoPeerDisplayState[];
  allPeers: VideoPeerDisplayState[];
  currentParticipantId?: string;
  currentDisplayName?: string;
  participantVolumes: Map<string, number>;
  participantMutedLocally: Map<string, boolean>;
  setParticipantVolume: (participantId: string, volume: number) => void;
  toggleParticipantLocalMute: (participantId: string) => void;
  toggleCamera: () => Promise<void>;
  toggleMute: () => Promise<void>;
  dismissError: () => void;
  getStream: (participantId: string, isLocal?: boolean) => MediaStream | null;
  getPeerDiagnostics: (participantId: string) => any;
}

const VideoContext = createContext<VideoContextValue | null>(null);

interface VideoProviderProps {
  roomCode: string;
  currentParticipantId?: string;
  currentDisplayName?: string;
  children: React.ReactNode;
}

export const VideoProvider: React.FC<VideoProviderProps> = ({
  roomCode,
  currentParticipantId,
  currentDisplayName,
  children,
}) => {
  const [isCameraOn, setIsCameraOn] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Independent per-remote-participant volume state (0 to 100, default 100)
  const [participantVolumes, setParticipantVolumes] = useState<Map<string, number>>(new Map());
  // Independent per-remote-participant local mute state (default unmuted)
  const [participantMutedLocally, setParticipantMutedLocally] = useState<Map<string, boolean>>(new Map());

  // Track if user explicitly muted to avoid auto-unmuting
  const hasUserMutedExplicitlyRef = useRef<boolean>(false);
  const hasAttemptedAutoMicRef = useRef<boolean>(false);

  // Map of participantId -> VideoPeerDisplayState (including active streams and debug info)
  const [remotePeers, setRemotePeers] = useState<Map<string, VideoPeerDisplayState>>(new Map());

  const managerRef = useRef<VideoCallManager | null>(null);

  // Helper to get or create manager singleton
  const getOrCreateManager = useCallback(() => {
    if (managerRef.current) {
      if (currentParticipantId) {
        managerRef.current.setLocalParticipantId(currentParticipantId);
      }
      return managerRef.current;
    }

    const mgr = new VideoCallManager(
      {
        onRemoteStream: (participantId, stream) => {
          console.log('[VideoContext DIAG] onRemoteStream received', {
            participantId,
            streamId: stream.id,
            videoTracks: stream.getVideoTracks().length,
            audioTracks: stream.getAudioTracks().length,
          });
          setRemotePeers((prev) => {
            const existing = prev.get(participantId);
            const next = new Map(prev);
            next.set(participantId, {
              participantId,
              displayName: existing?.displayName || 'Friend',
              isLocal: false,
              isMuted: existing?.isMuted ?? false,
              isCameraOff: existing?.isCameraOff ?? true,
              connectionState: 'connected',
              stream,
              peerDebugId: `PC-${currentParticipantId || 'anon'}-${participantId}`,
            });
            return next;
          });
        },
        onRemotePeerLeft: (participantId) => {
          setRemotePeers((prev) => {
            if (!prev.has(participantId)) return prev;
            const next = new Map(prev);
            next.delete(participantId);
            return next;
          });
        },
        onConnectionStateChange: (participantId, connectionState) => {
          console.log('[VideoContext DIAG] onConnectionStateChange', {
            participantId,
            connectionState,
          });
          setRemotePeers((prev) => {
            const existing = prev.get(participantId);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(participantId, {
              ...existing,
              connectionState,
            });
            return next;
          });
        },
        onError: (err) => {
          console.warn('WebRTC warning:', err);
        },
      },
      currentParticipantId || ''
    );

    managerRef.current = mgr;
    return mgr;
  }, [currentParticipantId]);

  const getStream = useCallback((participantId: string, isLocal?: boolean): MediaStream | null => {
    return managerRef.current ? managerRef.current.getStream(participantId, isLocal) : null;
  }, []);

  const dismissError = useCallback(() => {
    setPermissionError(null);
  }, []);

  const setParticipantVolume = useCallback((participantId: string, volume: number) => {
    setParticipantVolumes((prev) => {
      const next = new Map(prev);
      next.set(participantId, Math.max(0, Math.min(100, volume)));
      return next;
    });
  }, []);

  const toggleParticipantLocalMute = useCallback((participantId: string) => {
    setParticipantMutedLocally((prev) => {
      const next = new Map(prev);
      const current = next.get(participantId) || false;
      next.set(participantId, !current);
      return next;
    });
  }, []);

  // 1. Microphone enabled by default when participant ID is known
  useEffect(() => {
    if (!currentParticipantId) return;

    const mgr = getOrCreateManager();
    mgr.setLocalParticipantId(currentParticipantId);

    // Announce video/voice presence
    socketService.emitVideoJoin();

    if (!hasAttemptedAutoMicRef.current && !hasUserMutedExplicitlyRef.current) {
      hasAttemptedAutoMicRef.current = true;
      mgr
        .enableMic()
        .then(() => {
          setIsMuted(false);
          socketService.emitVideoStateUpdate({ isMuted: false, isCameraOff: true });
        })
        .catch((err: any) => {
          if (err?.name !== 'NotAllowedError' && err?.name !== 'PermissionDeniedError') {
            console.warn('[VideoContext] Auto-mic acquisition failed:', err);
          }
          setIsMuted(true);
          if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
            setPermissionError('Microphone permission was denied. Click Mic anytime to enable audio.');
          } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
            setPermissionError('No microphone found on this device.');
          }
        });
    }
  }, [currentParticipantId, getOrCreateManager]);

  // 2. Camera toggle (Reliable camera on/off with mutex against concurrent invocations)
  const isTogglingCameraRef = useRef<boolean>(false);

  const toggleCamera = useCallback(async () => {
    if (isTogglingCameraRef.current) {
      console.warn('[VideoContext] Camera toggle already in flight, ignoring duplicate call.');
      return;
    }

    if (!VideoCallManager.isSupported()) {
      setPermissionError('[NotSupportedError] WebRTC camera video is not supported in this browser.');
      return;
    }

    isTogglingCameraRef.current = true;
    const mgr = getOrCreateManager();

    try {
      if (isCameraOn) {
        // Turn camera OFF
        mgr.disableCamera();
        setIsCameraOn(false);
        socketService.emitVideoStateUpdate({ isCameraOff: true, isMuted });
      } else {
        // Turn camera ON
        setIsConnecting(true);
        setPermissionError(null);

        const localStream = await mgr.enableCamera();
        const hasLiveVideo = localStream.getVideoTracks().some((t) => t.readyState === 'live');
        if (!hasLiveVideo) {
          throw new Error('[ZeroTracksError] Camera acquisition finished without any live video tracks.');
        }

        setIsCameraOn(true);
        setIsConnecting(false);

        // Notify server that our camera is now active
        socketService.emitVideoStateUpdate({ isCameraOff: false, isMuted });

        // Connect or renegotiate with any known remote peers
        for (const peerId of remotePeers.keys()) {
          mgr.initiateConnectionToPeer(peerId).catch(() => {});
        }
      }
    } catch (err: any) {
      setIsConnecting(false);
      console.error('[VideoContext] Camera toggle failed:', {
        name: err?.name,
        message: err?.message,
        constraint: (err as any)?.constraint,
        stack: err?.stack,
        rawError: err,
      });

      const displayMsg = err?.message || `[${err?.name || 'Error'}] Unable to access camera.`;
      setPermissionError(displayMsg);
    } finally {
      isTogglingCameraRef.current = false;
    }
  }, [isCameraOn, isMuted, getOrCreateManager, remotePeers]);

  // 3. Microphone toggle (Mute / Unmute)
  const toggleMute = useCallback(async () => {
    const mgr = getOrCreateManager();
    const nextMuted = !isMuted;

    if (nextMuted) {
      hasUserMutedExplicitlyRef.current = true;
      mgr.disableMic();
      setIsMuted(true);
      socketService.emitVideoStateUpdate({ isMuted: true, isCameraOff: !isCameraOn });
    } else {
      hasUserMutedExplicitlyRef.current = false;
      try {
        await mgr.enableMic();
        setIsMuted(false);
        setPermissionError(null);
        socketService.emitVideoStateUpdate({ isMuted: false, isCameraOff: !isCameraOn });
      } catch (err: any) {
        setIsMuted(true);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermissionError('Microphone permission was denied. Please allow microphone access in settings.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setPermissionError('No microphone found on this device.');
        } else {
          setPermissionError('Unable to activate microphone.');
        }
      }
    }
  }, [isMuted, isCameraOn, getOrCreateManager]);

  // 4. Setup Socket.IO listeners for room video presence & WebRTC signaling
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const mgr = getOrCreateManager();

    // 1. Initial participants who are in the call
    const handleParticipants = async (data: { participants: VideoParticipant[] }) => {
      console.log('[VideoContext DIAG] handleParticipants received', {
        count: data.participants.length,
        participants: data.participants.map((p) => ({ id: p.participantId, isCameraOff: p.isCameraOff })),
      });
      setRemotePeers((prev) => {
        const next = new Map(prev);
        for (const p of data.participants) {
          if (p.participantId !== currentParticipantId) {
            const existing = prev.get(p.participantId);
            const stream = existing?.stream || mgr.getStream(p.participantId) || null;
            next.set(p.participantId, {
              participantId: p.participantId,
              displayName: p.displayName,
              isLocal: false,
              isMuted: p.isMuted,
              isCameraOff: p.isCameraOff,
              connectionState: existing?.connectionState || (stream ? 'connected' : 'connecting'),
              stream,
              peerDebugId: `PC-${currentParticipantId || 'anon'}-${p.participantId}`,
            });
          }
        }
        return next;
      });

      // Initiate WebRTC connection to existing participants
      for (const p of data.participants) {
        if (p.participantId !== currentParticipantId) {
          await mgr.initiateConnectionToPeer(p.participantId);
        }
      }
    };

    // 2. A remote peer joined the call
    const handlePeerJoined = async (data: { participant: VideoParticipant }) => {
      if (data.participant.participantId === currentParticipantId) return;

      setRemotePeers((prev) => {
        const next = new Map(prev);
        const existing = prev.get(data.participant.participantId);
        const stream = existing?.stream || mgr.getStream(data.participant.participantId) || null;
        next.set(data.participant.participantId, {
          participantId: data.participant.participantId,
          displayName: data.participant.displayName,
          isLocal: false,
          isMuted: data.participant.isMuted,
          isCameraOff: data.participant.isCameraOff,
          connectionState: existing?.connectionState || (stream ? 'connected' : 'connecting'),
          stream,
          peerDebugId: `PC-${currentParticipantId || 'anon'}-${data.participant.participantId}`,
        });
        return next;
      });
    };

    // 3. A remote peer left
    const handlePeerLeft = (data: { participantId: string }) => {
      mgr.closePeerConnection(data.participantId);
      setRemotePeers((prev) => {
        if (!prev.has(data.participantId)) return prev;
        const next = new Map(prev);
        next.delete(data.participantId);
        return next;
      });
    };

    // 4. Remote peer updated camera / mic state
    const handlePeerState = (data: RelayedVideoStatePayload) => {
      setRemotePeers((prev) => {
        const existing = prev.get(data.participantId);
        if (!existing) return prev;
        const next = new Map(prev);
        const stream = existing.stream || mgr.getStream(data.participantId) || null;
        const nextCameraOff = typeof data.isCameraOff === 'boolean'
          ? data.isCameraOff
          : existing.isCameraOff;
        next.set(data.participantId, {
          ...existing,
          isMuted: typeof data.isMuted === 'boolean' ? data.isMuted : existing.isMuted,
          isCameraOff: nextCameraOff,
          stream,
        });
        return next;
      });
    };

    // 5. Inbound SDP Offer
    const handleOffer = async (data: RelayedVideoOfferPayload) => {
      setRemotePeers((prev) => {
        const next = new Map(prev);
        const existing = next.get(data.fromParticipantId);
        const stream = existing?.stream || mgr.getStream(data.fromParticipantId) || null;
        next.set(data.fromParticipantId, {
          participantId: data.fromParticipantId,
          displayName: data.fromDisplayName || existing?.displayName || 'Friend',
          isLocal: false,
          isMuted: existing?.isMuted ?? false,
          isCameraOff: existing?.isCameraOff ?? true,
          connectionState: existing?.connectionState || (stream ? 'connected' : 'connecting'),
          stream,
          peerDebugId: `PC-${currentParticipantId || 'anon'}-${data.fromParticipantId}`,
        });
        return next;
      });

      await mgr.handleIncomingOffer(data.fromParticipantId, data.sdp);
    };

    // 6. Inbound SDP Answer
    const handleAnswer = async (data: RelayedVideoAnswerPayload) => {
      await mgr.handleIncomingAnswer(data.fromParticipantId, data.sdp);
    };

    // 7. Inbound ICE Candidate
    const handleIceCandidate = async (data: RelayedVideoIceCandidatePayload) => {
      await mgr.handleIncomingIceCandidate(data.fromParticipantId, data.candidate);
    };

    socket.on(SOCKET_EVENTS.VIDEO_PARTICIPANTS, handleParticipants);
    socket.on(SOCKET_EVENTS.VIDEO_PEER_JOINED, handlePeerJoined);
    socket.on(SOCKET_EVENTS.VIDEO_PEER_LEFT, handlePeerLeft);
    socket.on(SOCKET_EVENTS.VIDEO_PEER_STATE, handlePeerState);
    socket.on(SOCKET_EVENTS.VIDEO_OFFER, handleOffer);
    socket.on(SOCKET_EVENTS.VIDEO_ANSWER, handleAnswer);
    socket.on(SOCKET_EVENTS.VIDEO_ICE_CANDIDATE, handleIceCandidate);

    return () => {
      socket.off(SOCKET_EVENTS.VIDEO_PARTICIPANTS, handleParticipants);
      socket.off(SOCKET_EVENTS.VIDEO_PEER_JOINED, handlePeerJoined);
      socket.off(SOCKET_EVENTS.VIDEO_PEER_LEFT, handlePeerLeft);
      socket.off(SOCKET_EVENTS.VIDEO_PEER_STATE, handlePeerState);
      socket.off(SOCKET_EVENTS.VIDEO_OFFER, handleOffer);
      socket.off(SOCKET_EVENTS.VIDEO_ANSWER, handleAnswer);
      socket.off(SOCKET_EVENTS.VIDEO_ICE_CANDIDATE, handleIceCandidate);
    };
  }, [currentParticipantId, isCameraOn, getOrCreateManager]);

  // Clean up all hardware tracks on unmount
  useEffect(() => {
    return () => {
      if (managerRef.current) {
        managerRef.current.cleanup();
        managerRef.current = null;
      }
      socketService.emitVideoLeave();
    };
  }, []);

  const cameraPeers = Array.from(remotePeers.values()).filter((p) => {
    if (!p.isCameraOff) return true;
    const s = p.stream || (managerRef.current ? managerRef.current.getStream(p.participantId) : null);
    if (s && s.getVideoTracks().some((t) => t.readyState === 'live')) {
      return true;
    }
    return false;
  });

  const allPeers = Array.from(remotePeers.values());

  const getPeerDiagnostics = useCallback((participantId: string) => {
    return managerRef.current ? managerRef.current.getPeerDiagnostics(participantId) : null;
  }, []);

  const contextValue: VideoContextValue = {
    isCameraOn,
    isMuted,
    isConnecting,
    permissionError,
    cameraPeers,
    allPeers,
    currentParticipantId,
    currentDisplayName,
    participantVolumes,
    participantMutedLocally,
    setParticipantVolume,
    toggleParticipantLocalMute,
    toggleCamera,
    toggleMute,
    dismissError,
    getStream,
    getPeerDiagnostics,
  };

  return (
    <VideoContext.Provider value={contextValue}>
      {children}
      {/* Persistent Independent Remote Audio Renderer */}
      <RemoteAudioRenderer
        peers={allPeers}
        participantVolumes={participantVolumes}
        participantMutedLocally={participantMutedLocally}
        getStream={getStream}
      />
    </VideoContext.Provider>
  );
};

export function useVideoControls() {
  const ctx = useContext(VideoContext);
  if (!ctx) {
    throw new Error('useVideoControls must be used within VideoProvider');
  }
  return {
    isCameraOn: ctx.isCameraOn,
    isMuted: ctx.isMuted,
    isConnecting: ctx.isConnecting,
    permissionError: ctx.permissionError,
    toggleCamera: ctx.toggleCamera,
    toggleMute: ctx.toggleMute,
    dismissError: ctx.dismissError,
  };
}

export function useVideoPeers() {
  const ctx = useContext(VideoContext);
  if (!ctx) {
    throw new Error('useVideoPeers must be used within VideoProvider');
  }
  return {
    isCameraOn: ctx.isCameraOn,
    isMuted: ctx.isMuted,
    cameraPeers: ctx.cameraPeers,
    allPeers: ctx.allPeers,
    currentDisplayName: ctx.currentDisplayName || 'You',
    currentParticipantId: ctx.currentParticipantId || '',
    participantVolumes: ctx.participantVolumes,
    participantMutedLocally: ctx.participantMutedLocally,
    setParticipantVolume: ctx.setParticipantVolume,
    toggleParticipantLocalMute: ctx.toggleParticipantLocalMute,
    toggleCamera: ctx.toggleCamera,
    toggleMute: ctx.toggleMute,
    getStream: ctx.getStream,
    getPeerDiagnostics: ctx.getPeerDiagnostics,
  };
}
