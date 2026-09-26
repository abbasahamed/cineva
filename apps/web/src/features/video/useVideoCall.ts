import { useState, useEffect, useRef, useCallback } from 'react';
import { socketService } from '../../services/socket.js';
import {
  SOCKET_EVENTS,
  VideoParticipant,
  RelayedVideoOfferPayload,
  RelayedVideoAnswerPayload,
  RelayedVideoIceCandidatePayload,
  RelayedVideoStatePayload,
} from '@syncwatch/shared';
import {
  VideoCallControls,
  VideoCallConnectionStatus,
  PermissionErrorType,
  RemotePeerState,
} from './videoCallTypes.js';
import { VideoCallManager } from './videoCallManager.js';

interface UseVideoCallOptions {
  roomCode: string;
  currentParticipantId?: string;
  currentDisplayName?: string;
}

export function useVideoCall({
  roomCode,
  currentParticipantId,
  currentDisplayName,
}: UseVideoCallOptions): VideoCallControls {
  const [isCallActive, setIsCallActive] = useState<boolean>(false);
  const [status, setStatus] = useState<VideoCallConnectionStatus>('idle');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [permissionErrorType, setPermissionErrorType] = useState<PermissionErrorType | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<Map<string, RemotePeerState>>(new Map());
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isCameraOff, setIsCameraOff] = useState<boolean>(false);

  const managerRef = useRef<VideoCallManager | null>(null);

  // Helper to update remote peers state immutably
  const updateRemotePeer = useCallback(
    (participantId: string, updater: (prev: RemotePeerState | undefined) => RemotePeerState | null) => {
      setRemotePeers((prev) => {
        const next = new Map(prev);
        const current = next.get(participantId);
        const updated = updater(current);
        if (updated === null) {
          next.delete(participantId);
        } else {
          next.set(participantId, updated);
        }
        return next;
      });
    },
    []
  );

  const leaveCall = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.cleanup();
      managerRef.current = null;
    }
    socketService.emitVideoLeave();
    setIsCallActive(false);
    setStatus('idle');
    setLocalStream(null);
    setRemotePeers(new Map());
    setIsMuted(false);
    setIsCameraOff(false);
    setPermissionError(null);
    setPermissionErrorType(null);
  }, []);

  const startCall = useCallback(async () => {
    if (!VideoCallManager.isSupported()) {
      setStatus('unsupported');
      setPermissionError('Your browser does not support WebRTC video calling.');
      setPermissionErrorType('UNSUPPORTED');
      return;
    }

    setStatus('requesting-permissions');
    setPermissionError(null);
    setPermissionErrorType(null);

    const manager = new VideoCallManager({
      onRemoteStream: (participantId, stream) => {
        updateRemotePeer(participantId, (prev) => {
          if (!prev) return null;
          return {
            ...prev,
            stream,
            connectionState: 'connected',
          };
        });
      },
      onRemotePeerLeft: (participantId) => {
        updateRemotePeer(participantId, () => null);
      },
      onConnectionStateChange: (participantId, connectionState) => {
        updateRemotePeer(participantId, (prev) => {
          if (!prev) return null;
          return {
            ...prev,
            connectionState,
          };
        });
      },
      onError: (err) => {
        console.warn('WebRTC Manager Warning:', err);
      },
    });

    try {
      const stream = await manager.acquireLocalMedia();
      managerRef.current = manager;
      setLocalStream(stream);
      setIsCallActive(true);
      setStatus('connecting');

      // Inform server via Socket.IO that we joined the video call
      socketService.emitVideoJoin();
    } catch (err: any) {
      console.warn('Camera/Microphone Permission Error:', err);
      setStatus('error');
      manager.cleanup();

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionError('Camera and microphone access was denied. Please allow permissions in your browser.');
        setPermissionErrorType('BOTH_DENIED');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setPermissionError('No camera or microphone was detected on this device.');
        setPermissionErrorType('DEVICE_NOT_FOUND');
      } else {
        setPermissionError(err.message || 'Unable to access media devices.');
        setPermissionErrorType('UNKNOWN');
      }
    }
  }, [updateRemotePeer]);

  const toggleMute = useCallback(() => {
    if (!managerRef.current) return;
    const newMuted = !isMuted;
    managerRef.current.setMute(newMuted);
    setIsMuted(newMuted);
    socketService.emitVideoStateUpdate({ isMuted: newMuted });
  }, [isMuted]);

  const toggleCamera = useCallback(() => {
    if (!managerRef.current) return;
    const newCameraOff = !isCameraOff;
    managerRef.current.setCameraOff(newCameraOff);
    setIsCameraOff(newCameraOff);
    socketService.emitVideoStateUpdate({ isCameraOff: newCameraOff });
  }, [isCameraOff]);

  // Handle Socket.IO Signaling Events
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket || !isCallActive) return;

    // 1. Existing participants received upon joining call
    const handleParticipants = async (data: { participants: VideoParticipant[] }) => {
      setStatus('connected');
      for (const p of data.participants) {
        updateRemotePeer(p.participantId, () => ({
          participant: p,
          stream: null,
          connectionState: 'new',
          isMuted: p.isMuted,
          isCameraOff: p.isCameraOff,
        }));

        // The joining peer initiates offer to existing peers
        if (managerRef.current) {
          await managerRef.current.initiateConnectionToPeer(p.participantId);
        }
      }
    };

    // 2. A new peer joined the video call
    const handlePeerJoined = (data: { participant: VideoParticipant }) => {
      updateRemotePeer(data.participant.participantId, () => ({
        participant: data.participant,
        stream: null,
        connectionState: 'new',
        isMuted: data.participant.isMuted,
        isCameraOff: data.participant.isCameraOff,
      }));
    };

    // 3. A peer left the video call
    const handlePeerLeft = (data: { participantId: string }) => {
      if (managerRef.current) {
        managerRef.current.closePeerConnection(data.participantId);
      }
      updateRemotePeer(data.participantId, () => null);
    };

    // 4. Inbound SDP Offer
    const handleOffer = async (data: RelayedVideoOfferPayload) => {
      updateRemotePeer(data.fromParticipantId, (prev) => {
        if (prev) return prev;
        return {
          participant: {
            participantId: data.fromParticipantId,
            displayName: data.fromDisplayName,
            isMuted: false,
            isCameraOff: false,
            joinedAt: Date.now(),
          },
          stream: null,
          connectionState: 'connecting',
          isMuted: false,
          isCameraOff: false,
        };
      });

      if (managerRef.current) {
        await managerRef.current.handleIncomingOffer(data.fromParticipantId, data.sdp);
      }
    };

    // 5. Inbound SDP Answer
    const handleAnswer = async (data: RelayedVideoAnswerPayload) => {
      if (managerRef.current) {
        await managerRef.current.handleIncomingAnswer(data.fromParticipantId, data.sdp);
      }
    };

    // 6. Inbound ICE Candidate
    const handleIceCandidate = async (data: RelayedVideoIceCandidatePayload) => {
      if (managerRef.current) {
        await managerRef.current.handleIncomingIceCandidate(data.fromParticipantId, data.candidate);
      }
    };

    // 7. Peer mute/camera state update
    const handlePeerState = (data: RelayedVideoStatePayload) => {
      updateRemotePeer(data.participantId, (prev) => {
        if (!prev) return null;
        return {
          ...prev,
          isMuted: typeof data.isMuted === 'boolean' ? data.isMuted : prev.isMuted,
          isCameraOff: typeof data.isCameraOff === 'boolean' ? data.isCameraOff : prev.isCameraOff,
        };
      });
    };

    socket.on(SOCKET_EVENTS.VIDEO_PARTICIPANTS, handleParticipants);
    socket.on(SOCKET_EVENTS.VIDEO_PEER_JOINED, handlePeerJoined);
    socket.on(SOCKET_EVENTS.VIDEO_PEER_LEFT, handlePeerLeft);
    socket.on(SOCKET_EVENTS.VIDEO_OFFER, handleOffer);
    socket.on(SOCKET_EVENTS.VIDEO_ANSWER, handleAnswer);
    socket.on(SOCKET_EVENTS.VIDEO_ICE_CANDIDATE, handleIceCandidate);
    socket.on(SOCKET_EVENTS.VIDEO_PEER_STATE, handlePeerState);

    return () => {
      socket.off(SOCKET_EVENTS.VIDEO_PARTICIPANTS, handleParticipants);
      socket.off(SOCKET_EVENTS.VIDEO_PEER_JOINED, handlePeerJoined);
      socket.off(SOCKET_EVENTS.VIDEO_PEER_LEFT, handlePeerLeft);
      socket.off(SOCKET_EVENTS.VIDEO_OFFER, handleOffer);
      socket.off(SOCKET_EVENTS.VIDEO_ANSWER, handleAnswer);
      socket.off(SOCKET_EVENTS.VIDEO_ICE_CANDIDATE, handleIceCandidate);
      socket.off(SOCKET_EVENTS.VIDEO_PEER_STATE, handlePeerState);
    };
  }, [isCallActive, updateRemotePeer]);

  // Cleanup on unmount or room leave
  useEffect(() => {
    return () => {
      if (managerRef.current) {
        managerRef.current.cleanup();
        managerRef.current = null;
      }
    };
  }, []);

  return {
    isCallActive,
    isConnecting: status === 'requesting-permissions' || status === 'connecting',
    status,
    permissionError,
    permissionErrorType,
    localStream,
    remotePeers,
    isMuted,
    isCameraOff,
    startCall,
    leaveCall,
    toggleMute,
    toggleCamera,
  };
}
