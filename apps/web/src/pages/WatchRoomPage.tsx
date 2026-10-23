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
import { MessageSquare, Users, AlertCircle, ArrowLeft, RefreshCw, UploadCloud, Video, VideoOff, Mic, MicOff } from 'lucide-react';
import { CinematicBackground } from '../components/CinematicBackground.js';
import { VideoProvider, useVideoControls, VideoCallsPanel, WebRTCDebugPanel } from '../features/video/index.js';

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

/**
 * Isolated device controls in room header to prevent re-rendering the whole page
 */
const RoomHeaderDeviceControls: React.FC = () => {
  const { isCameraOn, isMuted, isConnecting, toggleCamera, toggleMute } = useVideoControls();

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {/* Camera Toggle */}
      <button
        onClick={toggleCamera}
        disabled={isConnecting}
        className={`w-9 h-9 sm:w-auto sm:h-auto flex items-center justify-center sm:gap-1.5 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
          isCameraOn
            ? 'bg-brand-500/20 hover:bg-brand-500/30 border-brand-500/40 text-brand-300'
            : isConnecting
            ? 'bg-brand-500/10 border-brand-500/20 text-brand-300 animate-pulse cursor-wait'
            : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300 hover:text-white'
        }`}
        title={isCameraOn ? 'Turn camera off' : 'Turn camera on'}
        aria-label={isCameraOn ? 'Turn camera off' : 'Turn camera on'}
      >
        {isCameraOn ? (
          <Video className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-brand-400" />
        ) : (
          <VideoOff className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-slate-400" />
        )}
        <span className="hidden sm:inline">{isCameraOn ? 'Camera' : isConnecting ? 'Starting...' : 'Camera Off'}</span>
      </button>

      {/* Mic Toggle */}
      <button
        onClick={toggleMute}
        className={`w-9 h-9 sm:w-auto sm:h-auto flex items-center justify-center sm:gap-1.5 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
          isMuted
            ? 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/30 text-rose-300'
            : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-emerald-400 hover:text-emerald-300'
        }`}
        title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
      >
        {isMuted ? (
          <MicOff className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-rose-400" />
        ) : (
          <Mic className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-emerald-400" />
        )}
        <span className="hidden sm:inline">{isMuted ? 'Muted' : 'Mic'}</span>
      </button>
    </div>
  );
};

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
  const [isCompanionOpen, setIsCompanionOpen] = useState(true);

  const {
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
  } = useSyncWatch({ roomCode, displayName, sessionId });

  const currentParticipant = participants.find((p) => p.sessionId === sessionId);
  const mediaInfo = formatMediaInfo(room?.media);

  // Auto-toast & automatic redirect when room is cancelled/ended
  useEffect(() => {
    if (connectionStatus === 'ended') {
      showToast(
        errorMessage || 'Room cancelled: The host has left the room. This screening has ended. Returning to Home...',
        'error'
      );
      const timer = setTimeout(() => {
        navigate('/', { replace: true });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [connectionStatus, errorMessage, navigate, showToast]);

  // Handle Room Ended or Fatal Error
  if (connectionStatus === 'ended' || (connectionStatus === 'error' && errorMessage)) {
    return (
      <div className="min-h-screen bg-[#040507] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        <CinematicBackground variant="subtle" />
        <div className="relative z-10 flex flex-col items-center max-w-sm animate-fadeIn">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mb-5 text-rose-400 shadow-glass-sm">
            <AlertCircle className="w-7 h-7 animate-pulse" />
          </div>
          <h2 className="text-xl font-extrabold text-white mb-2">Room Cancelled</h2>
          <p className="text-slate-400 text-xs mb-4 leading-relaxed">
            {errorMessage || 'The host has left the room. This screening has ended.'}
          </p>
          <div className="text-brand-400 text-xs font-semibold flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Returning to Home...</span>
          </div>
        </div>
      </div>
    );
  }

  const debugNoMovie = searchParams.get('debugNoMovie') === '1';
  const debugNoBackground = searchParams.get('debugNoBackground') === '1';
  const debugNoSidebar = searchParams.get('debugNoSidebar') === '1';
  const debugPlainRoom = searchParams.get('debugPlainRoom') === '1';

  return (
    <VideoProvider
      roomCode={roomCode}
      currentParticipantId={currentParticipant?.id}
      currentDisplayName={displayName}
    >
      <div className="min-h-screen h-screen flex flex-col bg-[#020306] text-slate-100 overflow-hidden select-none relative">
        {/* Subtle Cinema Atmosphere Background */}
        {!debugNoBackground && !debugPlainRoom && <CinematicBackground variant="cinema" />}

        {/* Top Cinema Navbar */}
        <Navbar
          room={room}
          participants={participants}
          connectionStatus={connectionStatus}
          isHost={isHost}
          onOpenShare={() => setIsShareOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onLeaveRoom={() => {
            handleLeaveRoom();
            navigate('/', { replace: true });
          }}
          activeSidebarTab={activeTab}
          onToggleSidebarTab={(tab) => {
            setActiveTab(tab);
            setIsCompanionOpen(true);
          }}
          isCompanionOpen={isCompanionOpen}
          onToggleCompanion={() => setIsCompanionOpen(!isCompanionOpen)}
        />

        {/* Main Theater Viewport: Dominant Movie (~70%) + Right Sidebar (~30%) */}
        <main className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden p-1.5 sm:p-4 lg:p-5 gap-1.5 sm:gap-3 lg:gap-5 min-h-0 relative z-10 justify-start lg:justify-center items-center">
          {/* Dominant Cinema Stage (Movie ~70%) */}
          <div
            className={`flex-1 flex flex-col justify-start items-center min-w-0 min-h-0 h-full w-full overflow-y-auto no-scrollbar transition-all duration-300 ${
              isCompanionOpen ? 'max-w-5xl 2xl:max-w-6xl' : 'max-w-6xl 2xl:max-w-7xl'
            }`}
          >
            <div className="w-full flex flex-col justify-center relative my-auto">
              {/* Screen-Light Ambient Backlight Glow emitting into surrounding theater */}
              <div
                className="absolute -inset-8 sm:-inset-16 rounded-3xl bg-gradient-to-tr from-brand-600/20 via-indigo-600/15 to-purple-600/10 blur-[80px] sm:blur-[120px] opacity-40 sm:opacity-50 pointer-events-none -z-10 transition-opacity duration-1000"
                aria-hidden="true"
              />

              {/* Cinema Video Screen */}
              {!debugNoMovie && (
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
                  onMediaRetry={handleMediaRetry}
                  subtitleState={subtitleState}
                  onUploadSubtitle={handleUploadSubtitle}
                />
              )}

              {/* Cinematic Movie Title & Metadata Header Area */}
              <div className="mt-2 sm:mt-3 flex flex-row items-center justify-between gap-2 px-1 sm:px-3">
                {/* Left: Movie Title & Format */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base lg:text-xl font-bold tracking-tight text-white truncate drop-shadow-xs">
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

                {/* Right: Actions (Change Video, Camera/Mic Quick Controls, Companion toggle) */}
                <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                  {isHost && room?.media && (
                    <button
                      onClick={() => setIsUploadOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-brand-300 hover:text-brand-200 transition-all active:scale-95"
                      title="Change screening video"
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Change Video</span>
                    </button>
                  )}

                  {/* Camera and Mic Quick Device Controls */}
                  <RoomHeaderDeviceControls />

                  {/* Companion Expand/Collapse Toggle on Desktop */}
                  <button
                    onClick={() => setIsCompanionOpen(!isCompanionOpen)}
                    className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                      isCompanionOpen
                        ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300'
                        : 'bg-brand-500/20 hover:bg-brand-500/30 border-brand-500/40 text-brand-300 shadow-glass-glow'
                    }`}
                    title={isCompanionOpen ? 'Hide companion sidebar' : 'Show companion sidebar'}
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-brand-400" />
                    <span>{isCompanionOpen ? 'Hide Sidebar' : 'Show Sidebar'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar: Stacked VIDEO CALLS + CHAT (~30% width) */}
          {isCompanionOpen && !debugNoSidebar && (
            <div className="w-full lg:w-[350px] xl:w-[380px] 2xl:w-[420px] flex flex-col shrink-0 h-full min-h-0">
              {/* Upper Section: VIDEO CALLS */}
              <VideoCallsPanel />

              {/* Lower Section: CHAT (with tab to switch to Audience) */}
              <div className="flex-1 flex flex-col min-h-0 bg-[#070913]/90 border border-white/[0.08] rounded-2xl p-3 shadow-xl overflow-hidden">
                {/* Segmented Tab Switcher */}
                <div className="flex items-center bg-[#0a0c16]/70 p-1 rounded-xl border border-white/[0.06] mb-2.5 shrink-0">
                  <button
                    onClick={() => setActiveTab('chat')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      activeTab === 'chat'
                        ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-sm border border-white/20'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Chat</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('participants')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      activeTab === 'participants'
                        ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-sm border border-white/20'
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
        {/* WebRTC Diagnostics Panel (?debugWebRTC=1) */}
        <WebRTCDebugPanel />
      </div>
    </VideoProvider>
  );
};
