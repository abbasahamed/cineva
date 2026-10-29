import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useSyncWatch, ConnectionStatus } from "../hooks/useSyncWatch.js";
import { MediaUploadModal } from "../components/MediaUploadModal.js";
import { DebugPanel } from "../components/DebugPanel.js";
import { useToast } from "../components/Toast.js";
import { useMediaQuery, MOBILE_MEDIA_QUERY, LANDSCAPE_DRAWER_MEDIA_QUERY } from "../hooks/useMediaQuery.js";
import { RefreshCw, AlertCircle, Maximize2, Volume2, VolumeX, Home } from "lucide-react";
import {
  VideoProvider,
  useVideoControls,
  useVideoPeers,
  VideoTile,
  ParticipantGalleryModal,
  WebRTCDebugPanel,
} from "../features/video/index.js";
import {
  getRoomInviteUrl,
  shareOnWhatsApp,
  copyToClipboard,
  isPrivateAddress,
} from "../utils/inviteUtils.js";
import Hls from "hls.js";
import { SOCKET_EVENTS } from "@cineva/shared";
import { socketService } from "../services/socket.js";
import { attachSampleMedia } from "../services/api.js";
import {
  formatAudioTrackList,
  formatSubtitleTrackList,
  AudioOption,
  SubtitleOption,
} from "../utils/trackDisplay.js";
import {
  SubtitleSettings,
  loadSubtitleSettings,
  saveSubtitleSettings,
  clampSize,
  convertSrtToVtt,
  findActiveCueText,
} from "../utils/subtitleUtils.js";
import { SubtitleOverlay } from "../components/SubtitleOverlay.js";
import { SubtitleSettingsPanel } from "../components/SubtitleSettingsPanel.js";
import { useRoomShortcuts } from "../hooks/useRoomShortcuts.js";
import { ShortcutsModal } from "../components/ShortcutsModal.js";
import { BottomSheet } from "../components/BottomSheet.js";
import { SettingsModal } from "../components/SettingsModal.js";
import { useIdleControls } from "../hooks/useIdleControls.js";

function formatMediaInfo(media: { title: string; size?: number | string } | null | undefined) {
  if (!media) return { displayTitle: "Friday movie night", size: null, rawTitle: "" };

  let title = media.title || "Friday movie night";
  title = title.replace(/\.[^/.]+$/, "");
  title = title.replace(/[._]/g, " ");
  const cleanTitle = title
    .replace(
      /\s+(1080p|720p|480p|2160p|4K|WEB-?DL|WEBRip|BluRay|BRRip|HDRip|DVDRip|x264|x265|HEVC|AVC|AAC|DDP?\d\.\d|TRUEHD|H\.264|H\.265)\b.*/i,
      ""
    )
    .trim();

  return {
    displayTitle: cleanTitle || media.title.replace(/\.[^/.]+$/, ""),
    rawTitle: media.title,
  };
}

function fmtTime(s: number, forceHours = false): string {
  if (!Number.isFinite(s) || s < 0) return forceHours ? "0:00:00" : "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h || forceHours) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

interface FloatingEmoji {
  id: number;
  emoji: string;
  left: number;
  dx: number;
  delay: number;
}

export const WatchRoomPage: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();

  const code = (roomCode || "").toUpperCase();
  const [displayName, setDisplayName] = useState<string | null>(() => {
    if (!code) return null;
    return sessionStorage.getItem(`sw_name_${code}`);
  });
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (!code) return null;
    return sessionStorage.getItem(`cineva_session_${code}`);
  });

  useEffect(() => {
    if (!code) return;
    const storedName = sessionStorage.getItem(`sw_name_${code}`);
    const storedSession = sessionStorage.getItem(`cineva_session_${code}`);

    if (storedName && storedSession) {
      setDisplayName(storedName);
      setSessionId(storedSession);
    } else {
      navigate(`/join/${code}`, { replace: true });
    }
  }, [code, navigate]);

  if (!code || !displayName || !sessionId) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center text-slate-400 p-6 text-center relative overflow-hidden">
        <div className="amb" aria-hidden="true"></div>
        <div className="grain" aria-hidden="true"></div>
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center mb-4 text-white">
            <RefreshCw className="w-6 h-6 animate-spin text-white" />
          </div>
          <p className="text-sm font-semibold text-white mb-1">Entering private cinema...</p>
          <p className="text-xs text-slate-400">Connecting to synchronized room {code}</p>
        </div>
      </div>
    );
  }

  return <WatchRoomInner roomCode={code} displayName={displayName} sessionId={sessionId} />;
};

interface CallTilesProps {
  participants: any[];
  sessionId: string;
  currentParticipantId?: string;
  currentDisplayName?: string;
  displayName?: string;
  isHost: boolean;
  isMuted: boolean;
  isCameraOn: boolean;
  getStream: (participantId: string, isLocal?: boolean) => MediaStream | null;
  allPeers: any[];
  participantVolumes: Map<string, number>;
  participantMutedLocally: Map<string, boolean>;
  setParticipantVolume: (id: string, vol: number) => void;
  toggleParticipantLocalMute: (id: string) => void;
  onInvite: () => void;
  isMobile?: boolean;
}

const CallTiles: React.FC<CallTilesProps> = ({
  participants,
  sessionId,
  currentParticipantId,
  currentDisplayName,
  displayName,
  isHost,
  isMuted,
  isCameraOn,
  getStream,
  allPeers,
  participantVolumes,
  participantMutedLocally,
  setParticipantVolume,
  toggleParticipantLocalMute,
  onInvite,
  isMobile = false,
}) => {
  const containerClass = isMobile
    ? participants.length <= 4
      ? "mobile-call-grid"
      : "mobile-call-strip"
    : "call-strip";

  return (
    <div className={containerClass} id={isMobile ? undefined : "call-strip"}>
      {/* Local user tile */}
      <div className="tile" id={isMobile ? "t-me-m" : "t-me"}>
        <VideoTile
          participantId={currentParticipantId}
          displayName={currentDisplayName || displayName || "You"}
          stream={getStream(currentParticipantId || "", true)}
          isLocal={true}
          isHost={isHost}
          isMuted={isMuted}
          isCameraOff={!isCameraOn}
          getStream={getStream}
          showVolumeControl={false}
        />
      </div>

      {/* Remote participant tiles */}
      {participants
        .filter((p) => p.sessionId !== sessionId)
        .map((p) => {
          const peer = allPeers.find((cp) => cp.participantId === p.id);
          const isPeerCameraOff = peer ? peer.isCameraOff : true;
          const peerStream = peer?.stream || getStream(p.id, false);
          const vol = participantVolumes.get(p.id) ?? 100;
          const isLocMuted = participantMutedLocally.get(p.id) ?? false;

          return (
            <div key={`tile-${p.id}`} className="tile">
              <VideoTile
                participantId={p.id}
                displayName={p.displayName}
                stream={peerStream}
                isLocal={false}
                isHost={p.isHost}
                isMuted={peer?.isMuted ?? true}
                isCameraOff={isPeerCameraOff}
                connectionState={peer?.connectionState}
                volume={vol}
                isLocallyMuted={isLocMuted}
                onVolumeChange={(newVol) => setParticipantVolume(p.id, newVol)}
                onToggleLocalMute={() => toggleParticipantLocalMute(p.id)}
                getStream={getStream}
                showVolumeControl={true}
              />
            </div>
          );
        })}

      {/* Invite Tile */}
      <button
        type="button"
        className="tile add"
        id={isMobile ? "inv-mobile-tile" : "inv2"}
        aria-label="Invite someone"
        onClick={onInvite}
      >
        <svg viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>Invite</span>
      </button>
    </div>
  );
};

interface CallDockProps {
  isMuted: boolean;
  toggleMute: () => void;
  isCameraOn: boolean;
  toggleCamera: () => void;
  isConnecting: boolean;
  permissionError: string | null;
  isMobile?: boolean;
  showText?: boolean;
}

const CallDock: React.FC<CallDockProps> = ({
  isMuted,
  toggleMute,
  isCameraOn,
  toggleCamera,
  isConnecting,
  permissionError,
  isMobile = false,
  showText = true,
}) => {
  return (
    <div className={isMobile ? "mobile-dock" : "dock"}>
      <button
        type="button"
        className={`b ${isMuted ? "b-muted" : "b-neutral"}`}
        id={isMobile ? "dMic-mobile" : "dMic"}
        onClick={toggleMute}
        aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
        title={isMuted ? "Unmute microphone" : "Mute microphone"}
      >
        {isMuted ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
        <span className={showText ? undefined : "sr-only"}>{isMuted ? "Unmute" : "Mute"}</span>
      </button>

      <button
        type="button"
        className={`b ${isCameraOn ? "b-camera-on" : "b-neutral"} ${permissionError ? "err" : ""}`}
        id={isMobile ? "dCam-mobile" : "dCam"}
        onClick={toggleCamera}
        disabled={isConnecting}
        title={permissionError || (isCameraOn ? "Stop camera" : "Start camera")}
        aria-label={permissionError || (isCameraOn ? "Stop camera" : "Start camera")}
      >
        {isConnecting ? (
          <RefreshCw className="w-4 h-4 animate-spin text-[#70b5ff]" />
        ) : isCameraOn ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1m5 0h6a2 2 0 0 1 2 2v4" />
            <line x1="1" y1="1" x2="23" y2="23" />
            <polygon points="23 7 16 12 23 17 23 7" />
          </svg>
        )}
        <span className={showText ? undefined : "sr-only"}>{isConnecting ? "Starting..." : isCameraOn ? "Stop camera" : "Start camera"}</span>
      </button>
    </div>
  );
};

interface ChatPaneProps {
  chatMessages: any[];
  participants: any[];
  currentParticipantId?: string;
  sessionId: string;
  chatInput: string;
  setChatInput: (val: string) => void;
  handleChatSubmit: (e: React.FormEvent) => void;
  streamRef: React.RefObject<HTMLDivElement>;
  isMobile?: boolean;
  keyboardPadding?: number;
}

const ChatPane: React.FC<ChatPaneProps> = ({
  chatMessages,
  participants,
  currentParticipantId,
  sessionId,
  chatInput,
  setChatInput,
  handleChatSubmit,
  streamRef,
  isMobile = false,
  keyboardPadding = 0,
}) => {
  return (
    <div
      className={isMobile ? "mobile-chat-pane" : "pane"}
      id={isMobile ? "m-pane-chat" : "pc"}
      role={isMobile ? "tabpanel" : undefined}
      aria-labelledby={isMobile ? "m-tab-chat" : undefined}
      style={isMobile && keyboardPadding ? { paddingBottom: `${keyboardPadding}px` } : undefined}
    >
      <div ref={streamRef} className="msgs" id={isMobile ? "ms-mobile" : "ms"}>
        {chatMessages.length === 0 ? (
          <div className="none" id="no">
            <b>No messages yet</b>Say something while the movie loads.
          </div>
        ) : (
          chatMessages.map((msg, idx) => {
            if (msg.isSystem) {
              return (
                <div key={msg.id || idx} className="m sys">
                  <span>{msg.message}</span>
                </div>
              );
            }
            const myParticipant = participants.find((p) => p.sessionId === sessionId);
            const isMe =
              msg.participantId === myParticipant?.id ||
              msg.participantId === currentParticipantId ||
              (msg as any).senderId === currentParticipantId ||
              (msg as any).senderSessionId === sessionId ||
              (myParticipant && msg.displayName === myParticipant.displayName);
            return (
              <div key={msg.id || idx} className={`m ${isMe ? "me" : ""}`}>
                {!isMe && <b>{msg.displayName || "Audience"}</b>}
                <span>{msg.message || (msg as any).text || ""}</span>
              </div>
            );
          })
        )}
      </div>

      <form className="cmp composer" id={isMobile ? "fm-mobile" : "fm"} onSubmit={handleChatSubmit}>
        <input
          id={isMobile ? "mi-mobile" : "mi"}
          placeholder="Message"
          autoComplete="off"
          aria-label="Message"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleChatSubmit(e);
            } else if (e.key === "Escape") {
              e.currentTarget.blur();
            }
          }}
        />
        <button
          type="submit"
          className={`b i ${chatInput.trim().length > 0 ? "has-text" : "is-empty"}`}
          aria-label="Send message"
          title="Send message"
          id={isMobile ? "send-mobile-btn" : "send-btn"}
          disabled={chatInput.trim().length === 0}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" />
          </svg>
        </button>
      </form>
    </div>
  );
};

