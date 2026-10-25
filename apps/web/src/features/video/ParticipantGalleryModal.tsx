import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Maximize, Minimize, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { ParticipantInfo } from '@cineva/shared';
import { VideoPeerDisplayState } from './videoCallTypes.js';
import { VideoTile } from './VideoTile.js';

interface ParticipantGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomTitle?: string;
  participants: ParticipantInfo[];
  sessionId: string;
  currentParticipantId?: string;
  currentDisplayName?: string;
  isHost: boolean;
  isCameraOn: boolean;
  isMuted: boolean;
  allPeers: VideoPeerDisplayState[];
  participantVolumes: Map<string, number>;
  participantMutedLocally: Map<string, boolean>;
  onVolumeChange: (participantId: string, volume: number) => void;
  onToggleLocalMute: (participantId: string) => void;
  onToggleCamera: () => Promise<void>;
  onToggleMute: () => Promise<void>;
  getStream: (participantId: string, isLocal?: boolean) => MediaStream | null;
}

export const ParticipantGalleryModal: React.FC<ParticipantGalleryModalProps> = ({
  isOpen,
  onClose,
  roomTitle,
  participants,
  sessionId,
  currentParticipantId,
  currentDisplayName,
  isHost,
  isCameraOn,
  isMuted,
  allPeers,
  participantVolumes,
  participantMutedLocally,
  onVolumeChange,
  onToggleLocalMute,
  onToggleCamera,
  onToggleMute,
  getStream,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);

  // Sync native fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsNativeFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Handle Escape key to close gallery
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleNativeFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }, []);

  if (!isOpen) return null;

  // Total count of participants (local + remote)
  const totalCount = participants.length > 0 ? participants.length : 1;

  // Responsive grid class based on participant count
  let gridColsClass = 'grid-cols-1 max-w-2xl';
  if (totalCount === 2) {
    gridColsClass = 'grid-cols-1 md:grid-cols-2 max-w-4xl';
  } else if (totalCount >= 3 && totalCount <= 4) {
    gridColsClass = 'grid-cols-1 sm:grid-cols-2 max-w-5xl';
  } else if (totalCount >= 5 && totalCount <= 6) {
    gridColsClass = 'grid-cols-2 md:grid-cols-3 max-w-6xl';
  } else if (totalCount >= 7 && totalCount <= 9) {
    gridColsClass = 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-w-7xl';
  } else if (totalCount >= 10) {
    gridColsClass = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 max-w-7xl';
  }

  const localParticipant = participants.find((p) => p.sessionId === sessionId);
  const remoteParticipants = participants.filter((p) => p.sessionId !== sessionId);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col justify-between overflow-hidden bg-[#06080e]/85 backdrop-blur-2xl transition-all duration-300"
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen Participant Gallery"
    >
      {/* Gallery Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-black/40 backdrop-blur-md shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <h2 className="text-white text-base font-bold tracking-tight">Participant Gallery</h2>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-slate-300 text-xs font-mono">
            {totalCount} in call
          </span>
          {roomTitle && (
            <span className="text-xs text-slate-400 hidden sm:inline-block truncate max-w-xs border-l border-white/10 pl-3">
              {roomTitle}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Native Browser Fullscreen Toggle */}
          <button
            type="button"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors flex items-center gap-1.5 text-xs font-medium"
            onClick={toggleNativeFullscreen}
            title={isNativeFullscreen ? 'Exit browser fullscreen' : 'Expand to browser fullscreen'}
            aria-label={isNativeFullscreen ? 'Exit browser fullscreen' : 'Expand to browser fullscreen'}
          >
            {isNativeFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            <span className="hidden sm:inline">{isNativeFullscreen ? 'Windowed' : 'Maximize'}</span>
          </button>

          {/* Close Gallery / Return to Room */}
          <button
            type="button"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all flex items-center gap-1.5 text-xs font-semibold shadow-xs"
            onClick={onClose}
            title="Return to room (Esc)"
            aria-label="Close participant gallery"
          >
            <X className="w-4 h-4" />
            <span>Close (Esc)</span>
          </button>
        </div>
      </header>

      {/* Main Gallery Grid Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 flex items-center justify-center">
        <div className={`w-full grid gap-4 sm:gap-6 ${gridColsClass} mx-auto auto-rows-fr`}>
          {/* 1. Local Participant Tile */}
          <div className="aspect-video w-full rounded-2xl overflow-hidden shadow-2xl">
            <VideoTile
              participantId={currentParticipantId}
              displayName={currentDisplayName || localParticipant?.displayName || 'You'}
              stream={getStream(currentParticipantId || '', true)}
              isLocal={true}
              isHost={isHost}
              isMuted={isMuted}
              isCameraOff={!isCameraOn}
              getStream={getStream}
              showVolumeControl={false}
              className="h-full w-full"
            />
          </div>

          {/* 2. Remote Participant Tiles */}
          {remoteParticipants.map((p) => {
            const peer = allPeers.find((cp) => cp.participantId === p.id);
            const isPeerCameraOff = peer ? peer.isCameraOff : true;
            const peerStream = peer?.stream || getStream(p.id, false);
            const volume = participantVolumes.get(p.id) ?? 100;
            const isLocallyMuted = participantMutedLocally.get(p.id) ?? false;

            return (
              <div key={p.id} className="aspect-video w-full rounded-2xl overflow-hidden shadow-2xl">
                <VideoTile
                  participantId={p.id}
                  displayName={p.displayName}
                  stream={peerStream}
                  isLocal={false}
                  isHost={p.isHost}
                  isMuted={peer?.isMuted ?? false}
                  isCameraOff={isPeerCameraOff}
                  connectionState={peer?.connectionState}
                  volume={volume}
                  isLocallyMuted={isLocallyMuted}
                  onVolumeChange={(vol) => onVolumeChange(p.id, vol)}
                  onToggleLocalMute={() => onToggleLocalMute(p.id)}
                  getStream={getStream}
                  showVolumeControl={true}
                  className="h-full w-full"
                />
              </div>
            );
          })}
        </div>
      </main>

      {/* Floating Bottom Action Toolbar */}
      <footer className="p-4 flex items-center justify-center gap-3 border-t border-white/[0.08] bg-black/40 backdrop-blur-md shrink-0 z-10">
        {/* Mic Toggle Button */}
        <button
          type="button"
          onClick={onToggleMute}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-md ${
            isMuted
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/35 hover:bg-rose-500/30'
              : 'bg-white/10 text-white border border-white/15 hover:bg-white/20'
          }`}
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? <MicOff className="w-4 h-4 text-rose-400" /> : <Mic className="w-4 h-4 text-emerald-400" />}
          <span>{isMuted ? 'Muted' : 'Mute'}</span>
        </button>

        {/* Camera Toggle Button */}
        <button
          type="button"
          onClick={onToggleCamera}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-md ${
            !isCameraOn
              ? 'bg-white/10 text-slate-300 border border-white/15 hover:bg-white/20'
              : 'bg-brand-600/30 text-brand-200 border border-brand-500/40 hover:bg-brand-600/40'
          }`}
          aria-label={isCameraOn ? 'Turn camera off' : 'Turn camera on'}
        >
          {!isCameraOn ? <VideoOff className="w-4 h-4 text-slate-400" /> : <Video className="w-4 h-4 text-brand-300" />}
          <span>{isCameraOn ? 'Camera on' : 'Camera off'}</span>
        </button>

        {/* Return to Watch Room Button */}
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-white text-black hover:bg-slate-200 transition-colors shadow-md ml-2"
        >
          <span>Back to Screening</span>
        </button>
      </footer>
    </div>
  );
};
