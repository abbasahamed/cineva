import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { socketService } from '../../services/socket.js';
import {
  SOCKET_EVENTS,
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
  allPeers: VideoPeerDisplayState[];
  currentParticipantId?: string;
  currentDisplayName?: string;
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

    const mgr = new VideoCallManager({
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
            isCameraOff: false,
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
    }, currentParticipantId || '');

    managerRef.current = mgr;
    return mgr;
  }, [currentParticipantId]);

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

      // Connect to peers so we can send/receive media (one-way or two-way)
      for (const p of data.participants) {
        if (p.participantId !== currentParticipantId) {
          await mgr.initiateConnectionToPeer(p.participantId);
        }
      }
    };

    // 2. A remote peer in the room turned their camera ON
    const handlePeerJoined = async (data: { participant: VideoParticipant }) => {
      console.log('[VideoContext DIAG] handlePeerJoined received', {
        id: data.participant.participantId,
        displayName: data.participant.displayName,
        isCameraOff: data.participant.isCameraOff,
      });
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

    // 3. A remote peer turned off media or left
    const handlePeerLeft = (data: { participantId: string }) => {
      console.log('[VideoContext DIAG] handlePeerLeft received', data.participantId);
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
      console.log('[VideoContext DIAG] handlePeerState received', data);
      setRemotePeers((prev) => {
        const existing = prev.get(data.participantId);
        if (!existing) return prev;
        const next = new Map(prev);
        const stream = existing.stream || mgr.getStream(data.participantId) || null;
        const hasLiveVideo = !!(stream && stream.getVideoTracks().some((t) => t.readyState === 'live'));
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
      console.log('[VideoContext DIAG] handleOffer received from', data.fromParticipantId);
      setRemotePeers((prev) => {
        const next = new Map(prev);
        const existing = next.get(data.fromParticipantId);
        const stream = existing?.stream || mgr.getStream(data.fromParticipantId) || null;
        next.set(data.fromParticipantId, {
          participantId: data.fromParticipantId,
          displayName: data.fromDisplayName || existing?.displayName || 'Friend',
          isLocal: false,
          isMuted: existing?.isMuted ?? false,
          isCameraOff: existing?.isCameraOff ?? false,
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
      console.log('[VideoContext DIAG] handleAnswer received from', data.fromParticipantId);
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

  // Development React state diagnostic observer (item 8 in requirements)
  useEffect(() => {
    for (const [id, peer] of remotePeers.entries()) {
      console.log('[VideoContext DIAG] remotePeers state entry:', {
        participantId: id,
        displayName: peer.displayName,
        isCameraOff: peer.isCameraOff,
        connectionState: peer.connectionState,
        hasStream: Boolean(peer.stream),
        streamId: peer.stream?.id,
        videoTrackCount: peer.stream?.getVideoTracks().length || 0,
      });
    }
  }, [remotePeers]);

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

  // Filter peers to only those whose camera is currently ON or who have a live incoming stream
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
    toggleCamera,
    toggleMute,
    dismissError,
    getStream,
    getPeerDiagnostics,
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
    allPeers: ctx.allPeers,
    currentDisplayName: ctx.currentDisplayName || 'You',
    currentParticipantId: ctx.currentParticipantId || '',
    getStream: ctx.getStream,
    getPeerDiagnostics: ctx.getPeerDiagnostics,
  };
}
