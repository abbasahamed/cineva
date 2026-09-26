import React, { useRef, useEffect } from 'react';
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

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const resolvedStream = getStream
      ? getStream(participantId || '', isLocal)
      : stream !== undefined
      ? stream
      : null;

    if (resolvedStream && videoElement.srcObject !== resolvedStream) {
      videoElement.srcObject = resolvedStream;
      videoElement.play().catch(() => {});
    } else if (!resolvedStream && videoElement.srcObject) {
      videoElement.srcObject = null;
    }
  }, [participantId, isLocal, getStream, stream, isCameraOff]);

  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'P';

  const isConnecting = !isLocal && (connectionState === 'connecting' || connectionState === 'new');
  const isFailed = !isLocal && (connectionState === 'failed' || connectionState === 'disconnected');

  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-[#070913] border border-white/[0.08] shadow-sm flex items-center justify-center select-none w-full aspect-video transition-all hover:border-white/20"
      style={{ contain: 'layout paint' }}
      role="region"
      aria-label={`${displayName}'s video feed`}
    >
      {/* HTML5 Video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
        style={{
          contain: 'layout paint',
          display: isCameraOff ? 'none' : 'block',
        }}
      />

      {/* Camera Off / Connecting State */}
      {(isCameraOff || isConnecting || isFailed) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-2 bg-[#090c18] text-center z-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600/30 to-indigo-700/20 border border-brand-500/30 flex items-center justify-center text-white font-bold text-sm shadow-sm mb-1">
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

      {/* Bottom overlay: Name & Mute Badge */}
      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none z-10">
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/75 border border-white/10 text-white text-[10px] font-medium truncate max-w-[75%] shadow-xs">
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
              className="p-1 rounded-md bg-rose-500/20 border border-rose-500/30 text-rose-300 shadow-xs"
              title="Microphone muted"
              aria-label="Microphone muted"
            >
              <MicOff className="w-2.5 h-2.5" />
            </div>
          ) : (
            <div
              className="p-1 rounded-md bg-black/60 border border-white/10 text-emerald-400 shadow-xs"
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
