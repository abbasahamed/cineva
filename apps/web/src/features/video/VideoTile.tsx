import React, { useRef, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, Wifi, WifiOff } from 'lucide-react';

interface VideoTileProps {
  stream: MediaStream | null;
  displayName: string;
  isLocal?: boolean;
  isMuted?: boolean;
  isCameraOff?: boolean;
  connectionState?: RTCPeerConnectionState;
  onToggleMute?: () => void;
  onToggleCamera?: () => void;
}

export const VideoTile: React.FC<VideoTileProps> = ({
  stream,
  displayName,
  isLocal = false,
  isMuted = false,
  isCameraOff = false,
  connectionState = 'connected',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (stream && videoElement.srcObject !== stream) {
      videoElement.srcObject = stream;
      videoElement.play().catch(() => {
        // Auto-play might be restricted until user gesture; playsInline helps
      });
    } else if (!stream) {
      videoElement.srcObject = null;
    }
  }, [stream]);

  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'P';

  const isConnecting = !isLocal && (connectionState === 'connecting' || connectionState === 'new' || !stream);
  const isFailed = !isLocal && (connectionState === 'failed' || connectionState === 'disconnected');

  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-slate-950/80 border border-white/[0.08] shadow-lg backdrop-blur-md aspect-video flex items-center justify-center group select-none transition-all duration-300 hover:border-white/20"
      role="region"
      aria-label={`${displayName}'s video feed`}
    >
      {/* HTML5 Video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isCameraOff || !stream ? 'opacity-0' : 'opacity-100'
        } ${isLocal ? 'scale-x-[-1]' : ''}`}
      />

      {/* Camera Off / Placeholder view */}
      {(isCameraOff || !stream || isConnecting) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 bg-gradient-to-b from-slate-900/90 to-slate-950/95 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-600/30 to-indigo-700/20 border border-brand-500/30 flex items-center justify-center text-white font-bold text-base shadow-glass-glow mb-1.5 transition-transform duration-300 group-hover:scale-105">
            {initials}
          </div>
          {isConnecting ? (
            <span className="text-[10px] text-brand-300 font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-ping"></span>
              Connecting...
            </span>
          ) : isFailed ? (
            <span className="text-[10px] text-rose-400 font-mono flex items-center gap-1">
              <WifiOff className="w-3 h-3" />
              Reconnecting
            </span>
          ) : (
            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
              <VideoOff className="w-3 h-3" />
              Camera off
            </span>
          )}
        </div>
      )}

      {/* Participant Name & Status Overlay Bar */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none z-10">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-white text-[11px] font-medium truncate max-w-[70%] shadow-xs">
          <span className="truncate">{displayName}</span>
          {isLocal && (
            <span className="text-[9px] font-mono text-brand-300 uppercase shrink-0 font-bold">
              (You)
            </span>
          )}
        </div>

        {/* Media indicator badges */}
        <div className="flex items-center gap-1">
          {isMuted ? (
            <div
              className="p-1 rounded-md bg-rose-500/20 border border-rose-500/30 text-rose-300 shadow-xs"
              title="Microphone muted"
              aria-label="Microphone muted"
            >
              <MicOff className="w-3 h-3" />
            </div>
          ) : (
            <div
              className="p-1 rounded-md bg-black/40 border border-white/10 text-emerald-400 shadow-xs"
              title="Microphone active"
              aria-label="Microphone active"
            >
              <Mic className="w-3 h-3" />
            </div>
          )}

          {isCameraOff && (
            <div
              className="p-1 rounded-md bg-amber-500/20 border border-amber-500/30 text-amber-300 shadow-xs"
              title="Camera turned off"
              aria-label="Camera turned off"
            >
              <VideoOff className="w-3 h-3" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
