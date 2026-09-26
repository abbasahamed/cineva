import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  ChevronDown,
  ChevronUp,
  Users,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { VideoCallControls } from './videoCallTypes.js';
import { VideoTile } from './VideoTile.js';

interface VideoCallPanelProps {
  controls: VideoCallControls;
  currentDisplayName: string;
}

export const VideoCallPanel: React.FC<VideoCallPanelProps> = ({
  controls,
  currentDisplayName,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

  const {
    isCallActive,
    isConnecting,
    status,
    permissionError,
    localStream,
    remotePeers,
    isMuted,
    isCameraOff,
    leaveCall,
    toggleMute,
    toggleCamera,
    startCall,
  } = controls;

  if (!isCallActive && status !== 'requesting-permissions' && !permissionError) {
    return null;
  }

  const remotePeerList = Array.from(remotePeers.values());
  const totalCallParticipants = 1 + remotePeerList.length;

  return (
    <div
      className="w-full bg-[#070913]/90 backdrop-blur-2xl border border-white/[0.1] rounded-3xl p-3.5 sm:p-4 shadow-2xl transition-all duration-300 mt-4 relative z-20"
      role="region"
      aria-label="Active video call panel"
    >
      {/* Header bar: Title, Call status, Minimize & Leave buttons */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-300">
            <Video className="w-3.5 h-3.5 text-brand-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-wide">
                Private Cinema Call
              </span>
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                LIVE ({totalCallParticipants})
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons: Minimize / Maximize + Leave */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] transition-all"
            title={isMinimized ? 'Expand video call' : 'Minimize video call'}
            aria-label={isMinimized ? 'Expand video call' : 'Minimize video call'}
          >
            {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          <button
            onClick={leaveCall}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 hover:text-rose-200 text-xs font-semibold transition-all active:scale-95 shadow-xs"
            title="Leave video call"
            aria-label="Leave video call"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Leave Video</span>
          </button>
        </div>
      </div>

      {/* Permission Error State */}
      {permissionError && (
        <div className="p-3 mb-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-2.5 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold mb-0.5">Camera / Microphone Notice</p>
            <p className="text-slate-300 text-[11px] leading-relaxed">{permissionError}</p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={startCall}
                className="px-3 py-1 rounded-xl bg-rose-500/25 hover:bg-rose-500/40 border border-rose-500/40 text-white text-[11px] font-medium transition-all"
              >
                Try Again
              </button>
              <button
                onClick={leaveCall}
                className="px-3 py-1 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-[11px] font-medium transition-all"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Content Grid (Collapsible) */}
      {!isMinimized && (
        <>
          <div
            className={`grid gap-3 transition-all duration-300 ${
              remotePeerList.length === 0
                ? 'grid-cols-1 sm:grid-cols-2 max-w-xl mx-auto'
                : remotePeerList.length === 1
                ? 'grid-cols-1 sm:grid-cols-2'
                : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'
            }`}
          >
            {/* Local Video Tile */}
            <VideoTile
              stream={localStream}
              displayName={currentDisplayName}
              isLocal={true}
              isMuted={isMuted}
              isCameraOff={isCameraOff}
            />

            {/* Remote Peer Tiles */}
            {remotePeerList.map((peer) => (
              <VideoTile
                key={peer.participant.participantId}
                stream={peer.stream}
                displayName={peer.participant.displayName}
                isLocal={false}
                isMuted={peer.isMuted}
                isCameraOff={peer.isCameraOff}
                connectionState={peer.connectionState}
              />
            ))}

            {/* Waiting for peers placeholder tile if alone in call */}
            {remotePeerList.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] aspect-video flex flex-col items-center justify-center p-4 text-center">
                <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-400 mb-2">
                  <Users className="w-5 h-5" />
                </div>
                <p className="text-xs font-medium text-slate-200 mb-0.5">Alone in call</p>
                <p className="text-[10px] text-slate-400 max-w-[180px]">
                  Waiting for other room participants to start their video...
                </p>
              </div>
            )}
          </div>

          {/* Floating Control Toolbar */}
          <div className="mt-3.5 pt-3 border-t border-white/[0.06] flex items-center justify-center gap-2.5">
            <button
              onClick={toggleMute}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 shadow-sm ${
                isMuted
                  ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-500/40 text-rose-300'
                  : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.1] text-slate-100'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff className="w-4 h-4 text-rose-400" /> : <Mic className="w-4 h-4 text-emerald-400" />}
              <span>{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>

            <button
              onClick={toggleCamera}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 shadow-sm ${
                isCameraOff
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300'
                  : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.1] text-slate-100'
              }`}
              title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
              aria-label={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
            >
              {isCameraOff ? (
                <VideoOff className="w-4 h-4 text-amber-400" />
              ) : (
                <Video className="w-4 h-4 text-brand-400" />
              )}
              <span>{isCameraOff ? 'Camera On' : 'Camera Off'}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
