import { useState, useEffect, useRef, useCallback } from 'react';
import { socketService } from '../services/socket.js';
import {
  PlaybackState,
  RoomInfo,
  ParticipantInfo,
  ChatMessage,
  RoomStateSnapshot,
  SOCKET_EVENTS,
  calculateExpectedPosition,
  DEFAULT_DRIFT_CONFIG,
} from '@syncwatch/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'ended' | 'error';

interface UseSyncWatchProps {
  roomCode: string;
  displayName: string;
  sessionId: string;
}

export function useSyncWatch({ roomCode, displayName, sessionId }: UseSyncWatchProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [canControl, setCanControl] = useState<boolean>(false);
  const [needsUserGesture, setNeedsUserGesture] = useState<boolean>(false);
  const [rtt, setRtt] = useState<number>(0);

  // Authoritative playback state
  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    position: 0,
    lastUpdatedAt: Date.now(),
    playbackRate: 1.0,
    version: 0,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const latestPlaybackRef = useRef<PlaybackState>(playback);
  const isHostRef = useRef<boolean>(isHost);
  const canControlRef = useRef<boolean>(canControl);
  const isSeekingLocallyRef = useRef<boolean>(false);
  const lastLocalSeekRef = useRef<{ targetTime: number; timestamp: number } | null>(null);

  latestPlaybackRef.current = playback;
  isHostRef.current = isHost;
  canControlRef.current = canControl;

  // Apply playback state directly to HTML5 video element
  const applyPlaybackToVideo = useCallback((targetState: PlaybackState) => {
    const video = videoRef.current;
    if (!video || isSeekingLocallyRef.current) return;

    // Reject non-finite positions
    if (targetState.position === undefined || targetState.position === null || !Number.isFinite(targetState.position) || targetState.position < 0) {
      return;
    }

    const estimatedServerNow = socketService.getEstimatedServerTime();
    const rawExpected = calculateExpectedPosition(targetState, estimatedServerNow);
    if (!Number.isFinite(rawExpected) || rawExpected < 0) return;

    const actualDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
    const expected = actualDuration > 0 ? Math.min(rawExpected, actualDuration) : rawExpected;

    // Ignore stale state if a recent local seek occurred within 2.5 seconds
    if (lastLocalSeekRef.current) {
      const elapsedSinceSeek = Date.now() - lastLocalSeekRef.current.timestamp;
      if (elapsedSinceSeek < 2500) {
        const diffFromLocalSeek = Math.abs(expected - lastLocalSeekRef.current.targetTime);
        if (diffFromLocalSeek > 1.5 && targetState.version <= latestPlaybackRef.current.version) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('REMOTE_SEEK_IGNORED:', 'Stale server position predates local seek', {
              incomingPosition: expected,
              localSeekTarget: lastLocalSeekRef.current.targetTime,
            });
          }
          return;
        }
      } else {
        lastLocalSeekRef.current = null;
      }
    }

    const drift = Math.abs(video.currentTime - expected);

    if (process.env.NODE_ENV !== 'production') {
      console.log('REMOTE_PLAYBACK:', {
        serverCurrentTime: expected,
        localCurrentTime: video.currentTime,
        drift,
        isPlaying: targetState.isPlaying,
      });
    }

    if (targetState.isPlaying) {
      if (drift > 0.3) {
        video.currentTime = expected;
      }
      video.playbackRate = targetState.playbackRate;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Autoplay blocked by browser policy:', err);
          if (video) {
            video.muted = true;
            video.play().then(() => {
              setNeedsUserGesture(true);
            }).catch(() => {
              setNeedsUserGesture(true);
            });
          }
        });
      }
    } else {
      video.pause();
      if (drift > 0.3) {
        video.currentTime = expected;
      }
    }
  }, []);

  // Main Socket Connection Lifecycle
  useEffect(() => {
    const socket = socketService.connect();

    const onConnect = () => {
      setConnectionStatus('connected');
      setErrorMessage(null);
      // Join Room
      socketService.joinRoom(roomCode, displayName, sessionId);
    };

    const onDisconnect = () => {
      setConnectionStatus('reconnecting');
    };

    const onConnectError = (err: any) => {
      console.error('Socket connection error:', err);
      setConnectionStatus('error');
      setErrorMessage(err.message || 'Unable to connect to synchronization server');
    };

    const onRoomState = (snapshot: RoomStateSnapshot) => {
      setConnectionStatus('connected');
      setRoom(snapshot.room);
      setParticipants(snapshot.participants);

      // Authoritative Host Determination:
      // 1. Check if the authoritative room.hostSessionId matches the client sessionId
      // 2. Check if the participant matching client sessionId has isHost === true
      // 3. Fallback to snapshot.isHost if explicit boolean
      const hostStatus =
        (snapshot.room?.hostSessionId ? snapshot.room.hostSessionId === sessionId : false) ||
        (snapshot.participants?.find((p) => p.sessionId === sessionId)?.isHost ?? false) ||
        (snapshot.isHost === true);

      setIsHost(hostStatus);
      setCanControl(hostStatus || (snapshot.room?.settings?.allowGuestControl ?? false));

      // Handle initial video state
      if (snapshot.playback && snapshot.playback.version >= latestPlaybackRef.current.version) {
        setPlayback(snapshot.playback);
        latestPlaybackRef.current = snapshot.playback;
        applyPlaybackToVideo(snapshot.playback);
      }
    };

    const onPlaybackState = (data: { playback: PlaybackState; serverTimestamp: number }) => {
      const incoming = data.playback;
      // Stale state rejection
      if (incoming.version < latestPlaybackRef.current.version) {
        console.warn(`Ignoring stale state version ${incoming.version} vs current ${latestPlaybackRef.current.version}`);
        return;
      }

      setPlayback(incoming);
      latestPlaybackRef.current = incoming;
      applyPlaybackToVideo(incoming);
    };

    const onParticipantJoined = (data: { participant: ParticipantInfo; participants: ParticipantInfo[] }) => {
      setParticipants(data.participants);
      const me = data.participants.find((p) => p.sessionId === sessionId);
      if (me) {
        const hostStatus = me.isHost || isHostRef.current;
        setIsHost(hostStatus);
        setCanControl(hostStatus || (room?.settings?.allowGuestControl ?? false));
      }
    };

    const onParticipantLeft = (data: { sessionId: string; participants: ParticipantInfo[] }) => {
      setParticipants(data.participants);
      const me = data.participants.find((p) => p.sessionId === sessionId);
      if (me) {
        const hostStatus = me.isHost || isHostRef.current;
        setIsHost(hostStatus);
        setCanControl(hostStatus || (room?.settings?.allowGuestControl ?? false));
      }
    };

    const onParticipantKicked = (data: { kickedParticipantId: string; participants: ParticipantInfo[] }) => {
      setParticipants(data.participants);
      const myId = participants.find((p) => p.sessionId === sessionId)?.id;
      if (data.kickedParticipantId === myId) {
        setConnectionStatus('ended');
        setErrorMessage('You have been removed from this room by the host.');
      }
    };

    const onRoomUpdated = (data: { room: RoomInfo }) => {
      setRoom(data.room);
      const hostStatus = (data.room?.hostSessionId ? data.room.hostSessionId === sessionId : false) || isHostRef.current;
      setIsHost(hostStatus);
      setCanControl(hostStatus || (data.room?.settings?.allowGuestControl ?? false));
    };

    const onRoomEnded = (data: { message: string }) => {
      setConnectionStatus('ended');
      setErrorMessage(data.message || 'The host has ended this watch room.');
      if (videoRef.current) {
        videoRef.current.pause();
      }
    };

    const onRoomNotFound = (data: { message: string }) => {
      setConnectionStatus('error');
      setErrorMessage(data.message || 'Room not found.');
    };

    const onChatMessage = (message: ChatMessage) => {
      setChatMessages((prev) => [...prev, message]);
    };

    const onChatHistory = (history: ChatMessage[]) => {
      setChatMessages(history);
    };

    const onError = (data: { message: string }) => {
      console.warn('Sync server error:', data.message);
    };

    const onMediaProcessing = (data: { roomId: string; status: string; progress: number; speed?: string; etaSeconds?: number; stage?: string; media?: any }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const baseMedia = data.media || prev.media || {
          id: `media_${Date.now()}`,
          roomId: prev.id,
          title: 'Processing Video...',
          filename: 'video',
          mimeType: 'video/mp4',
          size: '0',
          url: '',
          status: 'processing',
          transcodeProgress: data.progress,
          speed: data.speed,
          etaSeconds: data.etaSeconds,
          stage: data.stage,
          createdAt: new Date().toISOString(),
        };
        return {
          ...prev,
          media: {
            ...baseMedia,
            status: 'processing',
            transcodeProgress: data.progress,
            speed: data.speed,
            etaSeconds: data.etaSeconds,
            stage: data.stage,
          },
        };
      });
    };

    const onMediaProgress = (data: { roomId: string; status: string; progress: number; speed?: string; etaSeconds?: number; stage?: string }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const baseMedia = prev.media || {
          id: `media_${Date.now()}`,
          roomId: prev.id,
          title: 'Processing Video...',
          filename: 'video',
          mimeType: 'video/mp4',
          size: '0',
          url: '',
          status: 'processing',
          transcodeProgress: data.progress,
          speed: data.speed,
          etaSeconds: data.etaSeconds,
          stage: data.stage,
          createdAt: new Date().toISOString(),
        };
        return {
          ...prev,
          media: {
            ...baseMedia,
            status: 'processing',
            transcodeProgress: data.progress,
            speed: data.speed,
            etaSeconds: data.etaSeconds,
            stage: data.stage,
          },
        };
      });
    };

    const onMediaReady = (data: { roomId: string; status: string; progress: number; media: any }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          media: data.media,
        };
      });
    };

    const onMediaFailed = (data: { roomId: string; status: string; progress: number; error: string }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const baseMedia = prev.media || {
          id: `media_${Date.now()}`,
          roomId: prev.id,
          title: 'Failed Video',
          filename: 'video',
          mimeType: 'video/mp4',
          size: '0',
          url: '',
          status: 'failed',
          transcodeError: data.error,
          createdAt: new Date().toISOString(),
        };
        return {
          ...prev,
          media: {
            ...baseMedia,
            status: 'failed',
            transcodeError: data.error,
          },
        };
      });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on(SOCKET_EVENTS.ROOM_STATE, onRoomState);
    socket.on(SOCKET_EVENTS.PLAYBACK_STATE, onPlaybackState);
    socket.on(SOCKET_EVENTS.PARTICIPANT_JOINED, onParticipantJoined);
    socket.on(SOCKET_EVENTS.PARTICIPANT_LEFT, onParticipantLeft);
    socket.on(SOCKET_EVENTS.PARTICIPANT_KICKED, onParticipantKicked);
    socket.on('room:updated', onRoomUpdated);
    socket.on(SOCKET_EVENTS.ROOM_ENDED, onRoomEnded);
    socket.on(SOCKET_EVENTS.ROOM_NOT_FOUND, onRoomNotFound);
    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, onChatMessage);
    socket.on(SOCKET_EVENTS.CHAT_HISTORY, onChatHistory);
    socket.on(SOCKET_EVENTS.MEDIA_PROCESSING, onMediaProcessing);
    socket.on(SOCKET_EVENTS.MEDIA_PROGRESS, onMediaProgress);
    socket.on(SOCKET_EVENTS.MEDIA_READY, onMediaReady);
    socket.on(SOCKET_EVENTS.MEDIA_FAILED, onMediaFailed);
    socket.on(SOCKET_EVENTS.ERROR, onError);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off(SOCKET_EVENTS.ROOM_STATE, onRoomState);
      socket.off(SOCKET_EVENTS.PLAYBACK_STATE, onPlaybackState);
      socket.off(SOCKET_EVENTS.PARTICIPANT_JOINED, onParticipantJoined);
      socket.off(SOCKET_EVENTS.PARTICIPANT_LEFT, onParticipantLeft);
      socket.off(SOCKET_EVENTS.PARTICIPANT_KICKED, onParticipantKicked);
      socket.off('room:updated', onRoomUpdated);
      socket.off(SOCKET_EVENTS.ROOM_ENDED, onRoomEnded);
      socket.off(SOCKET_EVENTS.ROOM_NOT_FOUND, onRoomNotFound);
      socket.off(SOCKET_EVENTS.CHAT_MESSAGE, onChatMessage);
      socket.off(SOCKET_EVENTS.CHAT_HISTORY, onChatHistory);
      socket.off(SOCKET_EVENTS.MEDIA_PROCESSING, onMediaProcessing);
      socket.off(SOCKET_EVENTS.MEDIA_PROGRESS, onMediaProgress);
      socket.off(SOCKET_EVENTS.MEDIA_READY, onMediaReady);
      socket.off(SOCKET_EVENTS.MEDIA_FAILED, onMediaFailed);
      socket.off(SOCKET_EVENTS.ERROR, onError);
    };
  }, [roomCode, displayName, sessionId, applyPlaybackToVideo]);

  // Periodic Drift Correction Loop (Runs every 500ms)
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      const currentPB = latestPlaybackRef.current;

      setRtt(socketService.getRTT());

      if (!video || !currentPB.isPlaying || isSeekingLocallyRef.current || video.paused) {
        return;
      }

      const estimatedServerNow = socketService.getEstimatedServerTime();
      const expected = calculateExpectedPosition(currentPB, estimatedServerNow);
      const actual = video.currentTime;
      const drift = expected - actual; // Positive = video is behind; Negative = video is ahead

      const absDrift = Math.abs(drift);

      if (absDrift < DEFAULT_DRIFT_CONFIG.minThreshold) {
        // Less than 0.25s: Perfect sync, maintain target playbackRate
        if (video.playbackRate !== currentPB.playbackRate) {
          video.playbackRate = currentPB.playbackRate;
        }
      } else if (absDrift < DEFAULT_DRIFT_CONFIG.maxThreshold) {
        // Between 0.25s and 1.00s: Gentle rate nudging (no jarring seek jumps)
        if (drift > 0) {
          // Video is lagging behind -> accelerate slightly (1.05x)
          video.playbackRate = currentPB.playbackRate * DEFAULT_DRIFT_CONFIG.rateNudgeHigh;
        } else {
          // Video is racing ahead -> decelerate slightly (0.95x)
          video.playbackRate = currentPB.playbackRate * DEFAULT_DRIFT_CONFIG.rateNudgeLow;
        }
      } else {
        // Severe drift >= 1.0s: Controlled seek to exact expected position
        video.currentTime = expected;
        video.playbackRate = currentPB.playbackRate;
      }
    }, DEFAULT_DRIFT_CONFIG.syncIntervalMs);

    return () => clearInterval(interval);
  }, []);

  // Controls triggered by user
  const handlePlay = useCallback(() => {
    const video = videoRef.current;
    const currentPos = video ? video.currentTime : playback.position;
    socketService.emitPlay(currentPos, playback.playbackRate);
    setNeedsUserGesture(false);
  }, [playback.position, playback.playbackRate]);

  const handlePause = useCallback(() => {
    const video = videoRef.current;
    const currentPos = video ? video.currentTime : playback.position;
    socketService.emitPause(currentPos);
  }, [playback.position]);

  const handleSeek = useCallback((newPosition: number) => {
    if (!Number.isFinite(newPosition)) return;

    const video = videoRef.current;
    const actualDuration = video && Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : (room?.media?.duration || 0);

    const targetPos = actualDuration > 0
      ? Math.max(0, Math.min(newPosition, actualDuration))
      : Math.max(0, newPosition);

    if (process.env.NODE_ENV !== 'production') {
      console.log('LOCAL_SEEK:', {
        from: video ? video.currentTime : playback.position,
        to: targetPos,
      });
    }

    isSeekingLocallyRef.current = false;
    lastLocalSeekRef.current = {
      targetTime: targetPos,
      timestamp: Date.now(),
    };

    if (video) {
      video.currentTime = targetPos;
    }

    const newPlaybackState: PlaybackState = {
      ...latestPlaybackRef.current,
      position: targetPos,
      lastUpdatedAt: Date.now(),
      version: latestPlaybackRef.current.version + 1,
    };

    setPlayback(newPlaybackState);
    latestPlaybackRef.current = newPlaybackState;

    socketService.emitSeek(targetPos);
  }, [room?.media?.duration, playback.position]);

  const handleLocalScrubPreview = useCallback((previewPosition: number) => {
    isSeekingLocallyRef.current = true;
    if (videoRef.current) {
      videoRef.current.currentTime = previewPosition;
    }
  }, []);

  const handlePlaybackRate = useCallback((rate: number) => {
    socketService.emitPlaybackRate(rate);
  }, []);

  const handleSendMessage = useCallback((msg: string) => {
    socketService.emitChatMessage(msg);
  }, []);

  const handleUpdateSettings = useCallback((settings: { allowGuestControl?: boolean }) => {
    socketService.emitUpdateSettings(settings);
  }, []);

  const handleUpdateTitle = useCallback((title: string) => {
    socketService.emitUpdateTitle(title);
  }, []);

  const handleKickParticipant = useCallback((participantId: string) => {
    socketService.emitKickParticipant(participantId);
  }, []);

  const handleEndRoom = useCallback(() => {
    socketService.emitEndRoom();
  }, []);

  const handleUserGestureStart = useCallback(() => {
    setNeedsUserGesture(false);
    const video = videoRef.current;
    if (video) {
      video.muted = false;
      video.volume = 0.8;
      applyPlaybackToVideo(latestPlaybackRef.current);
    }
  }, [applyPlaybackToVideo]);

  return {
    videoRef,
    room,
    playback,
    participants,
    chatMessages,
    isHost,
    canControl,
    connectionStatus,
    errorMessage,
    needsUserGesture,
    rtt,
    handlePlay,
    handlePause,
    handleSeek,
    handleLocalScrubPreview,
    handlePlaybackRate,
    handleSendMessage,
    handleUpdateSettings,
    handleUpdateTitle,
    handleKickParticipant,
    handleEndRoom,
    handleUserGestureStart,
  };
}
