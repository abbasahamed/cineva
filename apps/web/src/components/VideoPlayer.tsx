import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SlidersHorizontal,
  HardDrive,
  Lock,
  Tv,
  PictureInPicture,
  AlertCircle,
  Loader2,
  RefreshCw,
  Film,
  Subtitles,
  Check,
  Upload,
  Crop,
} from 'lucide-react';
import { PlaybackState, MediaInfo } from '@cineva/shared';

interface VideoPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  media: MediaInfo | null | undefined;
  playback: PlaybackState;
  isHost: boolean;
  canControl: boolean;
  needsUserGesture: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (position: number) => void;
  onLocalScrubPreview: (previewPosition: number) => void;
  onPlaybackRate: (rate: number) => void;
  onUserGestureStart: () => void;
  onOpenUpload: () => void;
  onMediaRetry?: () => void;
  subtitleState?: { url: string; filename: string } | null;
  onUploadSubtitle?: (file: File) => void;
}

export function formatTime(seconds: number): string {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds) || isNaN(seconds) || seconds < 0) {
    return '00:00';
  }
  const totalSeconds = Math.floor(seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoRef,
  media,
  playback,
  isHost,
  canControl,
  needsUserGesture,
  onPlay,
  onPause,
  onSeek,
  onLocalScrubPreview,
  onPlaybackRate,
  onUserGestureStart,
  onOpenUpload,
  onMediaRetry,
  subtitleState,
  onUploadSubtitle,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPositionRatio, setHoverPositionRatio] = useState<number>(0);
  const [showRateMenu, setShowRateMenu] = useState<boolean>(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState<boolean>(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState<boolean>(true);
  const [zoomMode, setZoomMode] = useState<'fit' | 'fill' | 'cover' | 'stretch' | 'custom'>(() => {
    return (localStorage.getItem('cineva_zoom_mode') as any) || 'fit';
  });
  const [zoomScale, setZoomScale] = useState<number>(() => {
    const saved = localStorage.getItem('cineva_zoom_scale');
    return saved ? parseFloat(saved) : 1;
  });
  const [showZoomMenu, setShowZoomMenu] = useState<boolean>(false);
  const [zoomToast, setZoomToast] = useState<string | null>(null);
  const zoomToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const zoomMenuRef = useRef<HTMLDivElement>(null);
  const zoomScaleRef = useRef(zoomScale);
  zoomScaleRef.current = zoomScale;
  const zoomModeRef = useRef(zoomMode);
  zoomModeRef.current = zoomMode;
  const [hasVideoError, setHasVideoError] = useState<boolean>(false);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rateMenuRef = useRef<HTMLDivElement>(null);
  const subtitleMenuRef = useRef<HTMLDivElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const isScrubbingRef = useRef<boolean>(false);
  isScrubbingRef.current = isScrubbing;

  const triggerZoomToast = (msg: string) => {
    setZoomToast(msg);
    if (zoomToastTimeoutRef.current) {
      clearTimeout(zoomToastTimeoutRef.current);
    }
    zoomToastTimeoutRef.current = setTimeout(() => {
      setZoomToast(null);
    }, 1500);
  };

  const applyZoom = (mode: 'fit' | 'fill' | 'cover' | 'stretch' | 'custom', scale = 1) => {
    setZoomMode(mode);
    setZoomScale(scale);
    try {
      localStorage.setItem('cineva_zoom_mode', mode);
      localStorage.setItem('cineva_zoom_scale', scale.toString());
    } catch { }

    let label = 'Fit (Original)';
    if (mode === 'fill') {
      label = scale === 1.34 ? 'Zoom to Fill (21:9 Ultrawide)' : `Zoom to Fill (${Math.round(scale * 100)}%)`;
    } else if (mode === 'cover') {
      label = 'Auto Fill (Cover)';
    } else if (mode === 'stretch') {
      label = 'Stretch to Fill';
    } else if (mode === 'custom') {
      label = `Zoom: ${Math.round(scale * 100)}%`;
    }
    triggerZoomToast(label);
  };

  const toggleZoom = () => {
    if (zoomScaleRef.current > 1 || zoomModeRef.current !== 'fit') {
      applyZoom('fit', 1);
    } else {
      applyZoom('fill', 1.34);
    }
  };

  // Close rate menu, subtitle menu, or zoom menu on outside click
  useEffect(() => {
    if (!showRateMenu && !showSubtitleMenu && !showZoomMenu) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (showRateMenu && rateMenuRef.current && !rateMenuRef.current.contains(target)) {
        setShowRateMenu(false);
      }
      if (showSubtitleMenu && subtitleMenuRef.current && !subtitleMenuRef.current.contains(target)) {
        setShowSubtitleMenu(false);
      }
      if (showZoomMenu && zoomMenuRef.current && !zoomMenuRef.current.contains(target)) {
        setShowZoomMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [showRateMenu, showSubtitleMenu, showZoomMenu]);

  // Synchronize native text track mode with subtitlesEnabled state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.textTracks && video.textTracks.length > 0) {
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = subtitlesEnabled && subtitleState ? 'showing' : 'disabled';
      }
    }
  }, [subtitlesEnabled, subtitleState, videoRef]);

  // Reset video error and reload video when media changes or becomes ready
  useEffect(() => {
    setHasVideoError(false);
    const video = videoRef.current;
    if (video && media?.status === 'ready' && media?.url) {
      video.load();
    }
  }, [media?.id, media?.url, media?.status]);

  // Video Element HTML5 Event Listeners & Metadata Sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateStateFromVideo = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      }
      if (!isScrubbingRef.current && Number.isFinite(video.currentTime)) {
        const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
        const clampedTime = Math.max(0, Math.min(video.currentTime, dur));
        setCurrentTime(clampedTime);
      }
    };

    // Immediately read from video element on mount/source change if metadata is already loaded
    updateStateFromVideo();

    const handleLoadedMetadata = () => updateStateFromVideo();
    const handleDurationChange = () => updateStateFromVideo();
    const handleTimeUpdate = () => updateStateFromVideo();
    const handleCanPlay = () => updateStateFromVideo();
    const handlePlay = () => updateStateFromVideo();
    const handlePause = () => updateStateFromVideo();
    const handleSeeking = () => updateStateFromVideo();
    const handleSeeked = () => updateStateFromVideo();
    const handleEnded = () => updateStateFromVideo();

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('ended', handleEnded);
    };
  }, [videoRef, media?.url, media?.status]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Controls auto-hide timer
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    if (playback.isPlaying && !showRateMenu && !showSubtitleMenu && !showZoomMenu) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3500);
    }
  }, [playback.isPlaying, showRateMenu, showSubtitleMenu, showZoomMenu]);

  const handleMouseMove = () => {
    resetControlsTimer();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in chat or input
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (canControl) {
          playback.isPlaying ? onPause() : onPlay();
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleRewind10();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleForward10();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'KeyZ') {
        e.preventDefault();
        toggleZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canControl, playback.isPlaying, duration, onPlay, onPause, onSeek, videoRef]);

  const togglePlayPause = () => {
    if (!canControl) return;
    if (playback.isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canControl) return;
    const video = videoRef.current;
    const actualDuration = video && Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : (duration && Number.isFinite(duration) && duration > 0 ? duration : 0);
    const newTime = parseFloat(e.target.value);
    if (!Number.isFinite(newTime)) return;
    const clamped = actualDuration > 0 ? Math.max(0, Math.min(newTime, actualDuration)) : Math.max(0, newTime);
    setCurrentTime(clamped);
    onLocalScrubPreview(clamped);
  };

  const handleSeekStart = () => {
    if (!canControl) return;
    setIsScrubbing(true);
  };

  const handleSeekEnd = (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    if (!canControl) return;
    setIsScrubbing(false);
    const target = e.currentTarget as HTMLInputElement;
    const rawVal = parseFloat(target.value);
    const video = videoRef.current;
    const actualDuration = video && Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : (duration && Number.isFinite(duration) && duration > 0 ? duration : 0);

    if (Number.isFinite(rawVal)) {
      const finalPos = actualDuration > 0 ? Math.max(0, Math.min(rawVal, actualDuration)) : Math.max(0, rawVal);
      if (video) video.currentTime = finalPos;
      setCurrentTime(finalPos);
      onSeek(finalPos);
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canControl) return;
    const video = videoRef.current;
    const actualDuration = video && Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : (duration && Number.isFinite(duration) && duration > 0 ? duration : 0);

    if (actualDuration <= 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = Math.max(0, Math.min(ratio * actualDuration, actualDuration));

    if (Number.isFinite(targetTime)) {
      if (video) video.currentTime = targetTime;
      setCurrentTime(targetTime);
      onSeek(targetTime);
    }
  };

  const handleTimelineTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!canControl) return;
    const touch = e.touches[0];
    if (!touch) return;
    const video = videoRef.current;
    const actualDuration = video && Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : (duration && Number.isFinite(duration) && duration > 0 ? duration : 0);

    if (actualDuration <= 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const clickX = touch.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = Math.max(0, Math.min(ratio * actualDuration, actualDuration));

    if (Number.isFinite(targetTime)) {
      if (video) video.currentTime = targetTime;
      setCurrentTime(targetTime);
      onSeek(targetTime);
    }
  };

  const handleRewind10 = () => {
    if (!canControl) return;
    const video = videoRef.current;
    const actualDuration = video && Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : (duration && Number.isFinite(duration) && duration > 0 ? duration : Infinity);
    const currentPos = video && Number.isFinite(video.currentTime)
      ? video.currentTime
      : (Number.isFinite(currentTime) ? currentTime : 0);

    const target = Math.max(0, currentPos - 10);
    if (Number.isFinite(target)) {
      if (video) video.currentTime = target;
      setCurrentTime(target);
      onSeek(target);
    }
  };

  const handleForward10 = () => {
    if (!canControl) return;
    const video = videoRef.current;
    const actualDuration = video && Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : (duration && Number.isFinite(duration) && duration > 0 ? duration : Infinity);
    const currentPos = video && Number.isFinite(video.currentTime)
      ? video.currentTime
      : (Number.isFinite(currentTime) ? currentTime : 0);

    const target = Math.min(actualDuration, currentPos + 10);
    if (Number.isFinite(target)) {
      if (video) video.currentTime = target;
      setCurrentTime(target);
      onSeek(target);
    }
  };

  const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPositionRatio(ratio);
    setHoverTime(ratio * duration);
  };

  const handleProgressBarMouseLeave = () => {
    setHoverTime(null);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
    setIsMuted(val === 0);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.muted = false;
      videoRef.current.volume = volume || 0.8;
      setIsMuted(false);
    } else {
      videoRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => { });
      }
    } else if (container.requestFullscreen) {
      container.requestFullscreen().catch(() => {
        if (video && (video as any).webkitEnterFullscreen) {
          try {
            (video as any).webkitEnterFullscreen();
          } catch { }
        }
      });
    } else if (video && (video as any).webkitEnterFullscreen) {
      try {
        (video as any).webkitEnterFullscreen();
      } catch { }
    }
  };

  const [isPiP, setIsPiP] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video) {
      (video as any).autoPictureInPicture = false;
      video.setAttribute('autopictureinpicture', 'false');
    }

    const handleEnterPiP = () => {
      setIsPiP(true);
    };

    const handleLeavePiP = () => {
      setIsPiP(false);
    };

    video.addEventListener('enterpictureinpicture', handleEnterPiP);
    video.addEventListener('leavepictureinpicture', handleLeavePiP);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP);
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, [media?.url]);

  const togglePiP = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP error:', err);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onTouchStart={resetControlsTimer}
      onClick={resetControlsTimer}
      className="relative w-full aspect-video bg-[#020306] rounded-3xl overflow-hidden shadow-[0_30px_100px_-20px_rgba(0,0,0,0.95),0_0_60px_-15px_rgba(var(--brand-rgb),0.18)] border border-white/[0.08] group flex items-center justify-center select-none"
    >
      {/* Subtle OLED Inner Bezel Shadow & Highlight */}
      <div className="absolute inset-0 pointer-events-none rounded-3xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),inset_0_-2px_8px_rgba(0,0,0,0.8)] z-10" />

      {/* Cinema HUD Zoom Notification */}
      {zoomToast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-fadeIn">
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#090b14]/90 backdrop-blur-xl border border-white/20 text-white font-medium text-xs sm:text-sm shadow-2xl">
            <Crop className="w-4 h-4 text-brand-400" />
            <span>{zoomToast}</span>
          </div>
        </div>
      )}

      {/* Center Play Button Overlay (when paused) */}
      {media && media.status === 'ready' && !playback.isPlaying && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            togglePlayPause();
          }}
          disabled={!canControl}
          className="absolute z-20 w-12 h-12 sm:w-20 sm:h-20 rounded-full bg-brand-600/85 hover:bg-brand-500 backdrop-blur-xl border border-white/30 flex items-center justify-center text-white shadow-[0_0_40px_rgba(var(--brand-rgb),0.65)] hover:scale-110 active:scale-95 transition-all cursor-pointer group/centerplay disabled:opacity-40 disabled:cursor-not-allowed"
          title={canControl ? 'Play (Space)' : 'Host is controlling playback'}
          aria-label="Play video"
        >
          <Play className="w-6 h-6 sm:w-10 sm:h-10 fill-white ml-0.5 sm:ml-1 group-hover/centerplay:scale-105 transition-transform" />
        </button>
      )}

      {/* Video Element: render ONLY when media is ready and has an authoritative playback URL */}
      {media && media.status === 'ready' && media.url ? (
        <video
          key={`${media.id}_${media.url}_${media.status}`}
          ref={videoRef}
          src={media.url}
          playsInline
          disablePictureInPicture={false}
          className={`w-full h-full cursor-pointer relative z-0 ${
            zoomMode === 'stretch'
              ? 'object-fill'
              : zoomMode === 'cover'
              ? 'object-cover'
              : 'object-contain'
          }`}
          style={{
            transform: `scale(${zoomScale})`,
            transformOrigin: 'center center',
            transition: 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onClick={togglePlayPause}
          onError={() => {
            if (media.status === 'ready') {
              setHasVideoError(true);
            }
          }}
        >
          {subtitleState?.url && (
            <track
              key={subtitleState.url}
              kind="subtitles"
              src={subtitleState.url}
              srcLang="en"
              label={subtitleState.filename || 'Subtitles'}
              default={subtitlesEnabled}
            />
          )}
        </video>
      ) : media && media.status === 'processing' ? (
        <div className="w-full h-full bg-[#020306]" />
      ) : (
        /* Widescreen Integrated Cinema Empty Stage per Section 6 & 7 */
        <div className="relative w-full h-full flex flex-col items-center justify-center p-6 sm:p-12 text-center overflow-hidden z-10">
          {/* Cinema Spotlight Beam */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full opacity-35 pointer-events-none blur-[90px] transition-all duration-500"
            style={{
              background: 'radial-gradient(ellipse at top, rgba(var(--brand-glow-rgb), 0.35) 0%, rgba(var(--brand-500-rgb), 0.15) 50%, transparent 80%)',
            }}
          />

          {/* Film / Cinema Icon Badge */}
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-3xl bg-white/[0.04] border border-white/[0.12] flex items-center justify-center mb-5 text-brand-300 shadow-glass-glow relative backdrop-blur-md">
            <Film className="w-7 h-7 sm:w-8 sm:h-8 drop-shadow" />
            <div className="absolute -inset-1 rounded-3xl bg-brand-500/10 -z-10 blur-sm" />
          </div>

          <span className="text-[10px] sm:text-xs font-mono font-bold uppercase tracking-[0.25em] text-brand-400 mb-2">
            Private Screening
          </span>

          <h2 className="text-xl sm:text-3xl font-extrabold text-white mb-2 tracking-tight">
            {isHost ? 'Your cinema is ready' : 'Waiting for screening'}
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 max-w-md mb-2 leading-relaxed">
            {isHost
              ? 'Add an authorized video to begin the screening with your friends.'
              : 'The host will start the screening shortly. Sit back and enjoy.'}
          </p>

          <p className="text-[11px] text-slate-500 mb-6">
            {isHost ? 'Invite friends anytime using your private room link.' : 'Everyone stays locked to the same second in real time.'}
          </p>

          {isHost && (
            <button
              onClick={onOpenUpload}
              className="inline-flex items-center gap-2.5 px-7 py-3 rounded-2xl glass-btn-primary hover:shadow-[0_0_24px_rgba(var(--brand-rgb),0.4)] text-white font-semibold text-xs sm:text-sm shadow-xl transition-all active:scale-95 hover:scale-[1.02] cursor-pointer"
            >
              <HardDrive className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              <span>Add video</span>
            </button>
          )}
        </div>
      )}

      {/* Playback Error Overlay (shown ONLY when media is ready but stream decode fails) */}
      {hasVideoError && media && media.status === 'ready' && (
        <div className="absolute inset-0 bg-[#020306]/95 backdrop-blur-md flex flex-col items-center justify-center z-40 p-6 text-center animate-fadeIn">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-3 shadow-glass-sm">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">Playback Error</h3>
          <p className="text-xs text-slate-300 max-w-sm mb-5 leading-relaxed">
            Unable to stream this video. Please check your network connection or try reloading the player.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setHasVideoError(false);
                const video = videoRef.current;
                if (video) video.load();
              }}
              className="px-5 py-2.5 rounded-xl glass-btn-primary text-white font-semibold text-xs shadow-md transition-all active:scale-95 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Playback</span>
            </button>
            {isHost && (
              <button
                onClick={onOpenUpload}
                className="px-5 py-2.5 rounded-xl glass-btn-secondary text-white font-semibold text-xs shadow-md transition-all active:scale-95 flex items-center gap-2"
              >
                <HardDrive className="w-4 h-4" />
                <span>Choose Another Video</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Autoplay Audio Unlock Overlay */}
      {needsUserGesture && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center z-40 p-6 text-center animate-fadeIn">
          <div className="w-14 h-14 rounded-full bg-brand-500/15 flex items-center justify-center mb-3 text-brand-400 border border-brand-500/30 shadow-glass-glow">
            <Volume2 className="w-6 h-6" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold mb-2 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>You're synchronized.</span>
          </div>
          <h3 className="text-base font-bold text-white mb-1">Click to enable audio</h3>
          <p className="text-xs text-surface-muted max-w-xs mb-5">
            Video is currently playing silently to comply with browser autoplay restrictions.
          </p>
          <button
            onClick={onUserGestureStart}
            className="px-6 py-2.5 rounded-xl glass-btn-primary text-white font-semibold text-xs shadow-lg transition-all active:scale-95 flex items-center gap-2"
          >
            <Volume2 className="w-4 h-4" />
            <span>Enable Audio</span>
          </button>
        </div>
      )}

      {/* Widescreen Integrated Cinema Screening Preparation Stage per Section 8 */}
      {media && media.status === 'processing' && (
        <div className="absolute inset-0 bg-[#020306]/95 backdrop-blur-md flex flex-col items-center justify-center z-40 p-6 sm:p-12 text-center animate-fadeIn overflow-hidden">
          {/* Theater Projector Light Beam */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[550px] h-[350px] rounded-full opacity-30 pointer-events-none blur-[100px] transition-all duration-500"
            style={{
              background: 'radial-gradient(ellipse at top, rgba(var(--brand-glow-rgb), 0.4) 0%, rgba(var(--brand-500-rgb), 0.15) 50%, transparent 80%)',
            }}
          />

          {/* Animated Film Reel */}
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-white/[0.04] border border-white/[0.12] text-brand-400 flex items-center justify-center mb-5 shadow-glass-glow">
            <Film className="w-8 h-8 sm:w-9 sm:h-9 text-brand-300 animate-pulse" />
            <div className="absolute -inset-1.5 rounded-3xl border border-brand-400/40 border-t-transparent animate-spin" />
          </div>

          <span className="text-[10px] sm:text-xs font-mono font-bold uppercase tracking-[0.25em] text-brand-400 mb-2">
            Preparing Screening
          </span>

          <h3 className="text-xl sm:text-3xl font-extrabold text-white mb-2 tracking-tight">
            Optimizing your video
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 max-w-md mb-6 leading-relaxed">
            {isHost
              ? 'Calibrating video streams for synchronized frame-perfect playback.'
              : "The host's video is being prepared for the screening room."}
          </p>

          {/* Sleek Progress Bar & Status Text */}
          <div className="w-full max-w-sm space-y-2.5">
            <div className="flex justify-between items-center text-xs text-slate-300 font-mono">
              <span className="truncate pr-2">
                {media.stage || (media.transcodeProgress && media.transcodeProgress > 5
                  ? `Optimizing video streams...`
                  : `Preparing screening...`)}
              </span>
              <span className="font-bold text-brand-300 shrink-0 text-sm">
                {media.transcodeProgress ? `${media.transcodeProgress}%` : '5%'}
              </span>
            </div>
            <div className="relative w-full h-2.5 bg-white/[0.08] rounded-full overflow-hidden border border-white/[0.06] p-0.5">
              <div
                className="h-full bg-gradient-to-r from-brand-500 via-brand-400 to-brand-300 rounded-full transition-all duration-300 shadow-[0_0_14px_rgba(var(--brand-rgb),0.8)]"
                style={{ width: `${media.transcodeProgress || 5}%` }}
              />
            </div>
            {(media.speed || media.etaSeconds !== undefined) && (
              <div className="flex justify-between items-center text-[11px] text-slate-400 font-mono pt-1">
                <span>{media.speed ? `Speed: ${media.speed}` : ''}</span>
                <span>
                  {media.etaSeconds !== undefined && media.etaSeconds >= 0
                    ? media.etaSeconds > 60
                      ? `About ${Math.ceil(media.etaSeconds / 60)} min remaining`
                      : `About ${media.etaSeconds} sec remaining`
                    : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transcoding Failed Overlay */}
      {media && media.status === 'failed' && (
        <div className="absolute inset-0 bg-[#08090f]/95 backdrop-blur-md flex flex-col items-center justify-center z-40 p-6 text-center animate-fadeIn">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mb-3 shadow-glass-sm">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">Couldn't prepare this video</h3>
          <p className="text-xs text-slate-300 max-w-sm mb-5 leading-relaxed">
            {media.transcodeError || "Your video couldn't be converted for browser playback."}
          </p>
          {isHost && (
            <div className="flex items-center gap-3">
              {onMediaRetry && (
                <button
                  onClick={onMediaRetry}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-medium text-xs transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              )}
              <button
                onClick={onOpenUpload}
                className="px-5 py-2 rounded-xl glass-btn-primary hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.4)] text-white font-semibold text-xs shadow-md transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                <HardDrive className="w-4 h-4" />
                <span>Change Video</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Host controlled indicator for guests (when guest control is disabled) */}
      {!canControl && media && media.status !== 'processing' && media.status !== 'failed' && showControls && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[11px] font-medium text-slate-300 shadow-sm animate-fadeIn">
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          <span>Host Controlled</span>
        </div>
      )}

      {/* Floating Liquid Glass Video Controls Overlay */}
      {media && media.status !== 'processing' && media.status !== 'failed' && (
        <div
          className={`absolute inset-x-0 bottom-0 p-1.5 sm:p-5 transition-all duration-300 z-30 pointer-events-none ${showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
        >
          {/* Floating Glass Bar Container */}
          <div className="max-w-4xl mx-auto rounded-xl sm:rounded-2xl bg-black/75 backdrop-blur-xl border border-white/[0.12] p-1.5 sm:p-3 shadow-glass-elevated glass-reflection pointer-events-auto transition-all">
            {/* Progress Timeline with Tooltip */}
            <div
              ref={progressBarRef}
              className="relative w-full group/scrubber mb-1 sm:mb-2.5 flex items-center cursor-pointer py-0.5 sm:py-1"
              onMouseMove={handleProgressBarMouseMove}
              onMouseLeave={handleProgressBarMouseLeave}
              onClick={handleTimelineClick}
              onTouchStart={handleTimelineTouch}
              onTouchMove={handleTimelineTouch}
            >
              {/* Hover timestamp tooltip */}
              {hoverTime !== null && (
                <div
                  className="absolute -top-8 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/85 backdrop-blur-md border border-white/15 text-[10px] font-mono text-white pointer-events-none shadow-lg z-40"
                  style={{ left: `${hoverPositionRatio * 100}%` }}
                >
                  {formatTime(hoverTime)}
                </div>
              )}

              {/* Custom Track Background */}
              <div className="relative w-full h-1 group-hover/scrubber:h-2 bg-white/[0.15] rounded-full overflow-hidden transition-all">
                {/* Played track */}
                <div
                  className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-brand-500 to-brand-400 rounded-full shadow-[0_0_8px_rgba(var(--brand-rgb),0.6)]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Interactive Range Input */}
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                disabled={!canControl}
                onMouseDown={handleSeekStart}
                onTouchStart={handleSeekStart}
                onChange={handleSeekChange}
                onMouseUp={handleSeekEnd}
                onTouchEnd={handleSeekEnd}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
            </div>

            {/* Lower Controls Row */}
            <div className="flex items-center justify-between gap-1 sm:gap-3 text-slate-200">
              {/* Left Controls: Play/Pause, Rewind, Forward, Volume, Time */}
              <div className="flex items-center gap-0.5 sm:gap-2 min-w-0 flex-1">
                {/* Play/Pause Toggle */}
                <button
                  onClick={togglePlayPause}
                  disabled={!canControl}
                  className={`p-1 sm:p-2 rounded-lg sm:rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.08] transition-all cursor-pointer shrink-0 ${!canControl ? 'opacity-40 cursor-not-allowed' : 'hover:scale-105 active:scale-95'
                    }`}
                  title={canControl ? (playback.isPlaying ? 'Pause (Space)' : 'Play (Space)') : 'Host is controlling playback'}
                >
                  {playback.isPlaying ? (
                    <Pause className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 text-white fill-white" />
                  ) : (
                    <Play className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 text-white fill-white ml-0.5" />
                  )}
                </button>

                {/* Seek Backward 10s */}
                {canControl && (
                  <button
                    onClick={handleRewind10}
                    className="hidden sm:flex p-1 sm:p-2 rounded-lg hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
                    title="Rewind 10s"
                  >
                    <RotateCcw className="w-3 sm:w-4 sm:h-4" />
                  </button>
                )}

                {/* Seek Forward 10s */}
                {canControl && (
                  <button
                    onClick={handleForward10}
                    className="hidden sm:flex p-1 sm:p-2 rounded-lg hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
                    title="Forward 10s"
                  >
                    <RotateCw className="w-3 sm:w-4 sm:h-4" />
                  </button>
                )}

                {/* Volume Control */}
                <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                  <button
                    onClick={toggleMute}
                    className="p-1 sm:p-1.5 rounded-lg hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Mute/Unmute (M)"
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-300" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="volume-slider w-16 sm:w-24 h-1.5 rounded-full accent-brand-400 hidden sm:block cursor-pointer transition-all"
                    style={{
                      background: `linear-gradient(to right, rgb(var(--brand-500-rgb)) 0%, rgb(var(--brand-500-rgb)) ${Math.round((isMuted ? 0 : volume) * 100)}%, rgba(255, 255, 255, 0.2) ${Math.round((isMuted ? 0 : volume) * 100)}%, rgba(255, 255, 255, 0.2) 100%)`,
                    }}
                    aria-label="Volume slider"
                  />
                </div>

                {/* Time Display */}
                <div className="text-[9px] sm:text-[11px] font-mono text-slate-300 tracking-tight px-1 sm:px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.05] whitespace-nowrap shrink-0">
                  <span>{formatTime(currentTime)}</span>
                  <span className="text-slate-500 mx-0.5 sm:mx-1">/</span>
                  <span className="text-slate-400">{formatTime(duration)}</span>
                </div>
              </div>

              {/* Right Controls: Playback Speed, PiP, Fullscreen */}
              <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
                {/* Playback Speed dropdown */}
                <div className="relative" ref={rateMenuRef}>
                  <button
                    onClick={() => setShowRateMenu(!showRateMenu)}
                    disabled={!canControl}
                    className="flex items-center gap-1 px-1 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[10px] sm:text-xs font-mono font-medium text-slate-200 transition-all disabled:opacity-40 cursor-pointer"
                    title="Playback Speed"
                  >
                    <SlidersHorizontal className="w-3 h-3 text-brand-300 hidden sm:block" />
                    <span>{playback.playbackRate}x</span>
                  </button>

                  {showRateMenu && (
                    <div className="absolute bottom-full mb-2.5 right-0 py-1 bg-[#0f1118]/95 backdrop-blur-xl border border-white/[0.12] rounded-xl shadow-glass-elevated z-50 flex flex-col min-w-[90px] animate-scaleUp">
                      {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                        <button
                          key={rate}
                          onClick={() => {
                            onPlaybackRate(rate);
                            setShowRateMenu(false);
                          }}
                          className={`px-3 py-1.5 text-xs text-left font-mono hover:bg-brand-500/20 transition-colors cursor-pointer ${playback.playbackRate === rate ? 'text-brand-400 font-bold bg-white/[0.04]' : 'text-slate-300'
                            }`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Subtitles Button & Popover */}
                <div className="relative" ref={subtitleMenuRef}>
                  <button
                    onClick={() => setShowSubtitleMenu(!showSubtitleMenu)}
                    className={`p-1.5 sm:p-2 rounded-xl border transition-all cursor-pointer ${
                      subtitleState && subtitlesEnabled
                        ? 'bg-brand-500/20 text-brand-300 border-brand-500/40 shadow-glass-glow'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.06] text-slate-300 hover:text-white'
                    }`}
                    title="Subtitles (.srt, .vtt)"
                    aria-label="Subtitles"
                  >
                    <Subtitles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>

                  {/* Hidden file input for subtitle upload */}
                  <input
                    ref={subtitleInputRef}
                    type="file"
                    accept=".srt,.vtt,text/vtt,application/x-subrip"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && onUploadSubtitle) {
                        onUploadSubtitle(file);
                        setSubtitlesEnabled(true);
                      }
                      e.target.value = '';
                    }}
                  />

                  {showSubtitleMenu && (
                    <div className="absolute bottom-full mb-2.5 right-0 py-2 px-1 bg-[#0f1118]/95 backdrop-blur-xl border border-white/[0.12] rounded-xl shadow-glass-elevated z-50 flex flex-col min-w-[210px] animate-scaleUp">
                      <div className="px-3 py-1 text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
                        Subtitles
                      </div>
                      {subtitleState ? (
                        <>
                          <button
                            onClick={() => {
                              setSubtitlesEnabled(true);
                              setShowSubtitleMenu(false);
                            }}
                            className={`flex items-center justify-between px-3 py-1.5 text-xs text-left rounded-lg transition-colors cursor-pointer ${
                              subtitlesEnabled
                                ? 'text-brand-400 font-bold bg-white/[0.06]'
                                : 'text-slate-300 hover:bg-white/[0.04]'
                            }`}
                          >
                            <span className="truncate max-w-[150px]" title={subtitleState.filename}>
                              {subtitleState.filename}
                            </span>
                            {subtitlesEnabled && <Check className="w-3.5 h-3.5 text-brand-400 shrink-0" />}
                          </button>
                          <button
                            onClick={() => {
                              setSubtitlesEnabled(false);
                              setShowSubtitleMenu(false);
                            }}
                            className={`flex items-center justify-between px-3 py-1.5 text-xs text-left rounded-lg transition-colors cursor-pointer ${
                              !subtitlesEnabled
                                ? 'text-brand-400 font-bold bg-white/[0.06]'
                                : 'text-slate-300 hover:bg-white/[0.04]'
                            }`}
                          >
                            <span>Off</span>
                            {!subtitlesEnabled && <Check className="w-3.5 h-3.5 text-brand-400 shrink-0" />}
                          </button>
                          <div className="my-1 border-t border-white/[0.08]" />
                        </>
                      ) : (
                        <div className="px-3 py-1.5 text-xs text-slate-400 italic">
                          No subtitles loaded
                        </div>
                      )}
                      <button
                        onClick={() => {
                          setShowSubtitleMenu(false);
                          subtitleInputRef.current?.click();
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs text-left text-brand-300 hover:text-brand-200 hover:bg-brand-500/10 rounded-lg transition-colors cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 shrink-0" />
                        <span>{subtitleState ? 'Upload new .srt / .vtt' : 'Upload .srt / .vtt'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Zoom to Fill / Aspect Ratio (Ultrawide Black Bars Removal) */}
                <div className="relative" ref={zoomMenuRef}>
                  <button
                    onClick={() => setShowZoomMenu(!showZoomMenu)}
                    className={`p-1.5 sm:p-2 rounded-xl border transition-all cursor-pointer ${
                      zoomScale > 1 || zoomMode !== 'fit'
                        ? 'bg-brand-500/20 text-brand-300 border-brand-500/40 shadow-glass-glow'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.06] text-slate-300 hover:text-white'
                    }`}
                    title={
                      zoomScale > 1
                        ? `Zoom to Fill (${Math.round(zoomScale * 100)}%) - Press Z to toggle`
                        : 'Zoom to Fill / Hide Black Bars (Z)'
                    }
                    aria-label="Zoom to Fill / Aspect Ratio"
                  >
                    <Crop className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>

                  {showZoomMenu && (
                    <div className="absolute bottom-full mb-2.5 right-0 py-2.5 px-3 bg-[#0f1118]/95 backdrop-blur-2xl border border-white/[0.12] rounded-2xl shadow-glass-elevated z-50 flex flex-col w-[260px] animate-scaleUp">
                      {/* Header */}
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.08]">
                        <div className="flex items-center gap-1.5">
                          <Crop className="w-3.5 h-3.5 text-brand-400" />
                          <span className="text-[11px] uppercase font-mono font-bold tracking-wider text-slate-300">
                            Zoom to Fill
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                          {Math.round(zoomScale * 100)}%
                        </span>
                      </div>

                      {/* Preset Modes */}
                      <div className="space-y-1 mb-3">
                        {/* Fit (Default) */}
                        <button
                          onClick={() => {
                            applyZoom('fit', 1);
                            setShowZoomMenu(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left rounded-xl transition-all cursor-pointer ${
                            zoomMode === 'fit' && zoomScale === 1
                              ? 'bg-brand-500/20 text-brand-300 font-semibold border border-brand-500/30'
                              : 'text-slate-300 hover:bg-white/[0.06]'
                          }`}
                        >
                          <div>
                            <div className="font-medium">Fit (Original)</div>
                            <div className="text-[10px] text-slate-400">100% letterbox</div>
                          </div>
                          {zoomMode === 'fit' && zoomScale === 1 && (
                            <Check className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                          )}
                        </button>

                        {/* Zoom to Fill 21:9 Ultrawide (Crop Black Bars) */}
                        <button
                          onClick={() => {
                            applyZoom('fill', 1.34);
                            setShowZoomMenu(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left rounded-xl transition-all cursor-pointer ${
                            zoomMode === 'fill' && Math.abs(zoomScale - 1.34) < 0.02
                              ? 'bg-brand-500/20 text-brand-300 font-semibold border border-brand-500/30'
                              : 'text-slate-300 hover:bg-white/[0.06]'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">Zoom to Fill (21:9)</span>
                              <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                Hide Bars
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400">Crops top & bottom black bars</div>
                          </div>
                          {zoomMode === 'fill' && Math.abs(zoomScale - 1.34) < 0.02 && (
                            <Check className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                          )}
                        </button>

                        {/* Stretch to Fill */}
                        <button
                          onClick={() => {
                            applyZoom('stretch', 1);
                            setShowZoomMenu(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left rounded-xl transition-all cursor-pointer ${
                            zoomMode === 'stretch'
                              ? 'bg-brand-500/20 text-brand-300 font-semibold border border-brand-500/30'
                              : 'text-slate-300 hover:bg-white/[0.06]'
                          }`}
                        >
                          <div>
                            <div className="font-medium">Stretch to Fill</div>
                            <div className="text-[10px] text-slate-400">Full screen without crop</div>
                          </div>
                          {zoomMode === 'stretch' && (
                            <Check className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                          )}
                        </button>
                      </div>

                      {/* Custom Zoom Slider & Quick Chips */}
                      <div className="pt-2 border-t border-white/[0.08]">
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1.5">
                          <span>CUSTOM ZOOM</span>
                          <span className="text-white font-bold">{Math.round(zoomScale * 100)}%</span>
                        </div>

                        <input
                          type="range"
                          min={1}
                          max={1.8}
                          step={0.02}
                          value={zoomScale}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            applyZoom(val === 1 ? 'fit' : 'custom', val);
                          }}
                          className="w-full h-1.5 rounded-full accent-brand-400 bg-white/20 cursor-pointer mb-2"
                          aria-label="Zoom scale slider"
                        />

                        {/* Preset Chips */}
                        <div className="grid grid-cols-4 gap-1">
                          {[1.0, 1.2, 1.34, 1.5].map((scale) => (
                            <button
                              key={scale}
                              onClick={() => {
                                applyZoom(scale === 1 ? 'fit' : scale === 1.34 ? 'fill' : 'custom', scale);
                              }}
                              className={`py-1 text-[10px] font-mono rounded-lg border transition-all cursor-pointer ${
                                Math.abs(zoomScale - scale) < 0.01 && zoomMode !== 'stretch'
                                  ? 'bg-brand-500/25 text-brand-300 border-brand-500/40 font-bold'
                                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.06] text-slate-400 hover:text-white'
                              }`}
                            >
                              {Math.round(scale * 100)}%
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Keyboard Shortcut Note */}
                      <div className="mt-2.5 pt-2 border-t border-white/[0.08] flex items-center justify-between text-[10px] text-slate-400">
                        <span>Quick Toggle</span>
                        <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/[0.1] font-mono text-slate-200 font-bold">
                          Z
                        </kbd>
                      </div>
                    </div>
                  )}
                </div>

                {/* Picture in Picture */}
                <button
                  onClick={(e) => togglePiP(e)}
                  className={`hidden sm:flex p-1.5 sm:p-2 rounded-xl border transition-all cursor-pointer ${isPiP
                      ? 'bg-brand-500/20 text-brand-300 border-brand-500/40 shadow-glass-glow'
                      : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.06] text-slate-300 hover:text-white'
                    }`}
                  title={isPiP ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}
                  aria-label={isPiP ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}
                >
                  <PictureInPicture className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>

                {/* Fullscreen Button */}
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 sm:p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.06] text-slate-300 hover:text-white transition-all"
                  title="Toggle Fullscreen (F)"
                >
                  {isFullscreen ? <Minimize className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Maximize className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
