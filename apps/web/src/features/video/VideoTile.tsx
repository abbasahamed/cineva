import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Mic, MicOff, VideoOff, WifiOff, Volume2, VolumeX } from 'lucide-react';

export interface VideoTileProps {
  displayName: string;
  participantId?: string;
  stream?: MediaStream | null;
  isLocal?: boolean;
  isHost?: boolean;
  isMuted?: boolean;
  isCameraOff?: boolean;
  connectionState?: RTCPeerConnectionState;
  volume?: number; // 0 - 100
  isLocallyMuted?: boolean;
  onVolumeChange?: (volume: number) => void;
  onToggleLocalMute?: () => void;
  getStream?: (participantId: string, isLocal?: boolean) => MediaStream | null;
  showVolumeControl?: boolean;
  className?: string;
}

export const VideoTile: React.FC<VideoTileProps> = React.memo(({
  displayName,
  participantId,
  stream,
  isLocal = false,
  isHost = false,
  isMuted = false,
  isCameraOff = false,
  connectionState = 'connected',
  volume = 100,
  isLocallyMuted = false,
  onVolumeChange,
  onToggleLocalMute,
  getStream,
  showVolumeControl = true,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVolumeMenuOpen, setIsVolumeMenuOpen] = useState(false);
  const [streamVersion, setStreamVersion] = useState(0);

  const [videoMetrics, setVideoMetrics] = useState({
    videoWidth: 0,
    videoHeight: 0,
    readyState: 0,
    paused: true,
  });

  const streamFromManager = getStream ? getStream(participantId || '', isLocal) : null;
  const resolvedStream = streamFromManager || (stream !== undefined ? stream : null);

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

  // Reactive listener for tracks dynamically added or removed on the stream
  useEffect(() => {
    if (!resolvedStream || typeof resolvedStream.addEventListener !== 'function') return;
    const onTrackChange = () => {
      setStreamVersion((v) => v + 1);
      updateMetrics();
    };

    resolvedStream.addEventListener('addtrack', onTrackChange);
    resolvedStream.addEventListener('removetrack', onTrackChange);

    return () => {
      resolvedStream.removeEventListener('addtrack', onTrackChange);
      resolvedStream.removeEventListener('removetrack', onTrackChange);
    };
  }, [resolvedStream, updateMetrics]);

  const videoTrack = resolvedStream && typeof resolvedStream.getVideoTracks === 'function'
    ? resolvedStream.getVideoTracks()[0] || null
    : null;
  const videoTrackId = videoTrack ? videoTrack.id : null;
  const hasLiveVideoTrack = !!videoTrack && videoTrack.readyState === 'live' && videoTrack.enabled;
  const shouldRenderVideo = !isCameraOff && hasLiveVideoTrack;

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (!shouldRenderVideo || !resolvedStream) {
      if (videoElement.srcObject) {
        videoElement.srcObject = null;
        updateMetrics();
      }
      return;
    }

    if (videoElement.srcObject !== resolvedStream) {
      videoElement.srcObject = resolvedStream;
    }

    const playPromise = videoElement.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise
        .then(() => {
          updateMetrics();
        })
        .catch((err: any) => {
          if (err?.name !== 'AbortError') {
            console.warn(
              `[VideoTile] video.play() error for ${participantId || (isLocal ? 'local' : 'unknown')}:`,
              err
            );
          }
        });
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
  }, [participantId, isLocal, resolvedStream, videoTrackId, shouldRenderVideo, streamVersion, updateMetrics]);

  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'P';

  const readyState = videoRef.current ? Math.max(videoRef.current.readyState, videoMetrics.readyState) : videoMetrics.readyState;
  const videoWidth = videoRef.current ? Math.max(videoRef.current.videoWidth, videoMetrics.videoWidth) : videoMetrics.videoWidth;
  const videoHeight = videoRef.current ? Math.max(videoRef.current.videoHeight, videoMetrics.videoHeight) : videoMetrics.videoHeight;

  // Active video feed condition
  const isCameraActive = shouldRenderVideo && (
    isLocal ? hasLiveVideoTrack : (readyState >= 2 || (videoWidth > 0 && videoHeight > 0))
  );

  const isConnecting =
    !isLocal && !isCameraActive && (connectionState === 'connecting' || connectionState === 'new');

  const isFailed =
    !isLocal && !isCameraActive && (connectionState === 'failed' || connectionState === 'disconnected');

  return (
    <div
      className={`relative w-full h-full rounded-2xl overflow-hidden bg-[#0c0e17] border select-none group transition-all duration-300 ${
        isCameraActive
          ? 'border-brand-500/30 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
          : 'border-white/[0.08]'
      } ${className}`}
      role="region"
      aria-label={`${displayName}'s video feed`}
    >
      {/* HTML5 Video Element (always muted so browser never blocks autoplay) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={true}
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
        style={{
          opacity: isCameraActive ? 1 : 0,
          transform: isLocal ? 'scaleX(-1) translateZ(0)' : 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
      />

      {/* Centered Avatar Region (Cleanly floating in middle, zero overlap with top badges or bottom bar) */}
      {!isCameraActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center bg-[#0d0f18] z-10 pointer-events-none">
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-slate-800/90 border border-white/10 flex items-center justify-center text-white font-bold text-base shadow-inner tracking-wider">
              {initials}
            </div>
            <div
              role="img"
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-slate-900 border border-white/20 flex items-center justify-center text-slate-400 shadow-sm"
              title="Camera off"
              aria-label="Camera off"
            >
              <VideoOff className="w-2.5 h-2.5" />
            </div>
          </div>
          {isConnecting ? (
            <span className="text-[10px] text-brand-300 font-mono flex items-center gap-1 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse"></span>
              Connecting...
            </span>
          ) : isFailed ? (
            <span className="text-[10px] text-rose-400 font-mono flex items-center gap-1 mt-1.5">
              <WifiOff className="w-3 h-3" />
              Reconnecting
            </span>
          ) : (
            <span className="sr-only">
              Camera off
            </span>
          )}
        </div>
      )}

      {/* Top Left: Host Badge (Isolated region) */}
      {isHost && (
        <div className="absolute top-2 left-2 z-20 pointer-events-none">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-white text-black shadow-md border border-white/20">
            Host
          </span>
        </div>
      )}

      {/* Top Right: Volume & Mute Control (Only for Remote Participants) */}
      {!isLocal && showVolumeControl && (
        <div className="absolute top-2 right-2 z-30">
          <div className="relative">
            <button
              type="button"
              className={`p-1.5 rounded-lg border backdrop-blur-md transition-all ${
                isLocallyMuted
                  ? 'bg-rose-500/30 border-rose-500/40 text-rose-300'
                  : 'bg-black/60 border-white/10 text-slate-300 hover:text-white hover:bg-black/80'
              }`}
              title={isLocallyMuted ? `Unmute ${displayName}` : `Adjust ${displayName}'s volume`}
              aria-label={`Adjust ${displayName}'s volume`}
              onClick={(e) => {
                e.stopPropagation();
                setIsVolumeMenuOpen(!isVolumeMenuOpen);
              }}
            >
              {isLocallyMuted || volume === 0 ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Volume Slider Popover */}
            {isVolumeMenuOpen && (
              <div
                className="absolute right-0 mt-1.5 w-44 p-2.5 rounded-xl bg-[#090b13]/95 border border-white/15 shadow-2xl backdrop-blur-xl z-40 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between text-[11px] text-slate-300 font-medium">
                  <span className="truncate max-w-[100px]">{displayName}</span>
                  <span className="font-mono text-brand-300 font-bold">{isLocallyMuted ? 'Muted' : `${volume}%`}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={isLocallyMuted ? 0 : volume}
                    disabled={isLocallyMuted}
                    onChange={(e) => {
                      const newVol = parseInt(e.target.value, 10);
                      onVolumeChange?.(newVol);
                    }}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
                    aria-label={`${displayName} volume slider`}
                  />
                </div>
                {onToggleLocalMute && (
                  <button
                    type="button"
                    className={`w-full py-1 px-2 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      isLocallyMuted
                        ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                        : 'bg-white/10 text-slate-200 hover:bg-white/15'
                    }`}
                    onClick={() => onToggleLocalMute()}
                  >
                    {isLocallyMuted ? (
                      <>
                        <Volume2 className="w-3 h-3" />
                        Unmute user
                      </>
                    ) : (
                      <>
                        <VolumeX className="w-3 h-3" />
                        Mute user
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Overlay Bar: Participant Name (Left) + Mic Status (Right) */}
      <div className="absolute bottom-0 inset-x-0 z-20 px-2.5 py-1.5 bg-gradient-to-t from-black/95 via-black/70 to-transparent pointer-events-none flex items-center justify-between gap-1.5">
        {/* Name with Safe Truncation */}
        <div className="flex items-center gap-1.5 min-w-0 max-w-[calc(100%-32px)]">
          <span className="text-white text-xs font-medium truncate drop-shadow-sm" title={displayName}>
            {displayName}
          </span>
          {isLocal && (
            <span className="text-[9px] font-bold text-brand-300 shrink-0 uppercase tracking-tight">
              (You)
            </span>
          )}
        </div>

        {/* Microphone and Connection Status Icons */}
        <div className="flex items-center gap-1 shrink-0">
          {isMuted ? (
            <span
              role="img"
              className="w-5 h-5 rounded-md bg-rose-500/20 border border-rose-500/35 text-rose-400 flex items-center justify-center"
              title="Microphone muted"
              aria-label="Microphone muted"
            >
              <MicOff className="w-3 h-3" />
            </span>
          ) : (
            <span
              role="img"
              className="w-5 h-5 rounded-md bg-emerald-500/20 border border-emerald-500/35 text-emerald-400 flex items-center justify-center"
              title="Microphone active"
              aria-label="Microphone active"
            >
              <Mic className="w-3 h-3" />
            </span>
          )}

          {connectionState === 'connecting' && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-0.5" title="Connecting..." />
          )}
          {(connectionState === 'failed' || connectionState === 'disconnected') && (
            <span className="text-rose-400 ml-0.5" title="Connection issue">
              <WifiOff className="w-3 h-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

VideoTile.displayName = 'VideoTile';
