import { useState, useEffect, useRef, useCallback } from 'react';
import { socketService } from '../services/socket.js';
import { abortRoom } from '../services/api.js';
import { srtToVtt } from '../utils/subtitleUtils.js';
import {
  PlaybackState,
  RoomInfo,
  ParticipantInfo,
  ChatMessage,
  RoomStateSnapshot,
  SOCKET_EVENTS,
  calculateExpectedPosition,
  DEFAULT_DRIFT_CONFIG,
} from '@cineva/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'ended' | 'error';

interface UseSyncWatchProps {
  roomCode: string;
  displayName: string;
  sessionId: string;
}

function dedupeParticipants(list: ParticipantInfo[]): ParticipantInfo[] {
  if (!Array.isArray(list)) return [];
  const map = new Map<string, ParticipantInfo>();
  for (const p of list) {
    if (p && p.sessionId && p.isOnline !== false) {
      map.set(p.sessionId, p);
    }
  }
  return Array.from(map.values());
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
  const [subtitleState, setSubtitleState] = useState<{ url: string; filename: string } | null>(null);
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
  const isTerminatedRef = useRef<boolean>(false);

  latestPlaybackRef.current = playback;
  const lastAppliedVersionRef = useRef<number>(0);
  const lastSeekTimeRef = useRef<number>(0);
  const lastActionTimeRef = useRef<number>(0);
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
      setParticipants(dedupeParticipants(snapshot.participants));

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
      const deduped = dedupeParticipants(data.participants);
      setParticipants(deduped);
      const me = deduped.find((p) => p.sessionId === sessionId);
      if (me) {
        const hostStatus = me.isHost || isHostRef.current;
        setIsHost(hostStatus);
        setCanControl(hostStatus || (room?.settings?.allowGuestControl ?? false));
      }
    };

    const onParticipantLeft = (data: { sessionId: string; participants: ParticipantInfo[] }) => {
      const deduped = dedupeParticipants(data.participants);
      setParticipants(deduped);
      const me = deduped.find((p) => p.sessionId === sessionId);
      if (me) {
        const hostStatus = me.isHost || isHostRef.current;
        setIsHost(hostStatus);
        setCanControl(hostStatus || (room?.settings?.allowGuestControl ?? false));
      }
    };

    const onParticipantKicked = (data: { kickedParticipantId: string; participants: ParticipantInfo[] }) => {
      const deduped = dedupeParticipants(data.participants);
      setParticipants(deduped);
      const myId = deduped.find((p) => p.sessionId === sessionId)?.id;
      if (data.kickedParticipantId === myId) {
        setConnectionStatus('ended');
        setErrorMessage('You have been removed from this room by the host.');
      }
    };

    const onRoomUpdated = (data: { room: RoomInfo }) => {
      if (isTerminatedRef.current) return;
      setRoom((prev) => {
        const next = data.room;
        if (!prev) return next;

        // Guard: don't overwrite a more advanced media state with a stale one.
        // If prev media is 'ready' or 'processing' and the incoming media is absent or 'failed',
        // keep the existing media state to prevent race-condition downgrades.
        const prevStatus = prev.media?.status;
        const nextMedia = next.media;
        if (nextMedia == null && prev.media != null) {
          // Incoming room:updated has no media info — preserve existing media
          return { ...next, media: prev.media };
        }
        if (
          prevStatus === 'ready' &&
          nextMedia != null &&
          nextMedia.status === 'failed' &&
          prev.media?.id === nextMedia.id
        ) {
          // A room:updated carrying a failed status for the SAME media record that we already
          // know is ready — this is a stale event. Preserve ready state.
          return { ...next, media: prev.media };
        }
        return next;
      });
      const hostStatus = (data.room?.hostSessionId ? data.room.hostSessionId === sessionId : false) || isHostRef.current;
      setIsHost(hostStatus);
      setCanControl(hostStatus || (data.room?.settings?.allowGuestControl ?? false));
    };

    const onRoomEnded = (data: { message: string }) => {
      isTerminatedRef.current = true;
      setConnectionStatus('ended');
      setErrorMessage(data.message || 'The host has ended this watch room.');
      if (videoRef.current) {
        videoRef.current.pause();
      }
    };

    const onRoomCancelled = (data: { message: string }) => {
      isTerminatedRef.current = true;
      setConnectionStatus('ended');
      setErrorMessage(data.message || 'The host has left the room. This screening has ended.');
      if (videoRef.current) {
        videoRef.current.pause();
      }
    };

    const onRoomNotFound = (data: { message: string }) => {
      isTerminatedRef.current = true;
      setConnectionStatus('error');
      setErrorMessage(data.message || 'Room not found.');
    };

    const onChatMessage = (message: ChatMessage) => {
      setChatMessages((prev) => [...prev, message]);
    };

    const onChatHistory = (history: ChatMessage[]) => {
      setChatMessages(history);
    };

    const onSubtitleState = (data: { filename: string; vttContent: string }) => {
      try {
        if (!data || !data.vttContent) return;
        const vttBlob = new Blob([data.vttContent], { type: 'text/vtt' });
        const url = URL.createObjectURL(vttBlob);
        setSubtitleState((prev) => {
          if (prev?.url) {
            URL.revokeObjectURL(prev.url);
          }
          return { url, filename: data.filename || 'Subtitles.srt' };
        });
      } catch (err) {
        console.warn('Failed to parse incoming room subtitles:', err);
      }
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
    socket.on(SOCKET_EVENTS.ROOM_CANCELLED, onRoomCancelled);
    socket.on(SOCKET_EVENTS.ROOM_NOT_FOUND, onRoomNotFound);
    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, onChatMessage);
    socket.on(SOCKET_EVENTS.CHAT_HISTORY, onChatHistory);
    socket.on(SOCKET_EVENTS.SUBTITLE_STATE, onSubtitleState);
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
      socket.off(SOCKET_EVENTS.ROOM_CANCELLED, onRoomCancelled);
      socket.off(SOCKET_EVENTS.ROOM_NOT_FOUND, onRoomNotFound);
      socket.off(SOCKET_EVENTS.CHAT_MESSAGE, onChatMessage);
      socket.off(SOCKET_EVENTS.CHAT_HISTORY, onChatHistory);
      socket.off(SOCKET_EVENTS.SUBTITLE_STATE, onSubtitleState);
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
      const now = Date.now();

      // Multi-tier Proportional Rate Controller & Fast Seek Catchup:
      if (absDrift >= 1.2) {
        // Severe drift (>= 1.2s): Hard snap with 600ms cooldown
        if (now - lastSeekTimeRef.current > 600) {
          lastSeekTimeRef.current = now;
          try {
            if ('fastSeek' in video && typeof (video as any).fastSeek === 'function') {
              (video as any).fastSeek(expected);
            } else {
              video.currentTime = expected;
            }
          } catch {
            video.currentTime = expected;
          }
          video.playbackRate = currentPB.playbackRate;
        } else {
          const rateMultiplier = drift > 0 ? 1.35 : 0.65;
          video.playbackRate = currentPB.playbackRate * rateMultiplier;
        }
      } else if (absDrift < 0.12) {
        // Imperceptible drift (< 120ms): Perfect sync lock
        if (video.playbackRate !== currentPB.playbackRate) {
          video.playbackRate = currentPB.playbackRate;
        }
      } else if (absDrift < 0.40) {
        // Minor drift (120ms - 400ms): Gentle ±8% rate adjustment
        const rateMultiplier = drift > 0 ? 1.08 : 0.92;
        video.playbackRate = currentPB.playbackRate * rateMultiplier;
      } else {
        // Moderate drift (400ms - 1.2s): Responsive ±25% catch-up
        const rateMultiplier = drift > 0 ? 1.25 : 0.75;
        video.playbackRate = currentPB.playbackRate * rateMultiplier;
      }
    }, 250);

    return () => clearInterval(interval);
  }, []);

  // Controls triggered by user
  const handlePlay = useCallback(() => {
    const now = Date.now();
    if (now - lastActionTimeRef.current < 150 && latestPlaybackRef.current.isPlaying) return;
    lastActionTimeRef.current = now;

    const video = videoRef.current;
    const currentPos = video && Number.isFinite(video.currentTime)
      ? video.currentTime
      : latestPlaybackRef.current.position;

    const optimistic: PlaybackState = {
      ...latestPlaybackRef.current,
      isPlaying: true,
      position: currentPos,
      lastUpdatedAt: now,
    };
    setPlayback(optimistic);
    latestPlaybackRef.current = optimistic;

    if (video) {
      video.playbackRate = optimistic.playbackRate;
      if (video.paused) { video.play().catch(() => {}); }
    }

    socketService.emitPlay(currentPos, optimistic.playbackRate);
    setNeedsUserGesture(false);
  }, []);

  const handlePause = useCallback(() => {
    const now = Date.now();
    if (now - lastActionTimeRef.current < 150 && !latestPlaybackRef.current.isPlaying) return;
    lastActionTimeRef.current = now;

    const video = videoRef.current;
    const currentPos = video && Number.isFinite(video.currentTime)
      ? video.currentTime
      : latestPlaybackRef.current.position;

    const optimistic: PlaybackState = {
      ...latestPlaybackRef.current,
      isPlaying: false,
      position: currentPos,
      lastUpdatedAt: now,
    };
    setPlayback(optimistic);
    latestPlaybackRef.current = optimistic;

    if (video && !video.paused) { video.pause(); }

    socketService.emitPause(currentPos);
  }, []);

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

    lastSeekTimeRef.current = Date.now();

    if (video) {
      try {
        if ('fastSeek' in video && typeof (video as any).fastSeek === 'function') {
          (video as any).fastSeek(targetPos);
        } else {
          video.currentTime = targetPos;
        }
      } catch {
        video.currentTime = targetPos;
      }
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
    isTerminatedRef.current = true;
    if (room?.id && sessionId) {
      abortRoom(room.id, sessionId).catch(() => {});
    }
    socketService.emitEndRoom();
    setConnectionStatus('ended');
  }, [room?.id, sessionId]);

  const handleLeaveRoom = useCallback(() => {
    isTerminatedRef.current = true;
    if (isHostRef.current) {
      if (room?.id && sessionId) {
        abortRoom(room.id, sessionId).catch(() => {});
      }
      socketService.emitEndRoom();
    } else {
      socketService.emitLeaveRoom();
    }
    setTimeout(() => {
      socketService.disconnect();
    }, 50);
    setConnectionStatus('ended');
  }, [room?.id, sessionId]);



  const handleMediaRetry = useCallback(() => {
    socketService.emitMediaRetry();
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

  const handleUploadSubtitle = useCallback(async (file: File) => {
    try {
      const rawText = await file.text();
      const vttContent = srtToVtt(rawText);
      const vttBlob = new Blob([vttContent], { type: 'text/vtt' });
      const url = URL.createObjectURL(vttBlob);

      setSubtitleState((prev) => {
        if (prev?.url) {
          URL.revokeObjectURL(prev.url);
        }
        return { url, filename: file.name };
      });

      // Broadcast to room members so everyone sees subtitles
      const socket = socketService.getSocket();
      if (socket && socket.connected) {
        socket.emit(SOCKET_EVENTS.SUBTITLE_UPDATE, {
          filename: file.name,
          vttContent,
        });
      }
    } catch (err) {
      console.error('Failed to process subtitle file:', err);
    }
  }, []);

  return {
    videoRef,
    room,
    playback,
    participants,
    chatMessages,
    subtitleState,
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
    handleLeaveRoom,
    handleMediaRetry,
    handleUserGestureStart,
    handleUploadSubtitle,
  };
}
