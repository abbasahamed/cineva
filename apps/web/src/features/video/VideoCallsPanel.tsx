import React from 'react';
import { Video, VideoOff, Mic, MicOff, AlertCircle } from 'lucide-react';
import { useVideoControls, useVideoPeers } from './VideoContext.js';
import { VideoTile } from './VideoTile.js';

export const VideoCallsPanel: React.FC = () => {
  const {
    isCameraOn,
    isMuted,
    isConnecting,
    permissionError,
    toggleCamera,
    toggleMute,
    dismissError,
  } = useVideoControls();

  const { cameraPeers, currentDisplayName, currentParticipantId, getStream } = useVideoPeers();

  const totalCameras = (isCameraOn ? 1 : 0) + cameraPeers.length;

  return (
    <div
      className="w-full bg-[#080a13]/90 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3 flex flex-col shrink-0 mb-3 select-none shadow-xl"
      role="region"
      aria-label="Video calls panel"
      style={{
        contain: 'layout paint',
        isolation: 'isolate',
      }}
    >
      {/* Header bar: Title + Quick Device Controls */}
      <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06] mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-brand-500/15 border border-brand-500/25 flex items-center justify-center text-brand-300">
            <Video className="w-3 h-3 text-brand-400" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
            Video Calls
          </span>
          {totalCameras > 0 && (
            <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              {totalCameras}
            </span>
          )}
        </div>

        {/* Quick Device Toggles */}
        <div className="flex items-center gap-1.5">
          {/* Mic Toggle Button */}
          <button
            onClick={toggleMute}
            className={`p-1.5 rounded-lg border text-xs font-medium transition-all active:scale-95 cursor-pointer ${
              isMuted
                ? 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/30 text-rose-300'
                : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-emerald-400 hover:text-emerald-300'
            }`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>

          {/* Camera Toggle Button */}
          <button
            onClick={toggleCamera}
            disabled={isConnecting}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
              isCameraOn
                ? 'bg-brand-500/25 hover:bg-brand-500/35 border-brand-500/40 text-brand-300 shadow-[0_0_12px_rgba(99,102,241,0.25)]'
                : isConnecting
                ? 'bg-brand-500/10 border-brand-500/20 text-brand-300 animate-pulse cursor-wait'
                : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300 hover:text-white'
            }`}
            title={isCameraOn ? 'Turn camera off' : 'Turn camera on'}
            aria-label={isCameraOn ? 'Turn camera off' : 'Turn camera on'}
          >
            {isCameraOn ? (
              <Video className="w-3.5 h-3.5 text-brand-400" />
            ) : (
              <VideoOff className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span className="text-[11px] font-medium">
              {isCameraOn ? 'Camera' : isConnecting ? 'Starting...' : 'Camera Off'}
            </span>
          </button>
        </div>
      </div>

      {/* Permission / Device Notice (if any) */}
      {permissionError && (
        <div className="p-2 mb-2 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start justify-between gap-2 text-rose-300 text-xs">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
            <p className="text-[11px] leading-tight text-slate-300">{permissionError}</p>
          </div>
          <button
            onClick={dismissError}
            className="text-[10px] text-slate-400 hover:text-white shrink-0 ml-1 underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {totalCameras === 0 ? (
        // Empty State: No cameras on
        <div className="py-5 px-3 rounded-xl bg-white/[0.015] border border-dashed border-white/[0.06] text-center flex flex-col items-center justify-center">
          <div className="w-8 h-8 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-2 shadow-xs">
            <VideoOff className="w-4 h-4" />
          </div>
          <p className="text-xs font-semibold text-slate-200 mb-0.5">No cameras on</p>
          <p className="text-[10px] text-slate-400 max-w-[190px] leading-normal">
            Turn on your camera to see your friends here.
          </p>
        </div>
      ) : (
        // Grid of active camera tiles
        <div
          className={`grid gap-2 transition-all duration-200 ${
            totalCameras === 1
              ? 'grid-cols-1'
              : totalCameras === 2
              ? 'grid-cols-2'
              : 'grid-cols-2'
          }`}
        >
          {/* Local Camera Tile (if on) */}
          {isCameraOn && (
            <VideoTile
              participantId={currentParticipantId}
              displayName={currentDisplayName}
              stream={getStream(currentParticipantId || '', true)}
              isLocal={true}
              isMuted={isMuted}
              isCameraOff={false}
              getStream={getStream}
            />
          )}

          {/* Remote Camera Tiles */}
          {cameraPeers.map((peer) => (
            <VideoTile
              key={peer.participantId}
              participantId={peer.participantId}
              displayName={peer.displayName}
              stream={peer.stream || getStream(peer.participantId, false)}
              isLocal={false}
              isMuted={peer.isMuted}
              isCameraOff={peer.isCameraOff}
              connectionState={peer.connectionState}
              getStream={getStream}
            />
          ))}
        </div>
      )}
    </div>
  );
};
