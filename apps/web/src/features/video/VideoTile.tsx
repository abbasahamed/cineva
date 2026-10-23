import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Mic, MicOff, VideoOff, WifiOff } from 'lucide-react';

export interface VideoTileProps {
  displayName: string;
  participantId?: string;
  stream?: MediaStream | null;
  isLocal?: boolean;
  isMuted?: boolean;
  isCameraOff?: boolean;
  connectionState?: RTCPeerConnectionState;
  getStream?: (participantId: string, isLocal?: boolean) => MediaStream | null;
}

export const VideoTile: React.FC<VideoTileProps> = React.memo(({
  displayName,
  participantId,
  stream,
  isLocal = false,
  isMuted = false,
  isCameraOff = false,
  connectionState = 'connected',
  getStream,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [videoMetrics, setVideoMetrics] = useState({
    videoWidth: 0,
    videoHeight: 0,
    readyState: 0,
    paused: true,
  });

  const streamFromManager = getStream ? getStream(participantId || '', isLocal) : null;
  const resolvedStream = streamFromManager || (stream !== undefined ? stream : null);
  const videoTrack = resolvedStream ? resolvedStream.getVideoTracks()[0] : null;

  const hasStream = !!resolvedStream;
  const videoTrackCount = resolvedStream ? resolvedStream.getVideoTracks().length : 0;
  const videoTrackReadyState = videoTrack ? videoTrack.readyState : 'none';
  const videoTrackEnabled = videoTrack ? videoTrack.enabled : false;
  const srcObjectAssigned = !!(videoRef.current && videoRef.current.srcObject);
  const readyState = videoRef.current ? Math.max(videoRef.current.readyState, videoMetrics.readyState) : videoMetrics.readyState;
  const videoWidth = videoRef.current ? Math.max(videoRef.current.videoWidth, videoMetrics.videoWidth) : videoMetrics.videoWidth;
  const videoHeight = videoRef.current ? Math.max(videoRef.current.videoHeight, videoMetrics.videoHeight) : videoMetrics.videoHeight;

  // Single Definitive Remote Video State Log per Section 2
  useEffect(() => {
    if (isLocal) return;
    console.log('[VideoTile] REMOTE_VIDEO_STATE', {
      participantId: participantId || 'unknown',
      connectionState,
      hasStream,
      videoTrackCount,
      videoTrackReadyState,
      videoTrackEnabled,
      srcObjectAssigned,
      readyState,
      videoWidth,
      videoHeight,
    });
  }, [
    isLocal,
    participantId,
    connectionState,
    hasStream,
    videoTrackCount,
    videoTrackReadyState,
    videoTrackEnabled,
    srcObjectAssigned,
    readyState,
    videoWidth,
    videoHeight,
  ]);

  const updateMetrics = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setVideoMetrics((prev) => {
      if (
        prev.videoWidth === el.videoWidth &&
        prev.videoHeight === el.videoHeight &&
        prev.readyState === el.readyState &&
        prev.paused === el.paused
      ) {
        return prev;
      }
      return {
        videoWidth: el.videoWidth,
        videoHeight: el.videoHeight,
        readyState: el.readyState,
        paused: el.paused,
      };
    });
  }, []);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (!isLocal && isCameraOff) {
      if (videoElement.srcObject) {
        videoElement.srcObject = null;
        updateMetrics();
      }
      return;
    }
    if (resolvedStream && videoElement.srcObject !== resolvedStream) {
      videoElement.srcObject = resolvedStream;
      videoElement
        .play()
        .then(() => {
          updateMetrics();
          console.log('[VideoTile DIAG] video.play() resolved', {
            participantId: participantId || (isLocal ? 'local' : 'unknown'),
            paused: videoElement.paused,
            readyState: videoElement.readyState,
            videoWidth: videoElement.videoWidth,
            videoHeight: videoElement.videoHeight,
          });
        })
        .catch((err: any) => {
          console.warn(
            `[VideoTile DIAG] video.play() rejected for ${participantId || (isLocal ? 'local' : 'unknown')}:`,
            err?.name || 'DOMException',
            err?.message || err
          );
        });
    } else if (!resolvedStream && videoElement.srcObject) {
      videoElement.srcObject = null;
      updateMetrics();
    }

    videoElement.addEventListener('loadedmetadata', updateMetrics);
    videoElement.addEventListener('loadeddata', updateMetrics);
    videoElement.addEventListener('canplay', updateMetrics);
    videoElement.addEventListener('playing', updateMetrics);
    videoElement.addEventListener('resize', updateMetrics);
    videoElement.addEventListener('timeupdate', updateMetrics);

    return () => {
      videoElement.removeEventListener('loadedmetadata', updateMetrics);
      videoElement.removeEventListener('loadeddata', updateMetrics);
      videoElement.removeEventListener('canplay', updateMetrics);
      videoElement.removeEventListener('playing', updateMetrics);
      videoElement.removeEventListener('resize', updateMetrics);
      videoElement.removeEventListener('timeupdate', updateMetrics);
    };
  }, [participantId, isLocal, resolvedStream, isCameraOff, updateMetrics]);

  // Keep unmuted audio element in sync for remote peer microphone output
  useEffect(() => {
    if (isLocal) return;
    const audioEl = audioRef.current;
    if (!audioEl) return;

    if (resolvedStream && audioEl.srcObject !== resolvedStream) {
      audioEl.srcObject = resolvedStream;
      audioEl.play().catch(() => {});
    } else if (!resolvedStream && audioEl.srcObject) {
      audioEl.srcObject = null;
    }
  }, [isLocal, resolvedStream]);

  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'P';

  // 1. Live video track condition
  const hasLiveRemoteVideoTrack =
    hasStream && videoTrackCount > 0 && videoTrackReadyState === 'live' && videoTrackEnabled;

  // 2. Video actively playing condition: dimensions > 0 and live track
  const isVideoPlaying =
    videoWidth > 0 && videoHeight > 0 && readyState >= 2 && (isLocal || hasLiveRemoteVideoTrack);

  // 3. Exact UI status conditions per Section 3
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

  // 4. Overlay is completely hidden when video is actively playing
  const showOverlay = isLocal
    ? isCameraOff
    : !isVideoPlaying && (isCameraOff || isConnecting || isFailed || isConnectedNoVideo);

  const isCameraActive = isLocal ? !isCameraOff : isVideoPlaying;

  return (
    <div
      className={`relative rounded-2xl overflow-hidden flex items-center justify-center select-none w-full aspect-video transition-[border-color,box-shadow] duration-300 ${
        isCameraActive
          ? 'border border-brand-500/40 shadow-[0_0_14px_rgba(99,102,241,0.22)]'
          : 'border border-white/[0.08]'
      }`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#0a0c14',
        contain: 'layout paint',
        isolation: 'isolate',
      }}
      role="region"
      aria-label={`${displayName}'s video feed`}
    >
      {/* Clean Hardware-Friendly HTML5 Video Element (muted so autoplay always succeeds without gesture) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={true}
        style={{
          display: isCameraOff && !isVideoPlaying ? 'none' : 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          backgroundColor: '#0a0c14',
          transform: isLocal ? 'scaleX(-1) translateZ(0)' : 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
      />

      {/* Remote Audio Track output */}
      {!isLocal && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
        />
      )}

      {/* Camera Off / Connecting / Status Overlay */}
      {showOverlay && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center z-0"
          style={{ backgroundColor: '#0a0c14' }}
        >
          <div className="w-10 h-10 rounded-2xl bg-brand-950/60 border border-brand-500/25 flex items-center justify-center text-brand-200 font-bold text-sm mb-1.5 shadow-xs">
            {initials}
          </div>
          {isConnecting ? (
            <span className="text-[10px] text-brand-300 font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400"></span>
              Connecting...
            </span>
          ) : isFailed ? (
            <span className="text-[10px] text-rose-400 font-mono flex items-center gap-1">
              <WifiOff className="w-3 h-3" />
              Reconnecting
            </span>
          ) : (
            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
              <VideoOff className="w-3 h-3 text-slate-400" />
              Camera off
            </span>
          )}
        </div>
      )}

      {/* Static Overlay: Name & Mute Badge */}
      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none z-10">
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-white text-[10px] font-medium truncate max-w-[75%] shadow-xs"
          style={{
            backgroundColor: 'rgba(5, 7, 12, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
          }}
        >
          <span className="truncate">{displayName}</span>
          {isLocal && (
            <span className="text-[9px] font-mono text-brand-300 uppercase shrink-0 font-bold">
              (You)
            </span>
          )}
        </div>

        {/* Mic Indicator */}
        <div className="flex items-center gap-1">
          {isMuted ? (
            <div
              className="p-1 rounded-md text-rose-300"
              style={{
                backgroundColor: 'rgba(244, 63, 94, 0.2)',
                border: '1px solid rgba(244, 63, 94, 0.35)',
              }}
              title="Microphone muted"
              aria-label="Microphone muted"
            >
              <MicOff className="w-2.5 h-2.5" />
            </div>
          ) : (
            <div
              className="p-1 rounded-md text-emerald-400"
              style={{
                backgroundColor: 'rgba(5, 7, 12, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
              }}
              title="Microphone active"
              aria-label="Microphone active"
            >
              <Mic className="w-2.5 h-2.5" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
