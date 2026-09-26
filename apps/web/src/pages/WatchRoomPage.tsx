import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useSyncWatch } from '../hooks/useSyncWatch.js';
import { Navbar } from '../components/Navbar.js';
import { VideoPlayer } from '../components/VideoPlayer.js';
import { ChatPanel } from '../components/ChatPanel.js';
import { ParticipantsList } from '../components/ParticipantsList.js';
import { MediaUploadModal } from '../components/MediaUploadModal.js';
import { SettingsModal } from '../components/SettingsModal.js';
import { ShareModal } from '../components/ShareModal.js';
import { DebugPanel } from '../components/DebugPanel.js';
import { useToast } from '../components/Toast.js';
import { MessageSquare, Users, AlertCircle, ArrowLeft, RefreshCw, UploadCloud, Film, Video } from 'lucide-react';
import { CinematicBackground } from '../components/CinematicBackground.js';
import { useVideoCall, VideoCallPanel } from '../features/video/index.js';

function formatMediaInfo(media: { title: string; size?: number | string } | null | undefined) {
  if (!media) return { displayTitle: 'Private Screening', size: null, rawTitle: '' };

  let title = media.title || 'Screening';
  title = title.replace(/\.[^/.]+$/, '');
  title = title.replace(/[._]/g, ' ');
  const cleanTitle = title.replace(/\s+(1080p|720p|480p|2160p|4K|WEB-?DL|WEBRip|BluRay|BRRip|HDRip|DVDRip|x264|x265|HEVC|AVC|AAC|DDP?\d\.\d|TRUEHD|H\.264|H\.265)\b.*/i, '').trim();

  const sizeNum = Number(media.size);
  const formattedSize = !isNaN(sizeNum) && sizeNum > 0
    ? sizeNum >= 1024 * 1024 * 1024
      ? `${(sizeNum / (1024 * 1024 * 1024)).toFixed(2)} GB`
      : `${(sizeNum / (1024 * 1024)).toFixed(1)} MB`
    : null;

  return {
    displayTitle: cleanTitle || media.title.replace(/\.[^/.]+$/, ''),
    size: formattedSize,
    rawTitle: media.title,
  };
}

export const WatchRoomPage: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();

  const code = (roomCode || '').toUpperCase();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Check stored session identity
  useEffect(() => {
    if (!code) return;
    const storedName = sessionStorage.getItem(`sw_name_${code}`);
    const storedSession = sessionStorage.getItem(`sw_session_${code}`);

    if (storedName && storedSession) {
      setDisplayName(storedName);
      setSessionId(storedSession);
    } else {
      // If user navigated directly to /room/A7K9PX without session, redirect to /join/A7K9PX
      navigate(`/join/${code}`, { replace: true });
    }
  }, [code, navigate]);

  // If session not ready yet, return meaningful loading screen
  if (!code || !displayName || !sessionId) {
    return (
      <div className="min-h-screen bg-[#040507] flex flex-col items-center justify-center text-slate-400 p-6 text-center relative overflow-hidden">
        <CinematicBackground variant="subtle" />
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center mb-4 text-brand-300 shadow-glass-glow">
            <RefreshCw className="w-6 h-6 animate-spin text-brand-400" />
          </div>
          <p className="text-sm font-semibold text-white mb-1">Entering private cinema...</p>
          <p className="text-xs text-slate-400">Connecting to synchronized room</p>
        </div>
      </div>
    );
  }

  return <WatchRoomInner roomCode={code} displayName={displayName} sessionId={sessionId} />;
};

interface WatchRoomInnerProps {
  roomCode: string;
  displayName: string;
  sessionId: string;
}

