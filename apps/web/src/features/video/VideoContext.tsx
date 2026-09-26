import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { socketService } from '../../services/socket.js';
import {
  VideoParticipant,
  RelayedVideoOfferPayload,
  RelayedVideoAnswerPayload,
  RelayedVideoIceCandidatePayload,
  RelayedVideoStatePayload,
} from '@syncwatch/shared';
import { VideoCallManager } from './videoCallManager.js';
import { VideoPeerDisplayState } from './videoCallTypes.js';

interface VideoContextValue {
  isCameraOn: boolean;
  isMuted: boolean;
  isConnecting: boolean;
  permissionError: string | null;
  cameraPeers: VideoPeerDisplayState[];
  currentParticipantId?: string;
  currentDisplayName?: string;
  toggleCamera: () => Promise<void>;
  toggleMute: () => Promise<void>;
  dismissError: () => void;
  getStream: (participantId: string, isLocal?: boolean) => MediaStream | null;
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

  // Map of participantId -> VideoPeerDisplayState (only primitive metadata, NOT streams)
  const [remotePeers, setRemotePeers] = useState<Map<string, VideoPeerDisplayState>>(new Map());

  const managerRef = useRef<VideoCallManager | null>(null);

  // Helper to get or create manager singleton
  const getOrCreateManager = useCallback(() => {
    if (managerRef.current) return managerRef.current;

    const mgr = new VideoCallManager({
      onRemoteStream: (participantId, _stream) => {
        setRemotePeers((prev) => {
          const existing = prev.get(participantId);
          if (!existing) return prev;
          const next = new Map(prev);
          next.set(participantId, {
            ...existing,
            connectionState: 'connected',
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
    });

    managerRef.current = mgr;
    return mgr;
  }, []);

  const getStream = useCallback((participantId: string, isLocal?: boolean): MediaStream | null => {
    return managerRef.current ? managerRef.current.getStream(participantId, isLocal) : null;
  }, []);

  const dismissError = useCallback(() => {
    setPermissionError(null);
  }, []);

  const toggleCamera = useCallback(async () => {
    if (!VideoCallManager.isSupported()) {
      setPermissionError('WebRTC camera video is not supported in this browser.');
      return;
    }

    const mgr = getOrCreateManager();

    if (isCameraOn) {
      // Turn camera OFF
      mgr.disableCamera();
      setIsCameraOn(false);
      socketService.emitVideoStateUpdate({ isCameraOff: true });
    } else {
      // Turn camera ON
      setIsConnecting(true);
      setPermissionError(null);
      try {
        await mgr.enableCamera();
        setIsCameraOn(true);
        setIsConnecting(false);

        // Notify server that our camera is now active
        socketService.emitVideoJoin();
        socketService.emitVideoStateUpdate({ isCameraOff: false, isMuted });

        // Connect to any known remote peers with active media
        for (const peerId of remotePeers.keys()) {
          mgr.initiateConnectionToPeer(peerId);
        }
      } catch (err: any) {
        setIsConnecting(false);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermissionError('Camera permission was denied. Please allow camera access in browser settings.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setPermissionError('No camera found on this device.');
        } else {
          setPermissionError(err.message || 'Unable to access camera.');
        }
      }
    }
  }, [isCameraOn, isMuted, getOrCreateManager, remotePeers]);

  const toggleMute = useCallback(async () => {
    const mgr = getOrCreateManager();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (nextMuted) {
      mgr.disableMic();
    } else {
      try {
        await mgr.enableMic();
      } catch (err: any) {
        console.warn('Failed to enable mic:', err);
      }
    }

    socketService.emitVideoStateUpdate({ isMuted: nextMuted });
  }, [isMuted, getOrCreateManager]);

  // Setup Socket.IO listeners for room video presence & WebRTC signaling
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const mgr = getOrCreateManager();

    // 1. Initial participants who already have camera on in this room
    const handleParticipants = async (data: { participants: VideoParticipant[] }) => {
      setRemotePeers((prev) => {
        const next = new Map(prev);
        for (const p of data.participants) {
          if (p.participantId !== currentParticipantId) {
            next.set(p.participantId, {
              participantId: p.participantId,
              displayName: p.displayName,
              isLocal: false,
              isMuted: p.isMuted,
              isCameraOff: p.isCameraOff,
              connectionState: 'connecting',
            });
          }
        }
        return next;
      });

      // If we also have our camera on, initiate connection
      if (isCameraOn) {
        for (const p of data.participants) {
          if (p.participantId !== currentParticipantId) {
            await mgr.initiateConnectionToPeer(p.participantId);
          }
        }
      }
    };

    // 2. A remote peer in the room turned their camera ON
    const handlePeerJoined = async (data: { participant: VideoParticipant }) => {
      if (data.participant.participantId === currentParticipantId) return;

      setRemotePeers((prev) => {
        const next = new Map(prev);
        next.set(data.participant.participantId, {
          participantId: data.participant.participantId,
          displayName: data.participant.displayName,
          isLocal: false,
          isMuted: data.participant.isMuted,
          isCameraOff: data.participant.isCameraOff,
          connectionState: 'connecting',
        });
        return next;
      });

      // If we have camera active, initiate offer
      if (isCameraOn) {
        await mgr.initiateConnectionToPeer(data.participant.participantId);
      }
    };

    // 3. A remote peer turned off media or left
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
        next.set(data.participantId, {
          ...existing,
          isMuted: typeof data.isMuted === 'boolean' ? data.isMuted : existing.isMuted,
          isCameraOff: typeof data.isCameraOff === 'boolean' ? data.isCameraOff : existing.isCameraOff,
        });
        return next;
      });
    };

    // 5. Inbound SDP Offer
    const handleOffer = async (data: RelayedVideoOfferPayload) => {
      setRemotePeers((prev) => {
        const next = new Map(prev);
        const existing = next.get(data.fromParticipantId);
        next.set(data.fromParticipantId, {
          participantId: data.fromParticipantId,
          displayName: data.fromDisplayName || existing?.displayName || 'Friend',
          isLocal: false,
          isMuted: existing?.isMuted ?? false,
          isCameraOff: existing?.isCameraOff ?? false,
          connectionState: 'connecting',
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

    socket.on('video:participants', handleParticipants);
    socket.on('video:peer-joined', handlePeerJoined);
    socket.on('video:peer-left', handlePeerLeft);
    socket.on('video:peer-state', handlePeerState);
    socket.on('video:offer', handleOffer);
    socket.on('video:answer', handleAnswer);
    socket.on('video:ice-candidate', handleIceCandidate);

    return () => {
      socket.off('video:participants', handleParticipants);
      socket.off('video:peer-joined', handlePeerJoined);
      socket.off('video:peer-left', handlePeerLeft);
      socket.off('video:peer-state', handlePeerState);
      socket.off('video:offer', handleOffer);
      socket.off('video:answer', handleAnswer);
      socket.off('video:ice-candidate', handleIceCandidate);
    };
  }, [currentParticipantId, isCameraOn, getOrCreateManager]);

  // Clean up all hardware tracks on unmount (e.g. leaving watch room)
  useEffect(() => {
    return () => {
      if (managerRef.current) {
        managerRef.current.cleanup();
        managerRef.current = null;
      }
      socketService.emitVideoLeave();
    };
  }, []);

  // Filter peers to only those whose camera is currently ON
  const cameraPeers = Array.from(remotePeers.values()).filter((p) => !p.isCameraOff);

  const contextValue: VideoContextValue = {
    isCameraOn,
    isMuted,
    isConnecting,
    permissionError,
    cameraPeers,
    currentParticipantId,
    currentDisplayName,
    toggleCamera,
    toggleMute,
    dismissError,
    getStream,
  };

  return <VideoContext.Provider value={contextValue}>{children}</VideoContext.Provider>;
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
    currentDisplayName: ctx.currentDisplayName || 'You',
    currentParticipantId: ctx.currentParticipantId || '',
    getStream: ctx.getStream,
  };
}
