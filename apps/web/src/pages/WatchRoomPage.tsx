import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useSyncWatch, ConnectionStatus } from '../hooks/useSyncWatch.js';
import { MediaUploadModal } from '../components/MediaUploadModal.js';
import { ShareModal } from '../components/ShareModal.js';
import { DebugPanel } from '../components/DebugPanel.js';
import { useToast } from '../components/Toast.js';
import { RefreshCw, AlertCircle } from 'lucide-react';
import {
  VideoProvider,
  useVideoControls,
  useVideoPeers,
  VideoTile,
  WebRTCDebugPanel,
} from '../features/video/index.js';
import { getPublicUrl } from '../services/api.js';

function formatMediaInfo(media: { title: string; size?: number | string } | null | undefined) {
  if (!media) return { displayTitle: 'Private Screening', size: null, rawTitle: '' };

  let title = media.title || 'Screening';
  title = title.replace(/\.[^/.]+$/, '');
  title = title.replace(/[._]/g, ' ');
  const cleanTitle = title
    .replace(
      /\s+(1080p|720p|480p|2160p|4K|WEB-?DL|WEBRip|BluRay|BRRip|HDRip|DVDRip|x264|x265|HEVC|AVC|AAC|DDP?\d\.\d|TRUEHD|H\.264|H\.265)\b.*/i,
      ''
    )
    .trim();

  const sizeNum = Number(media.size);
  const formattedSize =
    !isNaN(sizeNum) && sizeNum > 0
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

function fmtTime(s: number): string {
  if (isNaN(s) || s < 0) return '00:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

interface SpatialEmojiItem {
  id: number;
  emoji: string;
  left: number;
  drift: number;
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
    const storedSession = sessionStorage.getItem(`cineva_session_${code}`);

    if (storedName && storedSession) {
      setDisplayName(storedName);
      setSessionId(storedSession);
    } else {
      // If user navigated directly to /room/A7K9PX without session, redirect to /join/A7K9PX
      navigate(`/join/${code}`, { replace: true });
    }
  }, [code, navigate]);

  if (!code || !displayName || !sessionId) {
    return (
      <div className="min-h-screen bg-[#06060c] flex flex-col items-center justify-center text-slate-400 p-6 text-center relative overflow-hidden">
        <div className="aurora" aria-hidden="true">
          <div className="aurora-layer">
            <i id="orb1"></i>
            <i id="orb2"></i>
            <i id="orb3"></i>
            <i id="orb4"></i>
          </div>
        </div>
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-[#7b6bff]/15 border border-[#7b6bff]/30 flex items-center justify-center mb-4 text-[#7b6bff]">
            <RefreshCw className="w-6 h-6 animate-spin text-[#7b6bff]" />
          </div>
          <p className="text-sm font-semibold text-white mb-1">Entering private cinema...</p>
          <p className="text-xs text-slate-400">Connecting to synchronized room {code}</p>
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
  const { showToast: showGlobalToast } = useToast();

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

  // Auto-redirect when room cancelled/ended
  useEffect(() => {
    if (connectionStatus === 'ended') {
      showGlobalToast(
        errorMessage || 'Room cancelled: The host has left the room. This screening has ended. Returning to Home...',
        'error'
      );
      const timer = setTimeout(() => {
        navigate('/', { replace: true });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [connectionStatus, errorMessage, navigate, showGlobalToast]);

  if (connectionStatus === 'ended' || (connectionStatus === 'error' && errorMessage)) {
    return (
      <div className="min-h-screen bg-[#06060c] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        <div className="aurora" aria-hidden="true">
          <div className="aurora-layer">
            <i id="orb1"></i>
            <i id="orb2"></i>
            <i id="orb3"></i>
            <i id="orb4"></i>
          </div>
        </div>
        <div className="relative z-10 flex flex-col items-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mb-5 text-rose-400">
            <AlertCircle className="w-7 h-7 animate-pulse" />
          </div>
          <h2 className="text-xl font-extrabold text-white mb-2">Room Cancelled</h2>
          <p className="text-slate-400 text-xs mb-4 leading-relaxed">
            {errorMessage || 'The host has left the room. This screening has ended.'}
          </p>
          <div className="text-[#7b6bff] text-xs font-semibold flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Returning to Home...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <VideoProvider
      roomCode={roomCode}
      currentParticipantId={currentParticipant?.id}
      currentDisplayName={displayName}
    >
      <WatchRoomContent
        roomCode={roomCode}
        displayName={displayName}
        sessionId={sessionId}
        videoRef={videoRef}
        room={room}
        playback={playback}
        participants={participants}
        chatMessages={chatMessages}
        subtitleState={subtitleState}
        isHost={isHost}
        canControl={canControl}
        connectionStatus={connectionStatus}
        rtt={rtt}
        handlePlay={handlePlay}
        handlePause={handlePause}
        handleSeek={handleSeek}
        handleSendMessage={handleSendMessage}
        handleUpdateSettings={handleUpdateSettings}
        handleUpdateTitle={handleUpdateTitle}
        handleKickParticipant={handleKickParticipant}
        handleEndRoom={handleEndRoom}
        handleLeaveRoom={handleLeaveRoom}
        handleMediaRetry={handleMediaRetry}
        handleUserGestureStart={handleUserGestureStart}
        handleUploadSubtitle={handleUploadSubtitle}
      />
    </VideoProvider>
  );
};

interface WatchRoomContentProps {
  roomCode: string;
  displayName: string;
  sessionId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  room: any;
  playback: any;
  participants: any[];
  chatMessages: any[];
  subtitleState: any;
  isHost: boolean;
  canControl: boolean;
  connectionStatus: ConnectionStatus;
  rtt: number;
  handlePlay: () => void;
  handlePause: () => void;
  handleSeek: (time: number) => void;
  handleSendMessage: (text: string) => void;
  handleUpdateSettings: (settings: any) => void;
  handleUpdateTitle: (title: string) => void;
  handleKickParticipant: (id: string) => void;
  handleEndRoom: () => void;
  handleLeaveRoom: () => void;
  handleMediaRetry: () => void;
  handleUserGestureStart: () => void;
  handleUploadSubtitle: (track: any) => void;
}

const WatchRoomContent: React.FC<WatchRoomContentProps> = ({
  roomCode,
  displayName,
  sessionId,
  videoRef,
  room,
  playback,
  participants,
  chatMessages,
  subtitleState,
  isHost,
  canControl,
  connectionStatus,
  rtt,
  handlePlay,
  handlePause,
  handleSeek,
  handleSendMessage,
  handleUpdateSettings,
  handleUpdateTitle,
  handleKickParticipant,
  handleEndRoom,
  handleLeaveRoom,
  handleMediaRetry,
  handleUserGestureStart,
  handleUploadSubtitle,
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Video calling controls & peers from VideoContext
  const { isCameraOn, isMuted, isConnecting, toggleCamera, toggleMute } = useVideoControls();
  const { cameraPeers, currentParticipantId, currentDisplayName, getStream } = useVideoPeers();

  // Local UI states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'participants'>('chat');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [emojis, setEmojis] = useState<SpatialEmojiItem[]>([]);
  const [inviteUrl, setInviteUrl] = useState('');

  // Audio track & subtitle cycling states
  const audioOptions = ['Audio: English 5.1', 'Audio: Original Stereo', 'Audio: Director Commentary'];
  const [audioIdx, setAudioIdx] = useState(0);
  const [ccActive, setCcActive] = useState(true);

  // Ambient Moods from prototype
  const moods = [
    { name: 'Cineva Violet', c1: '#7b6bff', c2: '#ff5fa8', c3: '#38d5ff' },
    { name: 'Cryo Spatial', c1: '#38d5ff', c2: '#7b6bff', c3: '#6ee7a0' },
    { name: 'Sunset IMAX', c1: '#ffab5e', c2: '#ff5fa8', c3: '#7b6bff' },
    { name: 'Obsidian Dim', c1: '#3a3285', c2: '#251e52', c3: '#183c4e' },
  ];
  const [moodIdx, setMoodIdx] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cinemaScreenRef = useRef<HTMLDivElement>(null);
  const msgStreamRef = useRef<HTMLDivElement>(null);

  const mediaInfo = formatMediaInfo(room?.media);

  // Resolve public invite URL
  useEffect(() => {
    let active = true;
    getPublicUrl()
      .then((pubUrl) => {
        if (active && pubUrl) {
          setInviteUrl(`${pubUrl}/join/${roomCode}`);
        } else if (active) {
          setInviteUrl(`${window.location.origin}/join/${roomCode}`);
        }
      })
      .catch(() => {
        if (active) setInviteUrl(`${window.location.origin}/join/${roomCode}`);
      });
    return () => {
      active = false;
    };
  }, [roomCode]);

  // Floating Toast helper
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 2500);
  }, []);

  // Ambient mood cycler
  const handleCycleMood = () => {
    const nextIdx = (moodIdx + 1) % moods.length;
    setMoodIdx(nextIdx);
    showToast(`Ambient lighting: ${moods[nextIdx].name}`);
  };

  // Copy invite link
  const handleCopyInvite = async () => {
    const url = inviteUrl || `${window.location.origin}/join/${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setIsInviteOpen(false);
    showToast(`Room invite link copied · ${roomCode}`);
  };

  // Spatial emoji reaction spawner
  const spawnEmoji = (emoji: string) => {
    const newItem: SpatialEmojiItem = {
      id: Date.now() + Math.random(),
      emoji,
      left: 20 + Math.random() * 60,
      drift: (Math.random() - 0.5) * 90,
    };
    setEmojis((prev) => [...prev, newItem]);
    setTimeout(() => {
      setEmojis((prev) => prev.filter((e) => e.id !== newItem.id));
    }, 2800);
  };

  // Quick reaction clicked
  const handleQuickReact = (emoji: string) => {
    spawnEmoji(emoji);
    handleSendMessage(emoji);
  };

  // Send message submit
  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    handleSendMessage(text);
    setChatInput('');
    setActiveTab('chat');
  };

  // Auto-scroll chat on new message
  useEffect(() => {
    if (msgStreamRef.current) {
      msgStreamRef.current.scrollTop = msgStreamRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Scrub track click handler
  const handleScrubClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !playback.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = pos * playback.duration;
    handleSeek(targetTime);
    showToast('Synced seek across room');
  };

  // Drag and drop video onto cinema canvas
  const handleScreenDrop = (e: React.DragEvent) => {
    e.preventDefault();
    cinemaScreenRef.current?.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setIsUploadOpen(true);
    }
  };

  const currentMood = moods[moodIdx];
  const scrubPercent = playback.duration ? Math.min(100, Math.max(0, (playback.currentTime / playback.duration) * 100)) : 0;
  const activeCamerasCount = (isCameraOn ? 1 : 0) + cameraPeers.length;

  return (
    <div className="h-screen w-screen flex flex-col p-4 sm:p-5 gap-4 overflow-hidden relative select-none bg-[#06060c] text-[#f6f5f2]">
      {/* SVG Liquid Refraction Filter & Icons */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <filter id="lens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency=".009 .014" numOctaves={2} seed={7} result="n" />
            <feGaussianBlur in="n" stdDeviation="3" result="m" />
            <feDisplacementMap in="SourceGraphic" in2="m" scale="34" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <symbol id="film" viewBox="0 0 24 24">
            <rect className="d" x="3" y="4" width="18" height="16" rx="4" />
            <rect x="3" y="4" width="18" height="16" rx="4" />
            <path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5" />
          </symbol>
          <symbol id="add-vid" viewBox="0 0 24 24">
            <rect className="d" x="3" y="5" width="18" height="14" rx="3" />
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <path d="M12 9v6M9 12h6" />
          </symbol>
          <symbol id="cam" viewBox="0 0 24 24">
            <rect className="d" x="3" y="6" width="12" height="12" rx="3.5" />
            <rect x="3" y="6" width="12" height="12" rx="3.5" />
            <path d="M15 10.5l5.5-3v9l-5.5-3" />
          </symbol>
          <symbol id="cam-off" viewBox="0 0 24 24">
            <path d="M15 10.5l5.5-3v9l-5.5-3M3 3l18 18M3 6.5A3.5 3.5 0 016.5 3H12a3.5 3.5 0 013.5 3.5v4M3 11v3.5A3.5 3.5 0 006.5 18H13" />
          </symbol>
          <symbol id="mic" viewBox="0 0 24 24">
            <rect className="d" x="9" y="3" width="6" height="11" rx="3" />
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 10a7 7 0 0014 0M12 17v4M8 21h8" />
          </symbol>
          <symbol id="mic-off" viewBox="0 0 24 24">
            <path d="M2 2l20 20M9 9v2a3 3 0 005.12 2.12M15 9.34V6a3 3 0 00-5.94-.6M17 16.95A7 7 0 015 10M12 17v4M8 21h8" />
          </symbol>
          <symbol id="chat" viewBox="0 0 24 24">
            <path className="d" d="M21 12a8 8 0 01-8 8H4l3-3a8 8 0 1114-5z" />
            <path d="M21 12a8 8 0 01-8 8H4l3-3a8 8 0 1114-5z" />
          </symbol>
          <symbol id="users" viewBox="0 0 24 24">
            <circle className="d" cx="9" cy="8" r="4" />
            <circle cx="9" cy="8" r="4" />
            <path d="M2 20a7 7 0 0114 0M16 4a4 4 0 010 7.75M22 20a7 7 0 00-5-6.7" />
          </symbol>
          <symbol id="share" viewBox="0 0 24 24">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </symbol>
          <symbol id="gear" viewBox="0 0 24 24">
            <circle className="d" cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.6.77 1.02 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </symbol>
          <symbol id="exit" viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          </symbol>
          <symbol id="send" viewBox="0 0 24 24">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </symbol>
          <symbol id="play" viewBox="0 0 24 24">
            <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" />
          </symbol>
          <symbol id="pause" viewBox="0 0 24 24">
            <path d="M8 5v14M16 5v14" strokeWidth="2.6" />
          </symbol>
          <symbol id="sidebar" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <path d="M15 4v16" />
          </symbol>
        </defs>
      </svg>

      {/* Background Aurora with calibrated mood colors */}
      <div className="aurora" aria-hidden="true">
        <div className="aurora-layer">
          <i id="orb1" style={{ background: currentMood.c1 }}></i>
          <i id="orb2" style={{ background: currentMood.c2 }}></i>
          <i id="orb3" style={{ background: currentMood.c3 }}></i>
          <i id="orb4"></i>
        </div>
      </div>

      {/* ================= TOP FLOATING DOCK HEADER ================= */}
      <header className="top-dock lg">
        <div className="dock-left">
          <Link to="/" className="logo">
            <span className="mk">
              <svg className="ic">
                <use href="#film" />
              </svg>
            </span>
            <span>
              CINE<span className="thin">VA</span>
            </span>
          </Link>
          <span className="dock-divider"></span>
          <span className="room-title-txt">{room?.media ? mediaInfo.displayTitle : room?.name || 'Watch Room'}</span>
          {isHost && (
            <span className="host-badge">
              <i></i>HOST
            </span>
          )}
        </div>

        <div className="dock-right relative">
          {/* Ambient Lighting Cycler */}
          <button
            type="button"
            className="btn frost mood-pill"
            id="moodBtn"
            title="Cycle Ambient Glass Lighting"
            onClick={handleCycleMood}
          >
            <span
              className="mood-dot"
              id="moodDot"
              style={{ background: `linear-gradient(135deg, ${currentMood.c1}, ${currentMood.c2})` }}
            ></span>
          </button>

          {/* Invite Pill */}
          <button
            type="button"
            className="btn frost"
            id="inviteBtn"
            onClick={() => setIsInviteOpen(!isInviteOpen)}
          >
            <svg className="ic" style={{ width: 15, height: 15 }}>
              <use href="#share" />
            </svg>
            <span>Invite</span>
          </button>

          {/* Audience Counter Pill */}
          <button
            type="button"
            className="btn frost"
            id="topAudBtn"
            onClick={() => {
              setIsSidebarCollapsed(false);
              setActiveTab('participants');
            }}
          >
            <svg className="ic" style={{ width: 15, height: 15 }}>
              <use href="#users" />
            </svg>
            <span id="topAudCount">{participants.length}</span>
          </button>

          {/* Settings */}
          <button
            type="button"
            className="btn frost icon-pill"
            id="settingsBtn"
            title="Sync Calibration"
            onClick={() => setIsSettingsOpen(true)}
          >
            <svg className="ic" style={{ width: 16, height: 16 }}>
              <use href="#gear" />
            </svg>
          </button>

          {/* Leave Room */}
          <button
            type="button"
            className="btn frost icon-pill"
            id="leaveBtn"
            title="Leave Watch Room"
            onClick={() => {
              handleLeaveRoom();
              navigate('/', { replace: true });
            }}
          >
            <svg className="ic" style={{ width: 16, height: 16 }}>
              <use href="#exit" />
            </svg>
          </button>

          {/* Invite Glass Popover */}
          <div className={`popover lg ${isInviteOpen ? 'open' : ''}`} id="invitePopover">
            <div style={{ fontSize: 13, fontWeight: 650, color: '#fff' }}>Invite friends to Watch Room</div>
            <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
              Share your 6-character key for instant browser sync.
            </div>
            <div className="pop-code-row">
              <span>{roomCode}</span>
              <button
                type="button"
                className="btn violet"
                style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                id="copyCodeBtn"
                onClick={handleCopyInvite}
              >
                Copy Link
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ================= MAIN WORKSPACE ================= */}
      <div className="workspace">
        {/* LEFT COLUMN: MAIN CINEMA STAGE */}
        <main className="stage-col lg" id="stageCol">
          {/* Inner Widescreen Cinema Canvas */}
          <div
            ref={cinemaScreenRef}
            className="cinema-screen"
            id="cinemaScreen"
            onDragOver={(e) => {
              e.preventDefault();
              cinemaScreenRef.current?.classList.add('dragover');
            }}
            onDragLeave={() => cinemaScreenRef.current?.classList.remove('dragover')}
            onDrop={handleScreenDrop}
          >
            <div className="screen-glare"></div>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              id="fileInput"
              accept="video/mp4,video/webm,video/x-matroska,video/quicktime,.mkv"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setIsUploadOpen(true);
                }
              }}
            />

            {/* Center Empty State (when no media loaded) */}
            {!room?.media ? (
              <div className="empty-screening" id="emptyState">
                <div className="reel-squircle">
                  <svg className="ic">
                    <use href="#film" />
                  </svg>
                </div>
                <span className="eyebrow">PRIVATE SCREENING</span>
                <h1>Your cinema is ready</h1>
                <p className="empty-lead">Add an authorized video to begin the screening with your friends.</p>
                <p className="empty-sub">Invite friends anytime using your private room link.</p>

                <div className="cta-stack">
                  <button
                    type="button"
                    className="btn violet btn-add-video"
                    id="addVideoBtn"
                    onClick={() => setIsUploadOpen(true)}
                  >
                    <svg className="ic">
                      <use href="#add-vid" />
                    </svg>
                    <span>Add video</span>
                  </button>
                  <button
                    type="button"
                    className="sample-trigger"
                    id="loadSampleBtn"
                    onClick={handleMediaRetry}
                  >
                    <svg className="ic" style={{ width: 13, height: 13 }}>
                      <use href="#play" />
                    </svg>
                    <span>Or test with 4K Cinema Sample</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Active Synchronized Video Player */
              <div className="player-layer active" id="playerLayer">
                <video
                  ref={videoRef as React.RefObject<HTMLVideoElement>}
                  className="player-video"
                  id="videoEl"
                  playsInline
                  loop
                  crossOrigin="anonymous"
                  onClick={() => (playback.isPlaying ? handlePause() : handlePlay())}
                />

                <div className="player-top-bar">
                  <span className="sync-pill lg">
                    <span className="dot-ok"></span>
                    <span id="nowPlayingLabel">{mediaInfo.displayTitle}</span>
                    <span style={{ color: 'var(--t3)', font: '12px var(--mono)' }}>
                      · {Math.round(rtt)} ms sync
                    </span>
                  </span>
                  {isHost && (
                    <button
                      type="button"
                      className="btn frost lg"
                      id="ejectBtn"
                      style={{ height: 34, fontSize: '12.5px' }}
                      onClick={() => setIsUploadOpen(true)}
                    >
                      Change video
                    </button>
                  )}
                </div>

                <div className="player-bottom-hud lg">
                  <div className="scrub-track" id="scrubTrack" onClick={handleScrubClick}>
                    <div className="scrub-fill" id="scrubFill" style={{ width: `${scrubPercent}%` }}></div>
                  </div>
                  <div className="hud-row">
                    <button
                      type="button"
                      className="hud-btn"
                      id="playPauseBtn"
                      aria-label={playback.isPlaying ? 'Pause' : 'Play'}
                      onClick={() => (playback.isPlaying ? handlePause() : handlePlay())}
                    >
                      <svg className="ic" id="playPauseIcon">
                        <use href={playback.isPlaying ? '#pause' : '#play'} />
                      </svg>
                    </button>
                    <span id="timeLabel">
                      {fmtTime(playback.currentTime)} / {fmtTime(playback.duration || 0)}
                    </span>
                    <span style={{ flex: 1 }}></span>
                    <button
                      type="button"
                      className="hud-btn"
                      id="audioLangBtn"
                      onClick={() => {
                        const next = (audioIdx + 1) % audioOptions.length;
                        setAudioIdx(next);
                        showToast(audioOptions[next]);
                      }}
                    >
                      {audioOptions[audioIdx]}
                    </button>
                    <button
                      type="button"
                      className="hud-btn"
                      id="subBtn"
                      onClick={() => {
                        const next = !ccActive;
                        setCcActive(next);
                        showToast(next ? 'Subtitles enabled' : 'Subtitles hidden');
                      }}
                    >
                      {ccActive ? 'CC: On' : 'CC: Off'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Floating Spatial Emojis */}
            {emojis.map((item) => (
              <span
                key={item.id}
                className="spatial-emoji"
                style={{
                  left: `${item.left}%`,
                  ['--drift' as any]: `${item.drift}px`,
                }}
              >
                {item.emoji}
              </span>
            ))}
          </div>

          {/* Bottom Theater Control Strip */}
          <div className="stage-footer">
            <div className="stage-meta">
              <div className="stage-meta-top">
                <span className="stage-meta-title">
                  {room?.media ? mediaInfo.displayTitle : room?.name || 'Watch Room'}
                </span>
                {isHost && <span className="host-badge">HOST</span>}
              </div>
              <div className="stage-meta-sub">
                <span>1080p HD</span>
                <span>·</span>
                <span>Sub-frame Sync</span>
              </div>
            </div>

            <div className="stage-controls">
              <button
                type="button"
                className={`btn frost ${isCameraOn ? 'on-ok' : ''}`}
                id="camBtn"
                onClick={toggleCamera}
                disabled={isConnecting}
              >
                <svg className="ic" id="camIcon">
                  <use href={isCameraOn ? '#cam' : '#cam-off'} />
                </svg>
                <span id="camLabel">
                  {isCameraOn ? 'Camera On' : isConnecting ? 'Starting...' : 'Camera Off'}
                </span>
              </button>

              <button
                type="button"
                className={`btn frost ${!isMuted ? 'on-ok' : 'on-muted'}`}
                id="micBtn"
                onClick={toggleMute}
              >
                <svg className="ic" id="micIcon">
                  <use href={!isMuted ? '#mic' : '#mic-off'} />
                </svg>
                <span id="micLabel">{!isMuted ? 'Mic' : 'Muted'}</span>
                {!isMuted && (
                  <span className="mic-bars" id="micBars">
                    <i></i>
                    <i></i>
                    <i></i>
                  </span>
                )}
              </button>

              <button
                type="button"
                className="btn frost"
                id="hideSidebarBtn"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              >
                <svg className="ic">
                  <use href="#sidebar" />
                </svg>
                <span id="hideSidebarLabel">
                  {isSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
                </span>
              </button>
            </div>
          </div>
        </main>

        {/* ================= RIGHT SIDEBAR ================= */}
        <aside className={`sidebar-col ${isSidebarCollapsed ? 'collapsed' : ''}`} id="sidebarCol">
          {/* Card 1: VIDEO CALLS */}
          <section className="calls-card lg">
            <div className="card-head">
              <div className="card-label">
                <span className="label-icon-box">
                  <svg className="ic">
                    <use href="#cam" />
                  </svg>
                </span>
                <span>VIDEO CALLS</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className={`btn frost icon-pill ${!isMuted ? 'on-ok' : 'on-muted'}`}
                  id="sideMicBtn"
                  style={{ width: 30, height: 30 }}
                  title="Toggle Mic"
                  onClick={toggleMute}
                >
                  <svg className="ic" style={{ width: 14, height: 14 }}>
                    <use href={!isMuted ? '#mic' : '#mic-off'} />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`btn frost ${isCameraOn ? 'on-ok' : ''}`}
                  id="sideCamBtn"
                  style={{ height: 30, padding: '0 11px', fontSize: 12 }}
                  onClick={toggleCamera}
                  disabled={isConnecting}
                >
                  <svg className="ic" style={{ width: 13, height: 13 }}>
                    <use href={isCameraOn ? '#cam' : '#cam-off'} />
                  </svg>
                  <span id="sideCamLabel">{isCameraOn ? 'Camera On' : 'Camera Off'}</span>
                </button>
              </div>
            </div>

            <div className="call-well well" id="callWell">
              {activeCamerasCount === 0 ? (
                /* Standby State: No cameras on */
                <div id="noCamState" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div className="cam-off-circle">
                    <svg className="ic" style={{ width: 18, height: 18 }}>
                      <use href="#cam-off" />
                    </svg>
                  </div>
                  <h4>No cameras on</h4>
                  <p>Turn on your camera to see your friends here.</p>
                </div>
              ) : (
                /* Active Spatial Persona Tiles */
                <div className="cam-tiles active" id="camTiles">
                  {/* Local Tile if Camera On */}
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

                  {/* Remote Camera Peers */}
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
          </section>

          {/* Card 2: CHAT & AUDIENCE DOCK */}
          <section className="chat-card lg">
            {/* Segmented Switcher */}
            <div className="seg-bar">
              <button
                type="button"
                className={`seg-btn ${activeTab === 'chat' ? 'active' : ''}`}
                id="tabChatBtn"
                onClick={() => setActiveTab('chat')}
              >
                <svg className="ic">
                  <use href="#chat" />
                </svg>
                <span>Chat</span>
              </button>
              <button
                type="button"
                className={`seg-btn ${activeTab === 'participants' ? 'active' : ''}`}
                id="tabAudBtn"
                onClick={() => setActiveTab('participants')}
              >
                <svg className="ic">
                  <use href="#users" />
                </svg>
                <span id="tabAudLabel">Audience ({participants.length})</span>
              </button>
            </div>

            {/* Inner Well */}
            <div className="chat-well well">
              <div className="well-subhead">
                <div className="well-subhead-left">
                  <svg className="ic" style={{ width: 13, height: 13, color: 'var(--t2)' }}>
                    <use href={activeTab === 'chat' ? '#chat' : '#users'} />
                  </svg>
                  <span id="wellTitle">{activeTab === 'chat' ? 'CINEMA CHAT' : 'AUDIENCE SYNC'}</span>
                </div>
                <span className="count-pill" id="msgCountPill">
                  {activeTab === 'chat'
                    ? `${chatMessages.length} ${chatMessages.length === 1 ? 'msg' : 'msgs'}`
                    : `${participants.length} connected`}
                </span>
              </div>

              {/* Chat View */}
              {activeTab === 'chat' ? (
                <div ref={msgStreamRef} className="msg-stream" id="msgStream">
                  {chatMessages.length === 0 ? (
                    <div className="chat-empty" id="chatEmpty">
                      <h5>No messages yet</h5>
                      <p>Start the conversation while the movie rolls.</p>
                      <div className="quick-reacts">
                        {['🍿', '🔥', '😂', '👏', '❤️'].map((em) => (
                          <button
                            key={em}
                            type="button"
                            className="react-chip"
                            data-emoji={em}
                            title={`Send ${em}`}
                            onClick={() => handleQuickReact(em)}
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => {
                      const isMe = msg.senderId === currentParticipantId || msg.senderSessionId === sessionId;
                      return (
                        <div key={idx} className={`bubble ${isMe ? 'me' : ''}`}>
                          <small>{msg.senderName || 'Audience'}</small>
                          <span>{msg.text}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                /* Audience List View */
                <div className="audience-list active" id="audList">
                  {participants.map((p) => {
                    const isMe = p.sessionId === sessionId;
                    const initial = (p.displayName || 'A').charAt(0).toUpperCase();
                    return (
                      <div key={p.id} className="aud-item">
                        <div className="aud-left">
                          <div
                            className="aud-av"
                            style={{
                              background: isMe
                                ? 'linear-gradient(145deg,#ffe3b0,#f0b860)'
                                : 'linear-gradient(145deg,#bfe6f7,#6fb0d2)',
                            }}
                          >
                            {initial}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                              {p.displayName} {isMe ? '(You)' : ''}
                            </div>
                            <div style={{ font: '11px var(--mono)', color: 'var(--ok)' }}>
                              ● {p.isHost ? 'Reference clock · 0 ms' : `In sync · ${Math.round(rtt)} ms apart`}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {p.isHost ? (
                            <span className="host-badge">HOST</span>
                          ) : isHost ? (
                            <button
                              type="button"
                              className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
                              onClick={() => handleKickParticipant(p.id)}
                            >
                              Kick
                            </button>
                          ) : (
                            <span style={{ fontSize: '11.5px', color: 'var(--t2)' }}>Viewer</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Message Composer */}
            <form className="chat-composer" id="chatForm" autoComplete="off" onSubmit={handleChatSubmit}>
              <div className="chat-input-wrap">
                <input
                  type="text"
                  id="chatInput"
                  placeholder="Send a message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
              </div>
              <button type="submit" className="send-btn" aria-label="Send message">
                <svg className="ic" style={{ width: 16, height: 16 }}>
                  <use href="#send" />
                </svg>
              </button>
            </form>
          </section>
        </aside>
      </div>

      {/* Sync Settings Modal */}
      <div className={`modal-overlay ${isSettingsOpen ? 'open' : ''}`} id="settingsModal">
        <div className="modal-card lg">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 650, color: '#fff' }}>Theater & Sync Settings</span>
            <button
              type="button"
              className="btn frost icon-pill"
              id="closeSettingsBtn"
              style={{ width: 30, height: 30 }}
              onClick={() => setIsSettingsOpen(false)}
            >
              ✕
            </button>
          </div>
          <div className="setting-row">
            <span style={{ color: 'var(--t2)' }}>Sub-frame WebRTC Lock</span>
            <span style={{ font: '600 12.5px var(--mono)', color: 'var(--ok)' }}>
              ACTIVE · &lt; {Math.max(14, Math.round(rtt))}ms
            </span>
          </div>
          <div className="setting-row">
            <span style={{ color: 'var(--t2)' }}>Stream Resolution</span>
            <span style={{ font: '500 12.5px var(--mono)', color: '#fff' }}>1080p60 / 4K Pass-through</span>
          </div>
          <div className="setting-row" style={{ borderBottom: 0 }}>
            <span style={{ color: 'var(--t2)' }}>Ephemeral Buffer Erase</span>
            <span style={{ font: '500 12.5px var(--mono)', color: '#cbc3ff' }}>On Room Close</span>
          </div>

          {isHost && (
            <button
              type="button"
              className="btn"
              style={{
                width: '100%',
                height: 38,
                marginTop: 12,
                background: 'rgba(244,63,94,0.12)',
                color: '#fda4af',
                border: '1px solid rgba(244,63,94,0.3)',
              }}
              onClick={() => {
                setIsSettingsOpen(false);
                handleEndRoom();
              }}
            >
              End Screening for All
            </button>
          )}

          <button
            type="button"
            className="btn violet"
            style={{ width: '100%', height: 42, marginTop: 14 }}
            id="doneSettingsBtn"
            onClick={() => setIsSettingsOpen(false)}
          >
            Done
          </button>
        </div>
      </div>

      {/* Floating Liquid Glass Toast */}
      <div className={`toast lg ${toastMessage ? 'show' : ''}`} id="toast">
        {toastMessage}
      </div>

      {/* Media Upload Modal */}
      {room && (
        <MediaUploadModal
          roomId={room.id}
          sessionId={sessionId}
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          onUploadComplete={() => {
            setIsUploadOpen(false);
            showToast('Screening video updated');
          }}
        />
      )}

      {/* Diagnostics Debug Panels when ?debug=1 or ?debugWebRTC=1 */}
      {(window.location.search.includes('debug=1') || searchParams.get('debug') === '1') && (
        <DebugPanel
          playback={playback}
          connectionStatus={connectionStatus}
          isHost={isHost}
          rtt={rtt}
          videoRef={videoRef as React.RefObject<HTMLVideoElement>}
        />
      )}
      <WebRTCDebugPanel />
    </div>
  );
};