const WatchRoomInner: React.FC<WatchRoomInnerProps> = ({ roomCode, displayName, sessionId }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'chat' | 'participants'>('chat');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  const {
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
  } = useSyncWatch({ roomCode, displayName, sessionId });

  const currentParticipant = participants.find((p) => p.sessionId === sessionId);
  const mediaInfo = formatMediaInfo(room?.media);

  const videoCall = useVideoCall({
    roomCode,
    currentParticipantId: currentParticipant?.id,
    currentDisplayName: displayName,
  });

  // Handle Room Ended or Fatal Error
  if (connectionStatus === 'ended' || (connectionStatus === 'error' && errorMessage)) {
    return (
      <div className="min-h-screen bg-[#040507] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        <CinematicBackground variant="subtle" />
        <div className="relative z-10 flex flex-col items-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mb-5 text-rose-400 shadow-glass-sm">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-extrabold text-white mb-2">Screening Ended</h2>
          <p className="text-slate-400 text-xs mb-6 leading-relaxed">
            {errorMessage || 'This private cinema screening is no longer active.'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl glass-btn-primary text-white text-xs font-semibold transition-all active:scale-95 shadow-md"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Home</span>
          </button>
        </div>
      </div>
    );
  }

  const [isCompanionOpen, setIsCompanionOpen] = useState(true);

  return (
    <div className="min-h-screen h-screen flex flex-col bg-[#020306] text-slate-100 overflow-hidden select-none relative">
      {/* Subtle Cinema Atmosphere Background (faint distant stars & deep space ambient) */}
      <CinematicBackground variant="cinema" />

      {/* Top Cinema Navbar */}
      <Navbar
        room={room}
        participants={participants}
        connectionStatus={connectionStatus}
        isHost={isHost}
        onOpenShare={() => setIsShareOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLeaveRoom={() => navigate('/')}
        activeSidebarTab={activeTab}
        onToggleSidebarTab={(tab) => {
          setActiveTab(tab);
          setIsCompanionOpen(true);
        }}
        isCompanionOpen={isCompanionOpen}
        onToggleCompanion={() => setIsCompanionOpen(!isCompanionOpen)}
      />

      {/* Main Theater Viewport */}
      <main className="flex-1 flex flex-col xl:flex-row overflow-hidden p-3 sm:p-5 lg:p-6 gap-4 sm:gap-6 min-h-0 relative z-10 justify-center items-center">
        {/* Dominant Cinema Stage */}
        <div className={`flex-1 flex flex-col justify-start items-center min-w-0 min-h-0 h-full w-full overflow-y-auto no-scrollbar transition-all duration-300 ${isCompanionOpen ? 'max-w-5xl 2xl:max-w-6xl' : 'max-w-6xl 2xl:max-w-7xl'
          }`}>
          <div className="w-full flex flex-col justify-center relative my-auto">
            {/* Screen-Light Ambient Backlight Glow emitting into surrounding theater */}
            <div
              className="absolute -inset-6 sm:-inset-12 rounded-3xl bg-gradient-to-tr from-brand-600/25 via-indigo-600/20 to-purple-600/15 blur-[70px] sm:blur-[110px] opacity-45 sm:opacity-55 pointer-events-none -z-10 transition-opacity duration-1000"
              aria-hidden="true"
            />

            {/* Cinema Video Screen */}
            <VideoPlayer
              videoRef={videoRef}
              media={room?.media}
              playback={playback}
              isHost={isHost}
              canControl={canControl}
              needsUserGesture={needsUserGesture}
              onPlay={handlePlay}
              onPause={handlePause}
              onSeek={handleSeek}
              onLocalScrubPreview={handleLocalScrubPreview}
              onPlaybackRate={handlePlaybackRate}
              onUserGestureStart={handleUserGestureStart}
              onOpenUpload={() => setIsUploadOpen(true)}
            />

            {/* Cinematic Movie Title & Metadata Header Area */}
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-2 sm:px-3">
              {/* Left: Movie Title & Format */}
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-base sm:text-xl font-bold tracking-tight text-white truncate drop-shadow-xs">
                    {room?.media ? mediaInfo.displayTitle : room?.name || 'Private Screening'}
                  </h2>
                  {isHost && (
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-300 border border-brand-500/30 shrink-0">
                      HOST
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-1">
                  {mediaInfo.size && (
                    <span className="text-slate-300 font-medium">{mediaInfo.size}</span>
                  )}
                  {mediaInfo.size && <span className="text-white/20">•</span>}
                  <span className="text-brand-300 font-medium">1080p HD</span>
                  <span className="text-white/20">•</span>
                  <span className="text-slate-400">Sub-frame Sync</span>
                </div>
              </div>

              {/* Right: Actions, Video Call & Companion Dock Trigger */}
              <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                {isHost && room?.media && (
                  <button
                    onClick={() => setIsUploadOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-brand-300 hover:text-brand-200 transition-all active:scale-95"
                    title="Change screening video"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Change Video</span>
                  </button>
                )}

                {/* Video Call Trigger Button */}
                <button
                  onClick={() => {
                    if (videoCall.isCallActive) {
                      videoCall.leaveCall();
                    } else {
                      videoCall.startCall();
                    }
                  }}
                  disabled={videoCall.isConnecting}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
                    videoCall.isCallActive
                      ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/40 text-emerald-300 shadow-glass-glow'
                      : videoCall.isConnecting
                      ? 'bg-brand-500/20 border-brand-500/30 text-brand-300 animate-pulse cursor-wait'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300 hover:text-white'
                  }`}
                  title={videoCall.isCallActive ? 'Leave video call' : 'Start video call'}
                  aria-label={videoCall.isCallActive ? 'Leave video call' : 'Start video call'}
                >
                  <Video className={`w-3.5 h-3.5 ${videoCall.isCallActive ? 'text-emerald-400' : 'text-brand-400'}`} />
                  <span>
                    {videoCall.isCallActive
                      ? 'In Call'
                      : videoCall.isConnecting
                      ? 'Starting...'
                      : 'Start Video'}
                  </span>
                </button>

                {/* Companion Expand/Collapse Quick Toggle on Desktop */}
                <button
                  onClick={() => setIsCompanionOpen(!isCompanionOpen)}
                  className={`hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                    isCompanionOpen
                      ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300'
                      : 'bg-brand-500/20 hover:bg-brand-500/30 border-brand-500/40 text-brand-300 shadow-glass-glow'
                  }`}
                  title={isCompanionOpen ? 'Hide companion panel' : 'Show companion panel'}
                >
                  <MessageSquare className="w-3.5 h-3.5 text-brand-400" />
                  <span>{isCompanionOpen ? 'Hide Chat' : 'Show Chat'}</span>
                </button>
              </div>
            </div>

            {/* Video Call Active Panel */}
            {(videoCall.isCallActive || videoCall.permissionError || videoCall.status === 'requesting-permissions') && (
              <VideoCallPanel controls={videoCall} currentDisplayName={displayName} />
            )}
          </div>
        </div>

        {/* Floating Cinema Companion Panel (Chat & Audience) */}
        {isCompanionOpen && (
          <div className="w-full xl:w-80 2xl:w-88 flex flex-col shrink-0 h-64 sm:h-72 xl:h-full max-h-[580px] xl:max-h-full animate-fadeIn">
            {/* Segmented Tab Switcher */}
            <div className="flex items-center bg-[#0a0c16]/70 p-1 rounded-2xl border border-white/[0.08] backdrop-blur-xl mb-3 shrink-0 shadow-xs">
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-xl text-xs font-medium transition-all ${activeTab === 'chat'
                    ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-md shadow-brand-600/30 border border-white/20'
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat</span>
              </button>
              <button
                onClick={() => setActiveTab('participants')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-xl text-xs font-medium transition-all ${activeTab === 'participants'
                    ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-md shadow-brand-600/30 border border-white/20'
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Audience ({participants.length})</span>
              </button>
            </div>

            {/* Tab Content Panel */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {activeTab === 'chat' ? (
                <ChatPanel
                  messages={chatMessages}
                  currentParticipantId={currentParticipant?.id}
                  onSendMessage={handleSendMessage}
                />
              ) : (
                <ParticipantsList
                  participants={participants}
                  currentSessionId={sessionId}
                  isHost={isHost}
                  onKickParticipant={handleKickParticipant}
                />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Share Modal */}
      {room && (
        <ShareModal
          isOpen={isShareOpen}
          roomCode={room.roomCode}
          roomName={room.name}
          onClose={() => setIsShareOpen(false)}
        />
      )}

      {/* Upload Media Modal */}
      {room && (
        <MediaUploadModal
          roomId={room.id}
          sessionId={sessionId}
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          onUploadComplete={() => {
            // Socket will receive updated room state automatically
          }}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        room={room}
        isOpen={isSettingsOpen}
        isHost={isHost}
        onClose={() => setIsSettingsOpen(false)}
        onUpdateSettings={handleUpdateSettings}
        onUpdateTitle={handleUpdateTitle}
        onEndRoom={handleEndRoom}
      />

      {/* Synchronization Diagnostics Panel (Visible ONLY when explicitly requesting ?debug=1) */}
      {(window.location.search.includes('debug=1') || searchParams.get('debug') === '1') && (
        <DebugPanel
          playback={playback}
          connectionStatus={connectionStatus}
          isHost={isHost}
          rtt={rtt}
          videoRef={videoRef as React.RefObject<HTMLVideoElement>}
        />
      )}
    </div>
  );
};