interface PeoplePaneProps {
  participants: any[];
  sessionId: string;
  isHost: boolean;
  participantVolumes: Map<string, number>;
  participantMutedLocally: Map<string, boolean>;
  setParticipantVolume: (id: string, vol: number) => void;
  toggleParticipantLocalMute: (id: string) => void;
  onSelectParticipant?: (p: any) => void;
  onKickParticipant?: (id: string) => void;
  isMobile?: boolean;
}

const PeoplePane: React.FC<PeoplePaneProps> = ({
  participants,
  sessionId,
  isHost,
  participantVolumes,
  participantMutedLocally,
  setParticipantVolume,
  toggleParticipantLocalMute,
  onSelectParticipant,
  onKickParticipant,
  isMobile = false,
}) => {
  return (
    <div
      className={isMobile ? "mobile-people-pane" : "pane"}
      id={isMobile ? "m-pane-people" : "pp2"}
      role={isMobile ? "tabpanel" : undefined}
      aria-labelledby={isMobile ? "m-tab-people" : undefined}
    >
      {participants.map((p) => {
        const isMe = p.sessionId === sessionId;
        const initial = (p.displayName || "A").charAt(0).toUpperCase();
        const userVol = participantVolumes.get(p.id) ?? 100;
        const isLocMuted = participantMutedLocally.get(p.id) ?? false;

        return (
          <div key={`p-${p.id}`} className="row flex-col items-stretch gap-2 py-2.5 border-b border-white/[0.06]">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="av">
                  <i style={{ background: isMe ? "rgba(99, 102, 241, 0.25)" : "rgba(255, 255, 255, 0.1)" }}>{initial}</i>
                </span>
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-sm font-medium text-white truncate max-w-[130px]">
                    {p.displayName}
                  </span>
                  {isMe && <span className="text-[10px] text-brand-300 font-bold uppercase">(You)</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {p.isHost ? (
                  <span className="r">Host</span>
                ) : isHost && !isMe && !isMobile ? (
                  <button
                    type="button"
                    className="b"
                    style={{ height: "26px", fontSize: "11px", padding: "0 8px" }}
                    onClick={() => onKickParticipant && onKickParticipant(p.id)}
                  >
                    Remove
                  </button>
                ) : (
                  <span className="r">Viewer</span>
                )}
                {isHost && !isMe && isMobile && (
                  <button
                    type="button"
                    className="b"
                    style={{ width: "36px", height: "36px", padding: 0, display: "grid", placeItems: "center" }}
                    onClick={() => onSelectParticipant && onSelectParticipant(p)}
                    aria-label={`Options for ${p.displayName}`}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {!isMe && (
              <div className="flex items-center gap-2 px-1 pt-1 text-xs text-slate-300">
                <button
                  type="button"
                  className={`p-1 rounded-md transition-colors ${isLocMuted ? "text-rose-400 bg-rose-500/20" : "text-slate-400 hover:text-white"
                    }`}
                  aria-label={`Mute or unmute ${p.displayName}`}
                  onClick={() => toggleParticipantLocalMute(p.id)}
                >
                  {isLocMuted || userVol === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={isLocMuted ? 0 : userVol}
                  disabled={isLocMuted}
                  onChange={(e) => setParticipantVolume(p.id, parseInt(e.target.value, 10))}
                  className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
                  aria-label={`${p.displayName} volume`}
                />
                <span className="w-9 text-right font-mono text-[11px] text-slate-400">
                  {isLocMuted ? "Muted" : `${userVol}%`}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
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

  useEffect(() => {
    if (connectionStatus === "ended") {
      showGlobalToast(
        errorMessage || "This watch room has ended.",
        "error"
      );
    }
  }, [connectionStatus, errorMessage, showGlobalToast]);

  if (connectionStatus === "ended" || (connectionStatus === "error" && errorMessage)) {
    return (
      <div className="min-h-screen bg-[#06080d] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden select-none">
        {/* Cinematic ambient background glow for glassmorphism */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] h-[540px] bg-rose-500/10 rounded-full blur-[140px]" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] bg-indigo-500/12 rounded-full blur-[110px]" />
          <div className="amb" aria-hidden="true" />
        </div>
        <div className="grain pointer-events-none" aria-hidden="true" />

        {/* Apple Glassmorphism Card */}
        <div className="relative z-10 w-full max-w-sm p-8 sm:p-9 rounded-[32px] bg-[#12131a]/70 backdrop-blur-2xl border border-white/[0.14] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.28),inset_0_-1px_0_0_rgba(0,0,0,0.5),0_32px_72px_-16px_rgba(0,0,0,0.85)] flex flex-col items-center animate-scaleUp overflow-hidden">
          {/* Subtle top specular sheen */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/35 to-transparent pointer-events-none" />

          {/* Apple-style continuous corner squircle icon */}
          <div className="w-16 h-16 rounded-[22px] bg-rose-500/12 border border-rose-500/30 flex items-center justify-center mb-5 text-rose-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_12px_28px_rgba(244,63,94,0.18)]">
            <AlertCircle className="w-8 h-8 stroke-[2.2]" />
          </div>

          {/* Typography adhering to Apple web scale */}
          <h2 className="text-2xl font-bold text-white tracking-[-0.024em] mb-2">
            Room Cancelled
          </h2>
          <p className="text-white/65 text-sm leading-relaxed mb-7 max-w-[280px]">
            {errorMessage || "This watch room has ended."}
          </p>

          {/* Apple Liquid Glass Return to Home button */}
          <button
            type="button"
            onClick={() => navigate("/")}
            className="group relative inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.16] border border-white/[0.16] hover:border-white/[0.3] text-white font-medium text-sm tracking-tight transition-all duration-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.32),0_8px_24px_-4px_rgba(0,0,0,0.5)] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5),0_12px_32px_-4px_rgba(0,0,0,0.65)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <Home className="w-4 h-4 text-white/80 group-hover:text-white transition-colors" />
            <span>Return to home page</span>
          </button>
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
        needsUserGesture={needsUserGesture}
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
  needsUserGesture: boolean;
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

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const ZOOMS = ["Fit", "Fill 21:9", "Stretch"];
const EMOJIS = ["❤️", "😂", "😮", "👏", "🔥"];

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
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast: showGlobalToast } = useToast();

  const { isCameraOn, isMuted, isConnecting, permissionError, toggleCamera, toggleMute, dismissError } = useVideoControls();
  const {
    allPeers,
    cameraPeers,
    currentParticipantId,
    currentDisplayName,
    participantVolumes,
    participantMutedLocally,
    setParticipantVolume,
    toggleParticipantLocalMute,
    getStream,
  } = useVideoPeers();

  useEffect(() => {
    if (permissionError) {
      showGlobalToast(permissionError, "error");
    }
  }, [permissionError, showGlobalToast]);

  useEffect(() => {
    (window as any).__cinevaUpdateSettings = handleUpdateSettings;
    return () => {
      delete (window as any).__cinevaUpdateSettings;
    };
  }, [handleUpdateSettings]);

  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "participants">("chat");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [playPauseIndicator, setPlayPauseIndicator] = useState<{ action: "play" | "pause"; id: number } | null>(null);
  const playPauseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [floatingReactions, setFloatingReactions] = useState<FloatingEmoji[]>([]);
  const [inviteUrl, setInviteUrl] = useState("");

  const [volume, setVolume] = useState(80);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [bufferPercent, setBufferPercent] = useState(0);
  const [activeMenu, setActiveMenu] = useState<"audio" | "subs" | "sub-settings" | "zoom" | "react" | null>(null);
  const [menuLeft, setMenuLeft] = useState<number>(0);
  const [menuMaxHeight, setMenuMaxHeight] = useState<number>(360);
  const [speed, setSpeed] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(0);

  // Quality & buffering state
  const [availableLevels, setAvailableLevels] = useState<Array<{ id: number; height: number; width: number; bitrate: number; label: string }>>([]);
  const [currentLevelIdx, setCurrentLevelIdx] = useState<number>(-1);
  const [effectiveQuality, setEffectiveQuality] = useState<{ resolution: string; bitrate: string; mode: string }>({
    resolution: "1080p",
    bitrate: "2.8 Mbps",
    mode: "Direct play",
  });

  // Subtitle settings, custom layer, and control bar height observer
  const [subSettings, setSubSettings] = useState<SubtitleSettings>(() => loadSubtitleSettings());
  const [activeCueText, setActiveCueText] = useState<string | null>(null);
  const [controlBarHeight, setControlBarHeight] = useState<number>(76);

  // Mobile layout state (< 900px)
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const isLandscapePhone = useMediaQuery(LANDSCAPE_DRAWER_MEDIA_QUERY);
  const [mobileTab, setMobileTab] = useState<"call" | "chat" | "participants">("call");
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [isTopOverflowOpen, setIsTopOverflowOpen] = useState(false);
  const [isCtlOverflowOpen, setIsCtlOverflowOpen] = useState(false);
  const [isSubSettingsOpen, setIsSubSettingsOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [selectedParticipantForMenu, setSelectedParticipantForMenu] = useState<any | null>(null);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [isLandscapeDrawerOpen, setIsLandscapeDrawerOpen] = useState(false);
  const [keyboardPadding, setKeyboardPadding] = useState(0);
  const [doubleTapRipple, setDoubleTapRipple] = useState<{ side: "left" | "right"; text: string; id: number } | null>(null);
  const mobileMsgStreamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateControlHeight = () => {
      const el = ctlRef.current || document.getElementById("ctl");
      if (!el) return;
      const h = el.getBoundingClientRect().height;
      if (h > 0) setControlBarHeight(Math.round(h));
    };

    updateControlHeight();
    const el = ctlRef.current || document.getElementById("ctl");
    if (!el || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.borderBoxSize?.[0]?.blockSize || entry.target.getBoundingClientRect().height;
        if (h > 0) setControlBarHeight(Math.round(h));
      }
    });

    ro.observe(el);
    window.addEventListener("resize", updateControlHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateControlHeight);
    };
  }, [room]);

  // Track unread chat messages when on another mobile tab
  useEffect(() => {
    if (chatMessages.length > 0) {
      if (mobileTab !== "chat") {
        setUnreadChatCount((prev) => prev + 1);
      }
    }
  }, [chatMessages.length, mobileTab]);

  useEffect(() => {
    if (mobileTab === "chat") {
      setUnreadChatCount(0);
      if (mobileMsgStreamRef.current) {
        mobileMsgStreamRef.current.scrollTop = mobileMsgStreamRef.current.scrollHeight;
      }
    }
  }, [mobileTab]);

  useEffect(() => {
    if (mobileTab === "chat" && mobileMsgStreamRef.current) {
      mobileMsgStreamRef.current.scrollTop = mobileMsgStreamRef.current.scrollHeight;
    }
  }, [chatMessages, mobileTab]);

  // Visual Viewport Listener to keep composer pinned above virtual keyboard on mobile and set --vvh
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handleViewportChange = () => {
      const offset = window.innerHeight - (vv.height + vv.offsetTop);
      setKeyboardPadding(Math.max(0, offset));
      document.documentElement.style.setProperty("--vvh", `${vv.height}px`);
    };

    handleViewportChange();
    vv.addEventListener("resize", handleViewportChange);
    vv.addEventListener("scroll", handleViewportChange);
    return () => {
      vv.removeEventListener("resize", handleViewportChange);
      vv.removeEventListener("scroll", handleViewportChange);
      document.documentElement.style.removeProperty("--vvh");
    };
  }, []);

  // Real HTMLMediaElement state tracking
  const [realVideoPaused, setRealVideoPaused] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);
  const [videoError, setVideoError] = useState<string | null>(null);

  const mediaUrl = room?.media && room.media.status === "ready" && room.media.url ? room.media.url : undefined;
  const isMediaProcessing = room?.media && (room.media.status === "processing" || room.media.status === "uploading");
  const isMediaFailed = room?.media && (room.media.status === "failed" || (videoError !== null && !mediaUrl));
  const isHls = Boolean(
    room?.media?.isHls ||
    (mediaUrl && (mediaUrl.endsWith(".m3u8") || mediaUrl.includes(".m3u8?")))
  );

  const hlsRef = useRef<Hls | null>(null);
  const [hlsAudioTracks, setHlsAudioTracks] = useState<any[]>([]);
  const [audioOptions, setAudioOptions] = useState<AudioOption[]>([]);
  const [subtitleOptions, setSubtitleOptions] = useState<SubtitleOption[]>([]);
  const [selectedAudioIdx, setSelectedAudioIdx] = useState<number>(0);
  const [selectedSubIdx, setSelectedSubIdx] = useState<number>(-1);
  const [userCustomSubs, setUserCustomSubs] = useState<Array<{ label: string; src: string }>>([]);
  const supportedSubtitleOptions = useMemo<SubtitleOption[]>(
    () => subtitleOptions.filter((s) => s.supported && Boolean(s.url)),
    [subtitleOptions]
  );

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
      delete (window as any).__hlsInstance;
    }

    if (!mediaUrl) {
      el.removeAttribute("src");
      el.load();
      return;
    }

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: false,
        startLevel: -1,
        abrEwmaDefaultEstimate: 10000000,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        backBufferLength: 30,
        maxBufferHole: 0.5,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 4,
      });
      (hls as any).subtitleDisplay = false;
      hlsRef.current = hls;
      (window as any).__hlsInstance = hls;

      hls.loadSource(mediaUrl);
      hls.attachMedia(el);

      const updateQualityLevels = () => {
        if (!hls.levels || hls.levels.length === 0) return;
        const levels = hls.levels.map((lvl, idx) => {
          let label = `${lvl.height || 0}p`;
          if ((lvl.height && lvl.height >= 1000) || (lvl.width && lvl.width >= 1900)) label = "1080p";
          else if ((lvl.height && lvl.height >= 700) || (lvl.width && lvl.width >= 1200)) label = "720p";
          else if ((lvl.height && lvl.height >= 400) || (lvl.width && lvl.width >= 800)) label = "480p";
          return {
            id: idx,
            width: lvl.width || 0,
            height: lvl.height || 0,
            bitrate: lvl.bitrate || 0,
            label,
          };
        });
        setAvailableLevels(levels);

        const savedPref = localStorage.getItem("cineva_quality_preference");
        if (savedPref && savedPref !== "auto") {
          const matched = levels.find((l) => l.label.toLowerCase() === savedPref.toLowerCase());
          if (matched) {
            hls.currentLevel = matched.id;
            setCurrentLevelIdx(matched.id);
          }
        }
      };

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        updateQualityLevels();
        if (hls.audioTracks && hls.audioTracks.length > 0) {
          setHlsAudioTracks([...hls.audioTracks]);
        }
      });

      hls.on(Hls.Events.LEVELS_UPDATED, () => {
        updateQualityLevels();
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        const activeLevel = hls.levels[data.level];
        if (activeLevel) {
          const resLabel = ((activeLevel.height && activeLevel.height >= 1000) || (activeLevel.width && activeLevel.width >= 1900))
            ? "1080p"
            : `${activeLevel.height}p`;
          const mbps = activeLevel.bitrate ? `${(activeLevel.bitrate / 1000000).toFixed(1)} Mbps` : "2.8 Mbps";
          const isDirect = !manifest?.videoStream || (manifest.videoStream.codecName === "h264" && (activeLevel.height || 0) >= 720);
          setEffectiveQuality({
            resolution: resLabel,
            bitrate: mbps,
            mode: isDirect ? "Direct play" : "Converted",
          });
        }
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
        if (data.audioTracks && data.audioTracks.length > 0) {
          setHlsAudioTracks([...data.audioTracks]);
        }
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
        setSelectedAudioIdx(data.id);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn("[HLS] Fatal network error, recovering...", data);
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR: {
              console.warn("[HLS] Fatal media error, recovering...", data);
              const curTime = el.currentTime;
              const wasPaused = el.paused;
              hls.recoverMediaError();
              if (curTime > 0) {
                const restorePos = () => {
                  el.currentTime = curTime;
                  if (!wasPaused) el.play().catch(() => {});
                  el.removeEventListener("loadedmetadata", restorePos);
                };
                el.addEventListener("loadedmetadata", restorePos);
              }
              break;
            }
            default:
              console.error("[HLS] Unrecoverable error:", data);
              hls.destroy();
              hlsRef.current = null;
              break;
          }
        }
      });
    } else {
      // Native Safari HLS or Progressive MP4 fallback
      if (el.src !== mediaUrl && !el.src.endsWith(mediaUrl)) {
        el.src = mediaUrl;
        el.load();
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
        delete (window as any).__hlsInstance;
      }
    };
  }, [mediaUrl, isHls, videoRef]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onPlay = () => {
      setRealVideoPaused(false);
      if (el) {
        el.volume = volume / 100;
        if (!isVideoMuted && el.muted) {
          el.muted = false;
        }
      }
    };
    const onPause = () => setRealVideoPaused(true);
    const onWaiting = () => {
      if (el.paused) return;
      setIsBuffering(true);
    };
    const onPlaying = () => {
      setIsBuffering(false);
      setRealVideoPaused(false);
      if (el) {
        el.volume = volume / 100;
        if (!isVideoMuted && el.muted) {
          el.muted = false;
        }
      }
    };
    const onCanPlay = () => {
      setIsBuffering(false);
    };
    const onEnded = () => setRealVideoPaused(true);
    const onTimeUpdate = () => {
      if (Number.isFinite(el.currentTime)) {
        setVideoCurrentTime(el.currentTime);
      }
    };
    const onDurationChange = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setVideoDuration(el.duration);
      }
    };
    const onLoadedMetadata = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setVideoDuration(el.duration);
      }
      setVideoError(null);
      if (el.videoWidth && el.videoHeight) {
        const resLabel = el.videoHeight >= 1000 || el.videoWidth >= 1900 ? "1080p" : `${el.videoHeight}p`;
        setEffectiveQuality((prev) => ({
          ...prev,
          resolution: resLabel,
        }));
      }
    };
    const onError = () => {
      const err = el.error;
      let msg = "Failed to load video file.";
      if (err) {
        if (err.code === 1) msg = "Playback aborted.";
        else if (err.code === 2) msg = "Network error loading video.";
        else if (err.code === 3) msg = "Video decode error.";
        else if (err.code === 4) msg = "Video format not supported by browser.";
      }
      setVideoError(msg);
      setRealVideoPaused(true);
      setIsBuffering(false);
    };

    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("ended", onEnded);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("durationchange", onDurationChange);
    el.addEventListener("loadedmetadata", onLoadedMetadata);
    el.addEventListener("error", onError);

    setRealVideoPaused(el.paused);
    if (el.duration) setVideoDuration(el.duration);

    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("durationchange", onDurationChange);
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
      el.removeEventListener("error", onError);
    };
  }, [videoRef, mediaUrl]);

  // Buffering sync & adaptive renditions listeners
  useEffect(() => {
    const sock = socketService.getSocket();
    if (!sock) return;

    const handleRenditionsUpdated = (data: { masterPlaylistUrl?: string; renditions?: any[] }) => {
      if (hlsRef.current && data.masterPlaylistUrl) {
        hlsRef.current.loadSource(data.masterPlaylistUrl);
      }
    };

    sock.on(SOCKET_EVENTS.RENDITIONS_UPDATED, handleRenditionsUpdated);

    return () => {
      sock.off(SOCKET_EVENTS.RENDITIONS_UPDATED, handleRenditionsUpdated);
    };
  }, [connectionStatus]);

  const manifest = room?.media?.trackManifest;

  const [scrubTip, setScrubTip] = useState<{ text: string; left: number }>({ text: "0:00", left: 0 });
  const [isScrubbing, setIsScrubbing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const subFileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const seekRef = useRef<HTMLDivElement>(null);
  const ctlRef = useRef<HTMLDivElement>(null);
  const msgStreamRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const mediaInfo = formatMediaInfo(room?.media);

  useEffect(() => {
    let active = true;
    getRoomInviteUrl(roomCode)
      .then((url) => {
        if (active && url && !isPrivateAddress(url)) {
          setInviteUrl(url);
        }
      })
      .catch((err) => {
        console.debug("Public invite URL not yet discovered:", err?.message);
      });
    return () => {
      active = false;
    };
  }, [roomCode]);

  const handleTrySample = useCallback(async () => {
    if (!roomCode) return;
    try {
      await attachSampleMedia(roomCode);
    } catch (err: any) {
      console.debug("Failed to attach sample media:", err);
    }
  }, [roomCode]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  }, []);

  const handleSelectQuality = useCallback((levelIdx: number) => {
    setCurrentLevelIdx(levelIdx);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIdx;
    }
    const label = levelIdx === -1 ? "auto" : availableLevels.find((l) => l.id === levelIdx)?.label || "auto";
    localStorage.setItem("cineva_quality_preference", label);
    showToast(`Quality: ${levelIdx === -1 ? `Auto (${effectiveQuality.resolution})` : label}`);
    setActiveMenu(null);
  }, [availableLevels, effectiveQuality.resolution, showToast]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume / 100;
      videoRef.current.muted = isVideoMuted;
    }
  }, [volume, isVideoMuted, videoRef]);

  // Ensure audio is immediately unmuted on any user interaction without needing to move sound bar
  useEffect(() => {
    const unlockAudio = () => {
      const el = videoRef.current;
      if (el) {
        if (!isVideoMuted && el.muted) {
          el.muted = false;
        }
        el.volume = volume / 100;
      }
    };

    window.addEventListener("pointerdown", unlockAudio, { capture: true });
    window.addEventListener("keydown", unlockAudio, { capture: true });
    window.addEventListener("touchstart", unlockAudio, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio, { capture: true });
      window.removeEventListener("keydown", unlockAudio, { capture: true });
      window.removeEventListener("touchstart", unlockAudio, { capture: true });
    };
  }, [isVideoMuted, volume, videoRef]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onProgress = () => {
      const b = el.buffered;
      if (b.length && Number.isFinite(el.duration) && el.duration > 0) {
        setBufferPercent(Math.min(100, Math.max(0, (b.end(b.length - 1) / el.duration) * 100)));
      }
    };
    el.addEventListener("progress", onProgress);
    return () => el.removeEventListener("progress", onProgress);
  }, [videoRef, room?.media]);

  useEffect(() => {
    const opts = formatAudioTrackList(hlsAudioTracks, manifest?.audioTracks);
    setAudioOptions(opts);

    // Read stored audio preference
    const savedAudio = localStorage.getItem(`cineva_audio_${roomCode}`);
    if (savedAudio !== null) {
      const idx = parseInt(savedAudio, 10);
      if (!isNaN(idx) && idx >= 0 && idx < opts.length && opts[idx].supported) {
        setSelectedAudioIdx(idx);
        if (hlsRef.current && hlsRef.current.audioTrack !== idx) {
          hlsRef.current.audioTrack = idx;
        }
        return;
      }
    }

    // Default to track with isDefault: true
    const defIdx = opts.findIndex((o) => o.isDefault);
    const targetIdx = defIdx >= 0 ? defIdx : 0;
    setSelectedAudioIdx(targetIdx);
    if (hlsRef.current && hlsRef.current.audioTrack !== targetIdx && opts.length > 0) {
      hlsRef.current.audioTrack = targetIdx;
    }
  }, [hlsAudioTracks, manifest?.audioTracks, roomCode]);

  useEffect(() => {
    const sOpts = formatSubtitleTrackList(manifest?.subtitleTracks);
    setSubtitleOptions(sOpts);

    const savedSub = localStorage.getItem(`cineva_sub_${roomCode}`);
    if (savedSub !== null) {
      const sIdx = parseInt(savedSub, 10);
      if (!isNaN(sIdx)) {
        setSelectedSubIdx(sIdx);
        return;
      }
    }

    const defSub = sOpts.findIndex((s) => s.isDefault && s.supported);
    if (defSub >= 0) {
      setSelectedSubIdx(defSub);
    } else {
      setSelectedSubIdx(-1);
    }
  }, [manifest?.subtitleTracks, roomCode]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !v.textTracks) return;

    const syncModes = () => {
      for (let i = 0; i < v.textTracks.length; i++) {
        v.textTracks[i].mode = i === selectedSubIdx ? "hidden" : "disabled";
      }
    };

    syncModes();
    v.textTracks.addEventListener("addtrack", syncModes);
    v.textTracks.addEventListener("change", syncModes);

    return () => {
      v.textTracks.removeEventListener("addtrack", syncModes);
      v.textTracks.removeEventListener("change", syncModes);
    };
  }, [selectedSubIdx, userCustomSubs, videoRef]);

  // Track active subtitle cue with delay shifting for custom subtitle layer
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const updateCue = () => {
      if (selectedSubIdx < 0 || !v.textTracks || selectedSubIdx >= v.textTracks.length) {
        setActiveCueText(null);
        return;
      }
      const track = v.textTracks[selectedSubIdx];
      if (!track) {
        setActiveCueText(null);
        return;
      }

      // If delay is active, find cues matching (currentTime - delaySeconds)
      if (subSettings.delaySeconds !== 0 && track.cues && track.cues.length > 0) {
        const cuesList: Array<{ startTime: number; endTime: number; text: string }> = [];
        for (let i = 0; i < track.cues.length; i++) {
          const c = track.cues[i] as any;
          cuesList.push({ startTime: c.startTime, endTime: c.endTime, text: c.text || "" });
        }
        const text = findActiveCueText(cuesList, v.currentTime, subSettings.delaySeconds);
        setActiveCueText(text);
      } else if (track.activeCues && track.activeCues.length > 0) {
        const text = Array.from(track.activeCues)
          .map((c: any) => c.text || "")
          .filter(Boolean)
          .join("\n");
        setActiveCueText(text || null);
      } else if (track.cues && track.cues.length > 0) {
        const cuesList: Array<{ startTime: number; endTime: number; text: string }> = [];
        for (let i = 0; i < track.cues.length; i++) {
          const c = track.cues[i] as any;
          cuesList.push({ startTime: c.startTime, endTime: c.endTime, text: c.text || "" });
        }
        const text = findActiveCueText(cuesList, v.currentTime, 0);
        setActiveCueText(text);
      } else {
        setActiveCueText(null);
      }
    };

    updateCue();

    const track = (v.textTracks && selectedSubIdx >= 0 && selectedSubIdx < v.textTracks.length) ? v.textTracks[selectedSubIdx] : null;
    if (track) {
      track.addEventListener("cuechange", updateCue);
    }
    v.addEventListener("timeupdate", updateCue);

    return () => {
      if (track) {
        track.removeEventListener("cuechange", updateCue);
      }
      v.removeEventListener("timeupdate", updateCue);
    };
  }, [selectedSubIdx, subSettings.delaySeconds, userCustomSubs, videoRef]);

  const handleSelectAudio = useCallback(
    (trackIdx: number) => {
      setSelectedAudioIdx(trackIdx);
      localStorage.setItem(`cineva_audio_${roomCode}`, String(trackIdx));

      const v = videoRef.current;
      const curTime = v ? v.currentTime : 0;
      const wasPaused = v ? v.paused : true;

      if (hlsRef.current) {
        hlsRef.current.audioTrack = trackIdx;
        // Ensure playhead does not jump back to 0 on track swap
        if (v && curTime > 0) {
          setTimeout(() => {
            if (v && Math.abs(v.currentTime - curTime) > 3) {
              v.currentTime = curTime;
              if (!wasPaused) v.play().catch(() => {});
            }
          }, 150);
        }
      } else if (v && (v as any).audioTracks) {
        const list = (v as any).audioTracks;
        for (let i = 0; i < list.length; i++) {
          list[i].enabled = i === trackIdx;
        }
      }

      const opt = audioOptions[trackIdx];
      showToast(`Audio: ${opt?.label || `Track ${trackIdx + 1}`}`);
      setActiveMenu(null);
    },
    [audioOptions, roomCode, showToast, videoRef]
  );

  const handleSelectSubtitle = useCallback(
    (subIdx: number) => {
      setSelectedSubIdx(subIdx);
      localStorage.setItem(`cineva_sub_${roomCode}`, String(subIdx));

      const v = videoRef.current;
      if (v && v.textTracks) {
        for (let i = 0; i < v.textTracks.length; i++) {
          v.textTracks[i].mode = i === subIdx ? "hidden" : "disabled";
        }
      }

      if (hlsRef.current && hlsRef.current.subtitleTracks.length > subIdx && subIdx >= 0) {
        hlsRef.current.subtitleTrack = subIdx;
      } else if (hlsRef.current && subIdx === -1) {
        hlsRef.current.subtitleTrack = -1;
      }

      if (subIdx === -1) {
        showToast("Subtitles off");
      } else if (subIdx < supportedSubtitleOptions.length) {
        const opt = supportedSubtitleOptions[subIdx];
        showToast(`Subtitles: ${opt?.label || `Track ${subIdx + 1}`}`);
      } else {
        const customIdx = subIdx - supportedSubtitleOptions.length;
        const cs = userCustomSubs[customIdx];
        showToast(`Subtitles: ${cs?.label || "Custom"}`);
      }
      setActiveMenu(null);
    },
    [supportedSubtitleOptions, userCustomSubs, roomCode, showToast, videoRef]
  );

  const isActuallyPlaying = !realVideoPaused && (!videoRef.current || !videoRef.current.paused) && playback.isPlaying;
  const curTime = isActuallyPlaying || videoCurrentTime > 0 ? (videoCurrentTime || playback.currentTime) : playback.currentTime;
  const rawDuration = videoDuration || playback.duration || 0;
  const totalDuration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;
  const scrubPercent = totalDuration > 0 && Number.isFinite(curTime) ? Math.min(100, Math.max(0, (curTime / totalDuration) * 100)) : 0;

  const { isIdle, controlsVisible, wakeControls, registerInteractiveRegion } = useIdleControls({
    stageRef,
    ctlRef,
    isPlaying: isActuallyPlaying,
    isMediaReady: !!room?.media && room.media.status === "ready",
    isPausedOrEndedOrLoading: !isActuallyPlaying || isBuffering,
    hasActiveMenuOrModal:
      !!activeMenu ||
      isSubSettingsOpen ||
      isSettingsModalOpen ||
      showShortcutsHelp ||
      isUploadOpen ||
      isGalleryOpen ||
      isCtlOverflowOpen ||
      isTopOverflowOpen ||
      isLandscapeDrawerOpen,
    isDraggingSlider: isScrubbing,
    onVideoClickDesktop: () => {
      if (!canControl) {
        showToast("The host controls playback");
        return;
      }
      const willPlay = !isActuallyPlaying;
      if (playPauseTimerRef.current) {
        clearTimeout(playPauseTimerRef.current);
      }
      setPlayPauseIndicator({ action: willPlay ? "play" : "pause", id: Date.now() });
      playPauseTimerRef.current = setTimeout(() => {
        setPlayPauseIndicator(null);
      }, 650);

      if (willPlay) {
        handlePlay();
      } else {
        handlePause();
      }
    },
    onDoubleTapSeek: (side) => {
      if (!canControl) {
        showToast("The host controls playback");
        return;
      }
      if (side === "left") {
        handleSeek(Math.max(0, curTime - 10));
        setDoubleTapRipple({ side: "left", text: "-10 s", id: Date.now() });
        setTimeout(() => setDoubleTapRipple(null), 500);
      } else {
        handleSeek(Math.min(totalDuration, curTime + 10));
        setDoubleTapRipple({ side: "right", text: "+10 s", id: Date.now() });
        setTimeout(() => setDoubleTapRipple(null), 500);
      }
    },
  });

  // When bar hides after 5s idle, close any open popover menu so whole bar disappears cleanly
  useEffect(() => {
    if (isIdle) {
      setActiveMenu(null);
      setIsCtlOverflowOpen(false);
    }
  }, [isIdle]);

  // Ambient canvas color extractor from video
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const cv = document.createElement("canvas");
    cv.width = 8;
    cv.height = 4;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    if (!cx) return;

    const tone = (r: number, g: number, b: number) => {
      const m = (r + g + b) / 3;
      const k = 0.55;
      return [r, g, b].map((c) => Math.round((m + (c - m) * k) * 0.7)).join(",");
    };

    const interval = setInterval(() => {
      if (document.hidden || v.paused || v.ended || v.readyState < 2) return;
      try {
        cx.drawImage(v, 0, 0, 8, 4);
        const d = cx.getImageData(0, 0, 8, 4).data;
        let a = [0, 0, 0];
        let b = [0, 0, 0];
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 8; x++) {
            const i = (y * 8 + x) * 4;
            const t = x < 4 ? a : b;
            t[0] += d[i];
            t[1] += d[i + 1];
            t[2] += d[i + 2];
          }
        }
        document.documentElement.style.setProperty("--amb1", tone(a[0] / 16, a[1] / 16, a[2] / 16));
        document.documentElement.style.setProperty("--amb2", tone(b[0] / 16, b[1] / 16, b[2] / 16));
      } catch {
        // quiet fallback
      }
    }, 700);

    return () => {
      clearInterval(interval);
      document.documentElement.style.removeProperty("--amb1");
      document.documentElement.style.removeProperty("--amb2");
    };
  }, [videoRef, mediaUrl]);



  const handlePlayerSeek = useCallback(
    (newPosition: number) => {
      if (hlsRef.current) {
        try {
          hlsRef.current.stopLoad();
        } catch { }
      }
      handleSeek(newPosition);
      if (hlsRef.current) {
        try {
          hlsRef.current.startLoad();
        } catch { }
      }
    },
    [handleSeek]
  );

  useEffect(() => {
    (window as any).__cinevaSeek = handlePlayerSeek;
    (window as any).__cinevaPlay = handlePlay;
    (window as any).__cinevaPause = handlePause;
    return () => {
      delete (window as any).__cinevaSeek;
      delete (window as any).__cinevaPlay;
      delete (window as any).__cinevaPause;
    };
  }, [handlePlayerSeek, handlePlay, handlePause]);

  const handleCopyInvite = async () => {
    try {
      const url = await getRoomInviteUrl(roomCode, {
        forceRefresh: !inviteUrl || isPrivateAddress(inviteUrl),
      });
      const ok = await copyToClipboard(url);
      if (ok) {
        setInviteUrl(url);
        setIsInviteOpen(false);
        showToast("Invite link copied to clipboard");
      } else {
        showToast("Failed to copy link. Please copy manually.");
      }
    } catch (err: any) {
      showToast(err.message || "Public invite link unavailable: active public tunnel or deployed domain required.");
    }
  };

  const handleShareWhatsApp = async () => {
    try {
      const url = await getRoomInviteUrl(roomCode, {
        forceRefresh: !inviteUrl || isPrivateAddress(inviteUrl),
      });
      setInviteUrl(url);
      const win = shareOnWhatsApp(url);
      if (!win) {
        showToast("Popup blocked: please allow popups to open WhatsApp.");
      } else {
        setIsInviteOpen(false);
        showToast("Opening WhatsApp...");
      }
    } catch (err: any) {
      showToast(err.message || "Public invite link unavailable: active public tunnel or deployed domain required.");
    }
  };

  const lastHandledMsgIdRef = useRef<string | null>(null);

  const burstReactions = (emoji: string) => {
    const newItems: FloatingEmoji[] = [];
    const baseId = Date.now();
    for (let i = 0; i < 6; i++) {
      newItems.push({
        id: baseId + i + Math.random(),
        emoji,
        left: 20 + Math.random() * 60,
        dx: Math.random() * 120 - 60,
        delay: i * 0.09,
      });
    }
    setFloatingReactions((prev) => [...prev, ...newItems]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((item) => !newItems.some((n) => n.id === item.id)));
    }, 3200);
  };

  // Sync reactions across all room participants via chat stream
  useEffect(() => {
    if (!chatMessages.length) return;
    const latest = chatMessages[chatMessages.length - 1];
    if (!latest || latest.id === lastHandledMsgIdRef.current) return;
    lastHandledMsgIdRef.current = latest.id;

    const trimmed = (latest.message || "").trim();
    if (EMOJIS.includes(trimmed) || trimmed === "😢") {
      burstReactions(trimmed);
    }
  }, [chatMessages]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    handleSendMessage(text);
    setChatInput("");
    setActiveTab("chat");
  };

  useEffect(() => {
    if (msgStreamRef.current) {
      msgStreamRef.current.scrollTop = msgStreamRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const getScrubRatio = (clientX: number) => {
    if (!seekRef.current) return 0;
    const r = seekRef.current.getBoundingClientRect();
    if (!r.width) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };

  const handleSeekDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canControl) {
      showToast("The host controls playback");
      return;
    }
    if (!videoRef.current || !totalDuration) return;
    setIsScrubbing(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { }
    const r = getScrubRatio(e.clientX);
    handlePlayerSeek(r * totalDuration);
    wakeControls();
  };

  const handleSeekMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = getScrubRatio(e.clientX);
    const time = r * totalDuration;
    setScrubTip({ text: fmtTime(time, totalDuration >= 3600), left: r * 100 });
    if (isScrubbing && canControl && totalDuration) {
      handlePlayerSeek(r * totalDuration);
    }
  };

  const handleSeekUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbing) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch { }
      setIsScrubbing(false);
    }
  };

  const handleSeekKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (!canControl) {
        showToast("The host controls playback");
        return;
      }
      handlePlayerSeek(Math.max(0, curTime - 10));
      wakeControls();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (!canControl) {
        showToast("The host controls playback");
        return;
      }
      handlePlayerSeek(Math.min(totalDuration, curTime + 10));
      wakeControls();
    }
  };

  const handleMenuClick = (menu: "audio" | "subs" | "zoom" | "react", e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (activeMenu === menu) {
      setActiveMenu(null);
      return;
    }
    if (ctlRef.current) {
      const c = ctlRef.current.getBoundingClientRect();
      const r = e.currentTarget.getBoundingClientRect();
      const left = Math.max(0, Math.min(c.width - 246, r.left - c.left + r.width / 2 - 115));
      setMenuLeft(left);

      if (stageRef.current) {
        const stageRect = stageRef.current.getBoundingClientRect();
        // Exact pixel room between top of control bar and top of stage, minus 24px safety margin
        const availableHeight = Math.max(180, Math.floor(c.top - stageRect.top - 24));
        setMenuMaxHeight(availableHeight);
      }
    }
    setActiveMenu(menu);
  };

  const handleTogglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch {
      showToast("Picture in picture isn’t available");
    }
  };

  const handleToggleFullscreen = async () => {
    if (isPseudoFullscreen) {
      setIsPseudoFullscreen(false);
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
      return;
    }
    if (stageRef.current?.requestFullscreen) {
      try {
        await stageRef.current.requestFullscreen();
        if (screen.orientation && "lock" in screen.orientation) {
          (screen.orientation as any).lock("landscape").catch(() => { });
        }
        return;
      } catch {
        // Fallback to pseudo-fullscreen on failure
      }
    }
    setIsPseudoFullscreen(true);
  };

  // Global Keyboard Shortcuts (Attached to window with capture, macOS & key-repeat support)
  const { indicator } = useRoomShortcuts({
    videoRef: videoRef as React.RefObject<HTMLVideoElement>,
    canControl,
    curTime,
    totalDuration,
    isActuallyPlaying,
    volume,
    isVideoMuted,
    setVolume,
    setIsVideoMuted,
    handlePlay,
    handlePause,
    handleSeek,
    handleToggleFullscreen,
    onToggleSubtitles: () => {
      if (selectedSubIdx !== null && selectedSubIdx >= 0) {
        handleSelectSubtitle(-1);
        showToast("Subtitles off");
      } else if (supportedSubtitleOptions.length > 0) {
        handleSelectSubtitle(0);
        showToast(`Subtitles: ${supportedSubtitleOptions[0].label}`);
      } else {
        showToast("No subtitles available");
      }
    },
    subSettings,
    setSubSettings,
    saveSubtitleSettings,
    showToast,
    wakeControls,
    activeMenu,
    setActiveMenu,
    showShortcutsHelp,
    setShowShortcutsHelp,
  });

  const handleLocalSubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let txt = String(reader.result || "");
      txt = convertSrtToVtt(txt);
      const blob = new Blob([txt], { type: "text/vtt" });
      const trackUrl = URL.createObjectURL(blob);
      const label = file.name.replace(/\.[^.]+$/, "");

      const newIdx = supportedSubtitleOptions.length + userCustomSubs.length;
      setUserCustomSubs((prev) => [...prev, { label, src: trackUrl }]);
      setSelectedSubIdx(newIdx);
      localStorage.setItem(`cineva_sub_${roomCode}`, String(newIdx));

      handleUploadSubtitle({
        label,
        srclang: "en",
        content: txt,
      });

      setActiveMenu(null);
      showToast("Subtitles added");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const activeCamerasCount = (isCameraOn ? 1 : 0) + cameraPeers.length;

  return (
    <div className="room-shell">
      {/* Soft Ambient Light & Organic Film Grain */}
      <div className="amb" id="amb" aria-hidden="true"></div>
      <div className="grain" aria-hidden="true"></div>

      {/* ================= TOP HEADER BAR ================= */}
      <header className="top gl" style={{ zIndex: 90 }}>
        <div className="mk">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="16" rx="4" />
            <path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5" />
          </svg>
        </div>
        <Link to="/" className="brand">
          Cineva
        </Link>
        <span className="sep"></span>
        <span className="title" id="ttl" style={{ fontSize: "17px", fontWeight: 600 }}>
          {room?.media ? mediaInfo.displayTitle : room?.name || "Friday movie night"}
        </span>
        {isHost && <span className="tag">Host</span>}
        <span className="sp"></span>

        <div style={{ position: "relative", display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            type="button"
            className="b b-tinted hs"
            id="inv"
            title="Invite friends"
            aria-label="Invite friends"
            onClick={() => setIsInviteOpen(!isInviteOpen)}
          >
            <svg viewBox="0 0 24 24">
              <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
            </svg>
            <span>Invite</span>
          </button>

          <button
            type="button"
            className="b"
            id="cnt"
            title="View participants"
            aria-label="View participants"
            onClick={() => {
              setIsSidebarCollapsed(false);
              setActiveTab("participants");
              setMobileTab("participants");
            }}
          >
            <svg viewBox="0 0 24 24">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M3 20a6 6 0 0112 0M16 5a3.5 3.5 0 010 7M18 20a6 6 0 00-1.5-4" />
            </svg>
            <span id="n">{participants.length}</span>
          </button>

          {/* Mobile Top Overflow Button (⋯) */}
          <button
            type="button"
            className="top-overflow-btn"
            id="top-overflow-btn"
            title="More room options"
            aria-label="More room options"
            onClick={() => setIsTopOverflowOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>

          <button
            type="button"
            className="b i"
            id="sb"
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          >
            <svg viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="16" rx="4" />
              <path d="M15 4v16" />
            </svg>
          </button>

          {/* Room Settings Button (Hosts & Viewers) */}
          <button
            type="button"
            className="b i"
            id="room-settings-btn"
            title="Room settings"
            aria-label="Room settings"
            onClick={() => setIsSettingsModalOpen(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>

          {/* Leave Button with Confirmation Popover */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="b i b-leave"
              id="leave"
              title="Leave room"
              aria-label="Leave room"
              onClick={() => setIsLeaveConfirmOpen(!isLeaveConfirmOpen)}
            >
              <svg viewBox="0 0 24 24">
                <path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4M15 8l4 4-4 4M19 12H9" />
              </svg>
            </button>

            {isLeaveConfirmOpen && (
              <div
                className="pop gl o"
                id="leave-confirm-pop"
                role="dialog"
                aria-label="Leave room confirmation"
                style={{
                  width: "270px",
                  position: "absolute",
                  top: "calc(100% + 10px)",
                  right: 0,
                  zIndex: 1000,
                  padding: "16px",
                }}
              >
                <h4 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", margin: 0 }}>Leave room?</h4>
                <p style={{ fontSize: "13px", color: "rgba(235, 235, 245, 0.72)", margin: "6px 0 16px" }}>
                  Are you sure you want to exit this watch party?
                </p>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="b"
                    style={{ flex: 1, height: "36px", fontSize: "13px", borderRadius: "10px" }}
                    onClick={() => setIsLeaveConfirmOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="b"
                    id="confirm-leave-btn"
                    style={{
                      flex: 1,
                      height: "36px",
                      fontSize: "13px",
                      fontWeight: 600,
                      borderRadius: "10px",
                      background: "#ff453a",
                      color: "#ffffff",
                      border: "none",
                    }}
                    onClick={() => {
                      setIsLeaveConfirmOpen(false);
                      handleLeaveRoom();
                      navigate("/", { replace: true });
                    }}
                  >
                    Leave
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Invite Popover */}
          <div className={`pop gl ${isInviteOpen ? "o" : ""}`} id="pop" style={{ width: "310px", zIndex: 1000 }}>
            <h4>Invite friends</h4>
            <p>Anyone with this code or link can join the room.</p>
            <div className="code">
              <span id="rc">{roomCode}</span>
              <button
                type="button"
                className="b p"
                id="cp"
                style={{ height: "34px" }}
                onClick={handleCopyInvite}
              >
                Copy link
              </button>
            </div>
            <div style={{ marginTop: "10px" }}>
              <button
                type="button"
                className="b wa"
                id="waShareBtn"
                onClick={handleShareWhatsApp}
                style={{
                  width: "100%",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  background: "#25D366",
                  color: "#0a1f11",
                  fontWeight: 600,
                  fontSize: "13px",
                  borderRadius: "12px",
                  border: "none",
                  cursor: "pointer",
                  transition: "opacity 0.15s ease, transform 0.1s ease",
                }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.28-2.42 5.84-1.56 1.56-3.64 2.41-5.84 2.41-1.49 0-2.95-.39-4.23-1.15l-.3-.18-3.13.82.83-3.05-.2-.31a8.196 8.196 0 01-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.03-1.25-.75-.67-1.26-1.5-1.41-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.72 4.31 3.81.6.26 1.07.42 1.44.54.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.29z" />
                </svg>
                <span>Share on WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ================= MAIN CONTENT ================= */}
      <div className={`main ${isSidebarCollapsed ? "hide" : ""}`} id="main">
        {/* Cinema Stage Area (Stage + Video Call Bar below) */}
        <div className="stage-area" id="stage-area">
          <section
            ref={stageRef}
            className={`stage ${isIdle ? "idle" : ""} ${isPseudoFullscreen ? "pseudo-fullscreen" : ""}`}
            id="stage"
            aria-label="Video"
          >
          {/* Animated Center Play/Pause indicator on click */}
          {playPauseIndicator && (
            <div
              key={playPauseIndicator.id}
              className="stage-play-pause-indicator"
              aria-hidden="true"
            >
              {playPauseIndicator.action === "play" ? (
                <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" style={{ marginLeft: "3px" }}>
                  <path d="M7 5.5c0-.9.98-1.46 1.76-.98l11.5 6.5c.78.44.78 1.52 0 1.96l-11.5 6.5c-.78.48-1.76-.08-1.76-.98v-13z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="2" />
                  <rect x="14" y="5" width="4" height="14" rx="2" />
                </svg>
              )}
            </div>
          )}
          {/* Double-tap Seek Ripple Indicator */}
          {doubleTapRipple && (
            <div
              className={`double-tap-ripple ${doubleTapRipple.side}`}
              key={doubleTapRipple.id}
            >
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5">
                {doubleTapRipple.side === "left" ? (
                  <path d="M4 12a8 8 0 108-8H8M8 1L5 4l3 3" />
                ) : (
                  <path d="M20 12a8 8 0 11-8-8h4M16 1l3 3-3 3" />
                )}
              </svg>
              <span>{doubleTapRipple.text}</span>
            </div>
          )}

          {/* Exit button in pseudo-fullscreen */}
          {isPseudoFullscreen && (
            <button
              type="button"
              className="pseudo-fs-exit-btn"
              aria-label="Exit fullscreen"
              onClick={() => setIsPseudoFullscreen(false)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                zIndex: 60,
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                background: "rgba(0,0,0,0.75)",
                border: "1px solid rgba(255,255,255,0.25)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            </button>
          )}
          <video
            ref={videoRef as React.RefObject<HTMLVideoElement>}
            id="v"
            playsInline
            crossOrigin="anonymous"
            style={{
              objectFit: zoom === 2 ? "fill" : "contain",
              transform: zoom === 1 ? "scale(1.34)" : undefined,
            }}
          >
            {/* Extracted WebVTT subtitle tracks */}
            {supportedSubtitleOptions.map((s, idx) => {
              const resolvedUrl =
                s.url?.startsWith("http://") || s.url?.startsWith("https://") || s.url?.startsWith("/")
                  ? s.url
                  : mediaUrl
                    ? `${mediaUrl.substring(0, mediaUrl.lastIndexOf("/") + 1)}${s.url}`
                    : s.url;
              return (
                <track
                  key={`sub-${s.streamIndex}-${idx}`}
                  kind="subtitles"
                  label={s.label}
                  srcLang={s.language}
                  src={resolvedUrl}
                  default={selectedSubIdx === idx}
                  ref={(el) => {
                    if (el && el.track) {
                      el.track.mode = selectedSubIdx === idx ? "hidden" : "disabled";
                    }
                  }}
                  onLoad={() => {
                    videoRef.current?.dispatchEvent(new Event("timeupdate"));
                  }}
                />
              );
            })}

            {/* User-uploaded custom subtitles */}
            {userCustomSubs.map((cs, idx) => (
              <track
                key={`custom-sub-${idx}`}
                kind="subtitles"
                label={cs.label}
                srcLang="te"
                src={cs.src}
                default={selectedSubIdx === supportedSubtitleOptions.length + idx}
                ref={(el) => {
                  if (el && el.track) {
                    el.track.mode =
                      selectedSubIdx === supportedSubtitleOptions.length + idx ? "hidden" : "disabled";
                  }
                }}
                onLoad={() => {
                  videoRef.current?.dispatchEvent(new Event("timeupdate"));
                }}
              />
            ))}
          </video>
          <div className="scrim t"></div>
          <div className="scrim bt"></div>

          {/* Custom Subtitle Layer (Above control bar, immune to video zoom) */}
          <SubtitleOverlay
            cueText={activeCueText}
            settings={subSettings}
            controlsVisible={!isIdle}
            controlBarHeight={controlBarHeight}
            isSettingsOpen={isSubSettingsOpen || activeMenu === "sub-settings"}
            onUpdatePositionOffset={(newOffset) => {
              setSubSettings((prev: SubtitleSettings) => {
                const updated = { ...prev, positionOffsetPercent: newOffset };
                saveSubtitleSettings(updated);
                return updated;
              });
            }}
            stageElement={stageRef.current}
          />

          {/* On-Video Shortcut Indicator */}
          {indicator && (
            <div
              key={indicator.id}
              className="stage-shortcut-indicator"
              style={{
                position: "absolute",
                top: "24px",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 15,
                background: "rgba(15, 17, 23, 0.85)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "24px",
                padding: "8px 18px",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 600,
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
                pointerEvents: "none",
                animation: "indicatorFade 700ms ease forwards",
              }}
            >
              {indicator.text}
            </div>
          )}

          {/* Docked Subtitle Settings Panel */}
          {activeMenu === "sub-settings" && (
            <aside
              className="sub-settings-dock gl"
              id="sub-settings-dock"
              role="dialog"
              aria-label="Subtitle settings"
              style={{
                position: "absolute",
                right: "16px",
                top: "16px",
                bottom: `${!isIdle ? controlBarHeight + 16 : 28}px`,
                width: "320px",
                maxWidth: "calc(100% - 32px)",
                overflowY: "auto",
                zIndex: 10,
                background: "rgba(18, 20, 29, 0.92)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderRadius: "16px",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                boxShadow: "0 16px 40px rgba(0, 0, 0, 0.7)",
                transition: "bottom 200ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <SubtitleSettingsPanel
                settings={subSettings}
                onChange={(updated) => {
                  setSubSettings(updated);
                  saveSubtitleSettings(updated);
                }}
                onBack={() => setActiveMenu("subs")}
                onClose={() => {
                  setActiveMenu(null);
                  document.getElementById("sub-btn")?.focus();
                }}
              />
            </aside>
          )}

          {/* Screening States: Empty / Preparing / Failed / Ready */}
          {!room?.media ? (
            <div className="empty" id="empty">
              <div className="ring gl">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="16" rx="4" />
                  <path d="M10 9.5l5 2.5-5 2.5z" />
                </svg>
              </div>
              <h1>Add a movie to start</h1>
              <p>Friends who join will wait here until it’s ready.</p>
              <div className="row">
                <button type="button" className="b p" id="add" onClick={() => setIsUploadOpen(true)}>
                  Choose a file
                </button>
                {import.meta.env.DEV && (
                  <button type="button" className="b" id="smp" onClick={handleTrySample}>
                    Try a sample
                  </button>
                )}
              </div>
              <small>MKV, MP4, WebM and MOV</small>
            </div>
          ) : isMediaProcessing ? (
            <div className="empty" id="preparingState">
              <div className="ring gl">
                <RefreshCw className="w-8 h-8 animate-spin" style={{ color: "var(--accent, #6366f1)" }} />
              </div>
              <h1 style={{ fontSize: "22px", fontWeight: 600 }}>
                {isHost ? "Preparing your movie…" : `Host is preparing the movie, ${Math.round(room.media.transcodeProgress || 0)}%`}
              </h1>
              <p style={{ color: "var(--t2)", maxWidth: "26em", fontSize: "14px" }}>
                {room.media.stage || (isHost ? "Packaging multi-audio HLS streams..." : "Host is preparing the movie...")}
              </p>
              <div style={{ width: "260px", margin: "16px 0 6px" }}>
                <div className="bar" style={{ margin: "0 0 8px 0" }}>
                  <i style={{ width: `${Math.max(5, Math.min(100, room.media.transcodeProgress || 0))}%` }}></i>
                </div>
                <div className="pmeta">
                  <span>{room.media.transcodeProgress ? `${Math.round(room.media.transcodeProgress)}%` : "Processing..."}</span>
                  {room.media.speed && <span>{room.media.speed}</span>}
                  {room.media.etaSeconds && <span>ETA {room.media.etaSeconds}s</span>}
                </div>
              </div>
              <small style={{ color: "var(--t3)", fontSize: "12px", marginTop: "12px" }}>
                {isHost ? "Transcoding to H.264 / AAC MP4 with faststart" : "Playback will start automatically when ready"}
              </small>
            </div>
          ) : isMediaFailed ? (
            <div className="empty" id="failedState">
              <div className="ring gl" style={{ borderColor: "rgba(244,63,94,0.4)" }}>
                <AlertCircle className="w-8 h-8 text-rose-400" />
              </div>
              <h1 style={{ fontSize: "22px", fontWeight: 600, color: "#fff" }}>Unable to play video</h1>
              <p style={{ color: "var(--t2)", maxWidth: "26em", fontSize: "14px" }}>
                {videoError || room.media.transcodeError || "An error occurred while loading or decoding this media file."}
              </p>
              <div className="row">
                {isHost ? (
                  <>
                    <button type="button" className="b p" onClick={() => setIsUploadOpen(true)}>
                      Choose another file
                    </button>
                    <button type="button" className="b" onClick={handleMediaRetry}>
                      Try sample movie
                    </button>
                  </>
                ) : (
                  <button type="button" className="b p" onClick={() => window.location.reload()}>
                    Reload room
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Buffering Indicator */}
              {isBuffering && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    pointerEvents: "none",
                    zIndex: 5,
                  }}
                >
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "50%",
                      border: "3px solid rgba(255,255,255,0.2)",
                      borderTopColor: "#fff",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                </div>
              )}

              {/* Top Video Overlay Bar */}
              <div className="ovl" id="ovl" data-controls="true">
                <span className="pill gl">
                  <span className={`dot ${rtt > 80 ? "warn" : ""}`} id="dt"></span>
                  <span id="pt">{mediaInfo.displayTitle}</span>
                  <span style={{ color: "var(--t3)" }} id="ss">
                    {Math.round(rtt) <= 15 ? "In sync" : `${Math.round(rtt)} ms sync`}
                  </span>
                </span>
                {isHost && (
                  <button type="button" className="b gl" id="chg" onClick={() => setIsUploadOpen(true)}>
                    Change movie
                  </button>
                )}
              </div>

              {/* Floating Glass Control Bar */}
              <div ref={ctlRef} className="ctl gl" id="ctl" data-controls="true" onClick={(e) => e.stopPropagation()}>
                {/* Seek Scrubber */}
                <div
                  ref={seekRef}
                  className="seek"
                  id="seek"
                  role="slider"
                  tabIndex={0}
                  aria-label="Seek"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(scrubPercent)}
                  onPointerDown={handleSeekDown}
                  onPointerMove={handleSeekMove}
                  onPointerUp={handleSeekUp}
                  onPointerCancel={handleSeekUp}
                  onKeyDown={handleSeekKeyDown}
                >
                  <div className="buf" id="buf" style={{ width: `${bufferPercent}%` }}></div>
                  <div className="pl" id="pl" style={{ width: `${scrubPercent}%` }}></div>
                  <span className="tip" id="tip" style={{ left: `${scrubTip.left}%` }}>
                    {scrubTip.text}
                  </span>
                </div>

                {/* Controls Row */}
                <div className="cr">
                  <button
                    type="button"
                    className="cb pp"
                    id="pp"
                    aria-label={isActuallyPlaying ? "Pause" : "Play"}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      if (!canControl) {
                        showToast("The host controls playback");
                        return;
                      }
                      isActuallyPlaying ? handlePause() : handlePlay();
                      wakeControls();
                    }}
                  >
                    {isActuallyPlaying ? (
                      <svg viewBox="0 0 24 24" id="ppi">
                        <path d="M6.5 4.5h3.5v15H6.5zM14 4.5h3.5v15H14z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" id="ppi">
                        <path d="M7 4.5v15L19.5 12z" />
                      </svg>
                    )}
                  </button>

                  <button
                    type="button"
                    className="cb"
                    id="bk"
                    aria-label="Back 10 seconds"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      if (!canControl) {
                        showToast("The host controls playback");
                        return;
                      }
                      handleSeek(Math.max(0, curTime - 10));
                      wakeControls();
                    }}
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M4 12a8 8 0 108-8H8M8 1L5 4l3 3" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="cb"
                    id="fw"
                    aria-label="Forward 10 seconds"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      if (!canControl) {
                        showToast("The host controls playback");
                        return;
                      }
                      handleSeek(Math.min(totalDuration, curTime + 10));
                      wakeControls();
                    }}
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M20 12a8 8 0 11-8-8h4M16 1l3 3-3 3" />
                    </svg>
                  </button>

                  <span className="vw">
                    <button
                      type="button"
                      className="cb"
                      id="mt"
                      aria-label={isVideoMuted ? "Unmute" : "Mute"}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        setIsVideoMuted(!isVideoMuted);
                      }}
                    >
                      {isVideoMuted || volume === 0 ? (
                        <svg viewBox="0 0 24 24" id="mti">
                          <path d="M4 10v4h3l5 4V6L7 10zM16 9.5l5 5M21 9.5l-5 5" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" id="mti">
                          <path d="M4 10v4h3l5 4V6L7 10zM16 9.5a3.5 3.5 0 010 5M18.5 7a7 7 0 010 10" />
                        </svg>
                      )}
                    </button>
                    <input
                      className="vr"
                      id="vr"
                      type="range"
                      min={0}
                      max={100}
                      value={isVideoMuted ? 0 : volume}
                      style={{
                        background: `linear-gradient(to right, #6366f1 ${isVideoMuted ? 0 : volume}%, rgba(255, 255, 255, 0.2) ${isVideoMuted ? 0 : volume}%)`,
                      }}
                      aria-label="Volume"
                      onChange={(e) => {
                        setVolume(Number(e.target.value));
                        setIsVideoMuted(false);
                      }}
                    />
                  </span>

                  <span className="tm" id="tm">
                    {fmtTime(curTime)} / {fmtTime(totalDuration)}
                  </span>
                  <span className="sp"></span>

                  <button
                    type="button"
                    className="cb"
                    data-m="audio"
                    aria-label="Audio"
                    aria-expanded={activeMenu === "audio"}
                    onClick={(e) => handleMenuClick("audio", e)}
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="cb"
                    id="sub-btn"
                    data-m="subs"
                    aria-label="Subtitles"
                    aria-expanded={activeMenu === "subs"}
                    onClick={(e) => handleMenuClick("subs", e)}
                  >
                    <svg viewBox="0 0 24 24">
                      <rect x="3" y="5" width="18" height="14" rx="4" />
                      <path d="M7 11h3M13 11h4M7 15h5M15 15h2" />
                    </svg>
                  </button>



                  <button
                    type="button"
                    className="cb"
                    data-m="zoom"
                    aria-label="Zoom"
                    aria-expanded={activeMenu === "zoom"}
                    onClick={(e) => handleMenuClick("zoom", e)}
                  >
                    <svg viewBox="0 0 24 24">
                      <circle cx="11" cy="11" r="7" />
                      <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="cb"
                    data-m="react"
                    aria-label="Reactions"
                    aria-expanded={activeMenu === "react"}
                    onClick={(e) => handleMenuClick("react", e)}
                  >
                    <svg viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8.5 14a4 4 0 007 0M9 9.5h.01M15 9.5h.01" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="cb"
                    id="pip"
                    aria-label="Picture in picture"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      handleTogglePiP();
                    }}
                  >
                    <svg viewBox="0 0 24 24">
                      <rect x="3" y="5" width="18" height="14" rx="4" />
                      <rect x="12" y="11" width="6" height="5" rx="1.2" />
                    </svg>
                  </button>



                  <button
                    type="button"
                    className="cb cb-more"
                    id="ctl-more-btn"
                    aria-label="More player options"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setIsCtlOverflowOpen(true);
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                      <circle cx="5" cy="12" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="19" cy="12" r="2" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="cb"
                    id="fs"
                    aria-label="Fullscreen"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      handleToggleFullscreen();
                    }}
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                    </svg>
                  </button>
                </div>

                {/* Popover Menu inside Player (excluding docked sub-settings) */}
                {activeMenu && activeMenu !== "sub-settings" && (
                  <div
                    className="mn gl"
                    id="mn"
                    role="menu"
                    data-controls="true"
                    style={{ left: `${menuLeft}px`, maxHeight: `${menuMaxHeight}px` }}
                    onClick={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                  >
                    {activeMenu === "audio" && (
                      <>
                        <h4>Audio</h4>
                        <small>Only you hear this choice.</small>
                        {audioOptions.length <= 1 ? (
                          <div style={{ padding: "8px 12px", color: "var(--t2)", fontSize: "13px" }}>
                            {audioOptions.length === 1 && audioOptions[0].supported === false
                              ? "This file's audio is not switchable in fallback mode"
                              : "This file has one audio track"}
                          </div>
                        ) : (
                          audioOptions.map((opt) => (
                            <button
                              key={opt.id}
                              role="menuitemradio"
                              aria-checked={selectedAudioIdx === opt.id}
                              disabled={!opt.supported}
                              style={!opt.supported ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                              title={opt.unsupportedReason}
                              onClick={() => {
                                if (!opt.supported) return;
                                handleSelectAudio(opt.id);
                              }}
                            >
                              <span>{opt.label}</span>
                              {selectedAudioIdx === opt.id && (
                                <svg className="ck" viewBox="0 0 24 24">
                                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                                </svg>
                              )}
                            </button>
                          ))
                        )}
                      </>
                    )}

                    {activeMenu === "subs" && (
                      <>
                        <h4>Subtitles</h4>
                        <small>Only you see this choice.</small>
                        <button
                          role="menuitemradio"
                          aria-checked={selectedSubIdx === -1}
                          onClick={() => handleSelectSubtitle(-1)}
                        >
                          Off
                          {selectedSubIdx === -1 && (
                            <svg className="ck" viewBox="0 0 24 24">
                              <path d="M5 12.5l4.5 4.5L19 7.5" />
                            </svg>
                          )}
                        </button>
                        {subtitleOptions.map((opt) => {
                          const sIdx = supportedSubtitleOptions.findIndex((s) => s.id === opt.id);
                          const isSelected = sIdx >= 0 && selectedSubIdx === sIdx;
                          return (
                            <button
                              key={opt.id}
                              role="menuitemradio"
                              aria-checked={isSelected}
                              disabled={!opt.supported}
                              style={!opt.supported ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                              title={opt.unsupportedReason}
                              onClick={() => {
                                if (!opt.supported || sIdx < 0) return;
                                handleSelectSubtitle(sIdx);
                              }}
                            >
                              <span>{opt.label}</span>
                              {isSelected && (
                                <svg className="ck" viewBox="0 0 24 24">
                                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                        {userCustomSubs.map((cs, idx) => {
                          const cIdx = supportedSubtitleOptions.length + idx;
                          return (
                            <button
                              key={`custom-sub-btn-${idx}`}
                              role="menuitemradio"
                              aria-checked={selectedSubIdx === cIdx}
                              onClick={() => handleSelectSubtitle(cIdx)}
                            >
                              <span>{cs.label} (Custom)</span>
                              {selectedSubIdx === cIdx && (
                                <svg className="ck" viewBox="0 0 24 24">
                                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                        <hr />
                        <button
                          type="button"
                          onClick={() => {
                            subFileInputRef.current?.click();
                            setActiveMenu(null);
                          }}
                        >
                          Add subtitle file…
                        </button>
                        <button
                          type="button"
                          id="sub-settings-trigger"
                          onClick={() => {
                            setActiveMenu("sub-settings");
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <span>Subtitle settings…</span>
                          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, opacity: 0.7 }} fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </button>
                      </>
                    )}


                    {activeMenu === "zoom" && (
                      <>
                        <h4>Zoom</h4>
                        {ZOOMS.map((z, idx) => (
                          <button
                            key={z}
                            role="menuitemradio"
                            aria-checked={zoom === idx}
                            onClick={() => {
                              setZoom(idx);
                              showToast(`Zoom: ${z}`);
                              setActiveMenu(null);
                            }}
                          >
                            {z}
                            {zoom === idx && (
                              <svg className="ck" viewBox="0 0 24 24">
                                <path d="M5 12.5l4.5 4.5L19 7.5" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </>
                    )}

                    {activeMenu === "react" && (
                      <div className="rx">
                        {EMOJIS.map((em) => (
                          <button
                            key={em}
                            type="button"
                            aria-label={`React ${em}`}
                            onClick={() => {
                              handleSendMessage(em);
                              setActiveMenu(null);
                            }}
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Floating Reactions on Stage */}
          {floatingReactions.map((item) => (
            <span
              key={item.id}
              className="fl"
              style={{
                left: `${item.left}%`,
                animationDelay: `${item.delay}s`,
                ["--dx" as any]: `${item.dx}px`,
              }}
            >
              {item.emoji}
            </span>
          ))}
        </section>

          {/* Desktop Video Call Section below movie */}
          {!isMobile && (
            <section className="call-bar gl" aria-label="Video call">
              <span id="inc" className="sr-only">{participants.length} in the call</span>
              <div className="call-bar-body">
                <CallTiles
                  participants={participants}
                  sessionId={sessionId}
                  currentParticipantId={currentParticipantId}
                  currentDisplayName={currentDisplayName}
                  displayName={displayName}
                  isHost={isHost}
                  isMuted={isMuted}
                  isCameraOn={isCameraOn}
                  getStream={getStream}
                  allPeers={allPeers}
                  participantVolumes={participantVolumes}
                  participantMutedLocally={participantMutedLocally}
                  setParticipantVolume={setParticipantVolume}
                  toggleParticipantLocalMute={toggleParticipantLocalMute}
                  onInvite={() => setIsInviteOpen(true)}
                  isMobile={false}
                />
              </div>

              <div className="call-bar-header">
                <div className="call-bar-controls">
                  <CallDock
                    isMuted={isMuted}
                    toggleMute={toggleMute}
                    isCameraOn={isCameraOn}
                    toggleCamera={toggleCamera}
                    isConnecting={isConnecting}
                    permissionError={permissionError}
                    isMobile={false}
                    showText={false}
                  />
                  <button
                    type="button"
                    className="b b-gallery-btn"
                    title="Fullscreen participant gallery"
                    aria-label="Fullscreen participant gallery"
                    onClick={() => setIsGalleryOpen(true)}
                  >
                    <Maximize2 className="w-4 h-4" />
                    <span className="sr-only">Gallery</span>
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>

        {isMobile ? (
          /* Mobile Tabbed Area (< 900px) */
          <div className={`mobile-tabs-area ${isLandscapeDrawerOpen ? "open" : ""}`} id="mobile-tabs-area">
            <div className="mobile-seg" data-t={mobileTab} role="tablist">
              <span className="mobile-seg-indicator" aria-hidden="true" />
              <button
                type="button"
                role="tab"
                id="m-tab-call"
                aria-controls="m-pane-call"
                aria-selected={mobileTab === "call"}
                onClick={() => setMobileTab("call")}
              >
                Call
              </button>
              <button
                type="button"
                role="tab"
                id="m-tab-chat"
                aria-controls="m-pane-chat"
                aria-selected={mobileTab === "chat"}
                onClick={() => setMobileTab("chat")}
              >
                Chat
                {unreadChatCount > 0 && <span className="unread-badge">{unreadChatCount}</span>}
              </button>
              <button
                type="button"
                role="tab"
                id="m-tab-people"
                aria-controls="m-pane-people"
                aria-selected={mobileTab === "participants"}
                onClick={() => setMobileTab("participants")}
              >
                People ({participants.length})
              </button>
            </div>

            <div className="tabs-panel">
              {mobileTab === "call" && (
                <div className="mobile-call-pane" id="m-pane-call" role="tabpanel" aria-labelledby="m-tab-call">
                  <CallTiles
                    participants={participants}
                    sessionId={sessionId}
                    currentParticipantId={currentParticipantId}
                    currentDisplayName={currentDisplayName}
                    displayName={displayName}
                    isHost={isHost}
                    isMuted={isMuted}
                    isCameraOn={isCameraOn}
                    getStream={getStream}
                    allPeers={allPeers}
                    participantVolumes={participantVolumes}
                    participantMutedLocally={participantMutedLocally}
                    setParticipantVolume={setParticipantVolume}
                    toggleParticipantLocalMute={toggleParticipantLocalMute}
                    onInvite={() => setIsInviteOpen(true)}
                    isMobile={true}
                  />
                  <CallDock
                    isMuted={isMuted}
                    toggleMute={toggleMute}
                    isCameraOn={isCameraOn}
                    toggleCamera={toggleCamera}
                    isConnecting={isConnecting}
                    permissionError={permissionError}
                    isMobile={true}
                  />
                </div>
              )}

              {mobileTab === "chat" && (
                <ChatPane
                  chatMessages={chatMessages}
                  participants={participants}
                  currentParticipantId={currentParticipantId}
                  sessionId={sessionId}
                  chatInput={chatInput}
                  setChatInput={setChatInput}
                  handleChatSubmit={handleChatSubmit}
                  streamRef={msgStreamRef}
                  isMobile={true}
                  keyboardPadding={keyboardPadding}
                />
              )}

              {mobileTab === "participants" && (
                <PeoplePane
                  participants={participants}
                  sessionId={sessionId}
                  isHost={isHost}
                  participantVolumes={participantVolumes}
                  participantMutedLocally={participantMutedLocally}
                  setParticipantVolume={setParticipantVolume}
                  toggleParticipantLocalMute={toggleParticipantLocalMute}
                  onSelectParticipant={(p) => setSelectedParticipantForMenu(p)}
                  onKickParticipant={handleKickParticipant}
                  isMobile={true}
                />
              )}
            </div>
          </div>
        ) : (
          /* Desktop Sidebar (>= 900px) */
          <aside className="side gl" aria-label="Chat and people">
            {/* Segmented Tab (Chat / People) */}
            <div
              className="seg"
              id="seg"
              data-t={activeTab === "chat" ? "chat" : "people"}
              role="tablist"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "chat"}
                data-t="chat"
                onClick={() => setActiveTab("chat")}
              >
                Chat
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "participants"}
                data-t="people"
                onClick={() => setActiveTab("participants")}
              >
                People
              </button>
            </div>

            {/* Chat Pane / People Pane */}
            {activeTab === "chat" ? (
              <ChatPane
                chatMessages={chatMessages}
                participants={participants}
                currentParticipantId={currentParticipantId}
                sessionId={sessionId}
                chatInput={chatInput}
                setChatInput={setChatInput}
                handleChatSubmit={handleChatSubmit}
                streamRef={msgStreamRef}
                isMobile={false}
              />
            ) : (
              <PeoplePane
                participants={participants}
                sessionId={sessionId}
                isHost={isHost}
                participantVolumes={participantVolumes}
                participantMutedLocally={participantMutedLocally}
                setParticipantVolume={setParticipantVolume}
                toggleParticipantLocalMute={toggleParticipantLocalMute}
                onSelectParticipant={(p) => setSelectedParticipantForMenu(p)}
                onKickParticipant={handleKickParticipant}
                isMobile={false}
              />
            )}
          </aside>
        )}
      </div>

      {/* Floating Toast Notification */}
      <div className={`toast gl ${toastMessage ? "s" : ""}`} id="ts" role="status">
        {toastMessage}
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        id="fi"
        accept="video/*,.mkv"
        hidden
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            setIsUploadOpen(true);
          }
        }}
      />
      <input
        ref={subFileInputRef}
        type="file"
        id="si"
        accept=".srt,.vtt"
        hidden
        onChange={handleLocalSubChange}
      />

      {/* Media Upload Modal */}
      {room && (
        <MediaUploadModal
          roomId={room.id}
          sessionId={sessionId}
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          onUploadComplete={() => {
            setIsUploadOpen(false);
            showToast("Screening video updated");
          }}
        />
      )}

      {/* Diagnostics Debug Panels when ?debug=1 */}
      {(window.location.search.includes("debug=1") || searchParams.get("debug") === "1") && (
        <DebugPanel
          playback={playback}
          connectionStatus={connectionStatus}
          isHost={isHost}
          rtt={rtt}
          videoRef={videoRef as React.RefObject<HTMLVideoElement>}
        />
      )}
      {/* Fullscreen Participant Gallery */}
      <ParticipantGalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        roomTitle={room?.name || `Room ${roomCode}`}
        participants={participants}
        sessionId={sessionId}
        currentParticipantId={currentParticipantId}
        currentDisplayName={displayName}
        isHost={isHost}
        isCameraOn={isCameraOn}
        isMuted={isMuted}
        allPeers={allPeers}
        participantVolumes={participantVolumes}
        participantMutedLocally={participantMutedLocally}
        onVolumeChange={setParticipantVolume}
        onToggleLocalMute={toggleParticipantLocalMute}
        onToggleCamera={toggleCamera}
        onToggleMute={toggleMute}
        getStream={getStream}
      />

      {/* Keyboard Shortcuts Cheat Sheet */}
      <ShortcutsModal
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />

      {/* Mobile Top Overflow BottomSheet */}
      <BottomSheet
        isOpen={isTopOverflowOpen}
        onClose={() => setIsTopOverflowOpen(false)}
        title="Room Options"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <button
            type="button"
            className="mobile-sheet-btn"
            id="sheet-opt-invite"
            onClick={() => {
              setIsTopOverflowOpen(false);
              setIsInviteOpen(true);
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
                <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
              </svg>
              <span>Invite Friends</span>
            </div>
            <span>→</span>
          </button>

          <button
            type="button"
            className="mobile-sheet-btn"
            id="sheet-opt-chat"
            onClick={() => {
              setIsTopOverflowOpen(false);
              setMobileTab("chat");
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              <span>Chat Panel</span>
            </div>
            <span>→</span>
          </button>

          {isHost && (
            <button
              type="button"
              className="mobile-sheet-btn"
              id="sheet-opt-settings"
              onClick={() => {
                setIsTopOverflowOpen(false);
                setIsSettingsModalOpen(true);
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
                <span>Room Settings</span>
              </div>
              <span>→</span>
            </button>
          )}

          <button
            type="button"
            className="mobile-sheet-btn"
            id="sheet-opt-subs"
            onClick={() => {
              setIsTopOverflowOpen(false);
              setIsSubSettingsOpen(true);
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="4" />
                <path d="M7 11h3M13 11h4M7 15h5M15 15h2" />
              </svg>
              <span>Subtitle Settings</span>
            </div>
            <span>→</span>
          </button>

          {!('ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)) && (
            <button
              type="button"
              className="mobile-sheet-btn"
              id="sheet-opt-shortcuts"
              onClick={() => {
                setIsTopOverflowOpen(false);
                setShowShortcutsHelp(true);
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
                </svg>
                <span>Keyboard Shortcuts</span>
              </div>
              <span>→</span>
            </button>
          )}

          <hr style={{ border: 0, borderTop: "1px solid rgba(255, 255, 255, 0.1)", margin: "6px 0" }} />

          <button
            type="button"
            className="mobile-sheet-btn destructive"
            id="sheet-opt-leave"
            onClick={() => {
              setIsTopOverflowOpen(false);
              handleLeaveRoom();
              navigate("/", { replace: true });
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
                <path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4M15 8l4 4-4 4M19 12H9" />
              </svg>
              <span>Leave Room</span>
            </div>
          </button>
        </div>
      </BottomSheet>

      {/* Mobile Player Control Options BottomSheet */}
      <BottomSheet
        isOpen={isCtlOverflowOpen}
        onClose={() => setIsCtlOverflowOpen(false)}
        title="Playback & Media Options"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Quick Reactions Bar */}
          <div>
            <div style={{ fontSize: "11px", color: "var(--t2)", marginBottom: "8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Quick Reactions
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "space-between" }}>
              {["❤️", "😂", "😮", "😢", "👏", "🔥"].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  style={{
                    flex: 1,
                    height: "44px",
                    fontSize: "20px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.08)",
                    border: "none",
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                  }}
                  onClick={() => {
                    handleSendMessage(emoji);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <hr style={{ border: 0, borderTop: "1px solid rgba(255, 255, 255, 0.1)", margin: "2px 0" }} />

          {/* Audio Tracks */}
          <div>
            <div style={{ fontSize: "11px", color: "var(--t2)", marginBottom: "6px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Audio Track
            </div>
            {audioOptions.length <= 1 ? (
              <div style={{ fontSize: "13px", color: "var(--t3)", padding: "4px 0" }}>
                Default Audio Track
              </div>
            ) : (
              audioOptions.map((opt) => (
                <button
                  key={`m-aud-${opt.id}`}
                  type="button"
                  className="mobile-sheet-btn"
                  style={{ fontWeight: selectedAudioIdx === opt.id ? 700 : 400, marginTop: "4px" }}
                  onClick={() => handleSelectAudio(opt.id)}
                >
                  <span>{opt.label}</span>
                  {selectedAudioIdx === opt.id && <span>✓</span>}
                </button>
              ))
            )}
          </div>

          <hr style={{ border: 0, borderTop: "1px solid rgba(255, 255, 255, 0.1)", margin: "2px 0" }} />

          {/* Subtitles */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", color: "var(--t2)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Subtitles
              </span>
              <button
                type="button"
                style={{ fontSize: "12px", color: "#818cf8", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                onClick={() => {
                  setIsCtlOverflowOpen(false);
                  setIsSubSettingsOpen(true);
                }}
              >
                Subtitle Settings →
              </button>
            </div>

            <button
              type="button"
              className="mobile-sheet-btn"
              style={{ fontWeight: selectedSubIdx === -1 ? 700 : 400 }}
              onClick={() => handleSelectSubtitle(-1)}
            >
              <span>Off</span>
              {selectedSubIdx === -1 && <span>✓</span>}
            </button>

            {subtitleOptions.map((opt) => {
              const sIdx = supportedSubtitleOptions.findIndex((s) => s.id === opt.id);
              const isSelected = sIdx >= 0 && selectedSubIdx === sIdx;
              return (
                <button
                  key={`m-sub-${opt.id}`}
                  type="button"
                  className="mobile-sheet-btn"
                  style={{ fontWeight: isSelected ? 700 : 400, marginTop: "4px" }}
                  onClick={() => sIdx >= 0 && handleSelectSubtitle(sIdx)}
                >
                  <span>{opt.label}</span>
                  {isSelected && <span>✓</span>}
                </button>
              );
            })}

            <button
              type="button"
              className="mobile-sheet-btn"
              style={{ marginTop: "4px" }}
              onClick={() => {
                subFileInputRef.current?.click();
                setIsCtlOverflowOpen(false);
              }}
            >
              <span>Add Subtitle File (.srt, .vtt)…</span>
            </button>
          </div>



          {/* Zoom */}
          <div>
            <div style={{ fontSize: "11px", color: "var(--t2)", marginBottom: "6px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Video Aspect & Zoom
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              {[
                { id: 0, label: "Fit" },
                { id: 2, label: "Fill" },
                { id: 1, label: "Zoom 1.34x" },
              ].map((z) => (
                <button
                  key={`m-zoom-${z.id}`}
                  type="button"
                  style={{
                    flex: 1,
                    height: "44px",
                    borderRadius: "10px",
                    background: zoom === z.id ? "rgba(99, 102, 241, 0.4)" : "rgba(255,255,255,0.08)",
                    border: zoom === z.id ? "1px solid #6366f1" : "none",
                    color: "#fff",
                    fontWeight: zoom === z.id ? 700 : 500,
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setZoom(z.id);
                    showToast(`Zoom: ${z.label}`);
                  }}
                >
                  {z.label}
                </button>
              ))}
            </div>
          </div>

          <hr style={{ border: 0, borderTop: "1px solid rgba(255, 255, 255, 0.1)", margin: "2px 0" }} />

          {/* Picture in Picture & Native Fullscreen */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <button
              type="button"
              className="mobile-sheet-btn"
              onClick={() => {
                setIsCtlOverflowOpen(false);
                handleTogglePiP();
              }}
            >
              <span>Picture-in-Picture</span>
            </button>

            {videoRef.current && (videoRef.current as any).webkitEnterFullscreen && (
              <button
                type="button"
                className="mobile-sheet-btn"
                onClick={() => {
                  setIsCtlOverflowOpen(false);
                  try {
                    (videoRef.current as any).webkitEnterFullscreen();
                  } catch {
                    setIsPseudoFullscreen(true);
                  }
                }}
              >
                <span>Native iOS Video Player (Note: loses custom overlays)</span>
              </button>
            )}
          </div>
        </div>
      </BottomSheet>

      {/* Subtitle Settings BottomSheet (Max 55% so subtitle remains visible above) */}
      <BottomSheet
        isOpen={isSubSettingsOpen}
        onClose={() => setIsSubSettingsOpen(false)}
        title="Subtitle Settings"
        maxHeight="55dvh"
      >
        <SubtitleSettingsPanel
          settings={subSettings}
          onChange={(updated) => {
            setSubSettings(updated);
            saveSubtitleSettings(updated);
          }}
          onBack={() => setIsSubSettingsOpen(false)}
          onClose={() => setIsSubSettingsOpen(false)}
        />
      </BottomSheet>

      {/* Settings Modal */}
      <SettingsModal
        room={room}
        isOpen={isSettingsModalOpen}
        isHost={isHost}
        onClose={() => setIsSettingsModalOpen(false)}
        onUpdateSettings={handleUpdateSettings}
        onUpdateTitle={handleUpdateTitle}
        onEndRoom={handleEndRoom}
      />

      {/* Participant Host Actions BottomSheet */}
      <BottomSheet
        isOpen={!!selectedParticipantForMenu}
        onClose={() => setSelectedParticipantForMenu(null)}
        title={selectedParticipantForMenu ? `Manage ${selectedParticipantForMenu.displayName}` : "Participant"}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            type="button"
            className="mobile-sheet-btn"
            onClick={() => {
              showToast(`${selectedParticipantForMenu?.displayName} marked as co-host`);
              setSelectedParticipantForMenu(null);
            }}
          >
            <span>Make Co-Host</span>
          </button>

          <button
            type="button"
            className="mobile-sheet-btn"
            onClick={() => {
              showToast(`Host privileges transferred to ${selectedParticipantForMenu?.displayName}`);
              setSelectedParticipantForMenu(null);
            }}
          >
            <span>Make Host</span>
          </button>

          <hr style={{ border: 0, borderTop: "1px solid rgba(255, 255, 255, 0.1)", margin: "4px 0" }} />

          <button
            type="button"
            className="mobile-sheet-btn destructive"
            onClick={() => {
              if (selectedParticipantForMenu) {
                handleKickParticipant(selectedParticipantForMenu.id);
                showToast(`${selectedParticipantForMenu.displayName} removed`);
                setSelectedParticipantForMenu(null);
              }
            }}
          >
            <span>Kick from Room</span>
          </button>

          <button
            type="button"
            className="mobile-sheet-btn destructive"
            onClick={() => {
              if (selectedParticipantForMenu) {
                handleKickParticipant(selectedParticipantForMenu.id);
                showToast(`${selectedParticipantForMenu.displayName} banned`);
                setSelectedParticipantForMenu(null);
              }
            }}
          >
            <span>Ban from Room</span>
          </button>
        </div>
      </BottomSheet>

      {/* Floating Button for Landscape Slide-over Drawer (Only on landscape phones) */}
      {isLandscapePhone && (
        <button
          type="button"
          className="landscape-drawer-toggle"
          aria-label="Toggle chat & video panel"
          onClick={() => setIsLandscapeDrawerOpen((prev) => !prev)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </button>
      )}

      <WebRTCDebugPanel />
    </div>
  );
};
