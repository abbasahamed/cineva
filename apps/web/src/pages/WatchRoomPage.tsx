import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useSyncWatch, ConnectionStatus } from "../hooks/useSyncWatch.js";
import { MediaUploadModal } from "../components/MediaUploadModal.js";
import { DebugPanel } from "../components/DebugPanel.js";
import { useToast } from "../components/Toast.js";
import { RefreshCw, AlertCircle } from "lucide-react";
import {
  VideoProvider,
  useVideoControls,
  useVideoPeers,
  VideoTile,
  WebRTCDebugPanel,
} from "../features/video/index.js";
import { getPublicUrl } from "../services/api.js";

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
        errorMessage || "Room cancelled: The host has left the room. This screening has ended. Returning to Home...",
        "error"
      );
      const timer = setTimeout(() => {
        navigate("/", { replace: true });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [connectionStatus, errorMessage, navigate, showGlobalToast]);

  if (connectionStatus === "ended" || (connectionStatus === "error" && errorMessage)) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        <div className="amb" aria-hidden="true"></div>
        <div className="grain" aria-hidden="true"></div>
        <div className="relative z-10 flex flex-col items-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mb-5 text-rose-400">
            <AlertCircle className="w-7 h-7 animate-pulse" />
          </div>
          <h2 className="text-xl font-extrabold text-white mb-2">Room Cancelled</h2>
          <p className="text-slate-400 text-xs mb-4 leading-relaxed">
            {errorMessage || "The host has left the room. This screening has ended."}
          </p>
          <div className="text-white text-xs font-semibold flex items-center gap-2">
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

  const { isCameraOn, isMuted, isConnecting, toggleCamera, toggleMute } = useVideoControls();
  const { cameraPeers, currentParticipantId, currentDisplayName, getStream } = useVideoPeers();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "participants">("chat");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [floatingReactions, setFloatingReactions] = useState<FloatingEmoji[]>([]);
  const [inviteUrl, setInviteUrl] = useState("");

  const [volume, setVolume] = useState(80);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [bufferPercent, setBufferPercent] = useState(0);
  const [activeMenu, setActiveMenu] = useState<"audio" | "subs" | "speed" | "zoom" | "react" | null>(null);
  const [menuLeft, setMenuLeft] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(0);
  const [isIdle, setIsIdle] = useState(false);

  // Real HTMLMediaElement state tracking
  const [realVideoPaused, setRealVideoPaused] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);

  useEffect(() => {
    if (needsUserGesture) {
      setIsAutoplayBlocked(true);
    }
  }, [needsUserGesture]);

  const mediaUrl = room?.media && room.media.status === "ready" && room.media.url ? room.media.url : undefined;
  const isMediaProcessing = room?.media && (room.media.status === "processing" || room.media.status === "uploading");
  const isMediaFailed = room?.media && (room.media.status === "failed" || (videoError !== null && !mediaUrl));

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (mediaUrl) {
      if (el.src !== mediaUrl && !el.src.endsWith(mediaUrl)) {
        el.src = mediaUrl;
        el.load();
      }
    } else {
      el.removeAttribute("src");
      el.load();
    }
  }, [mediaUrl, videoRef]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onPlay = () => setRealVideoPaused(false);
    const onPause = () => setRealVideoPaused(true);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => {
      setIsBuffering(false);
      setRealVideoPaused(false);
      setIsAutoplayBlocked(false);
    };
    const onCanPlay = () => setIsBuffering(false);
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

  const [audioTracks, setAudioTracks] = useState<string[]>(["Track 1 (Default)"]);
  const [selectedAudioIdx, setSelectedAudioIdx] = useState(0);
  const [subTracks, setSubTracks] = useState<string[]>([]);
  const [selectedSubIdx, setSelectedSubIdx] = useState<number>(-1);

  const [scrubTip, setScrubTip] = useState<{ text: string; left: number }>({ text: "0:00", left: 0 });
  const [isScrubbing, setIsScrubbing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const subFileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const seekRef = useRef<HTMLDivElement>(null);
  const ctlRef = useRef<HTMLDivElement>(null);
  const msgStreamRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const mediaInfo = formatMediaInfo(room?.media);

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

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume / 100;
      videoRef.current.muted = isVideoMuted;
    }
  }, [volume, isVideoMuted, videoRef]);

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
    const el = videoRef.current;
    if (!el) return;
    const aTracks: string[] = [];
    if ((el as any).audioTracks && (el as any).audioTracks.length > 0) {
      const list = (el as any).audioTracks;
      for (let i = 0; i < list.length; i++) {
        aTracks.push(list[i].label || list[i].language || `Track ${i + 1}`);
      }
    } else {
      aTracks.push("English 5.1 / Stereo");
    }
    setAudioTracks(aTracks);

    const sTracks: string[] = [];
    if (el.textTracks && el.textTracks.length > 0) {
      for (let i = 0; i < el.textTracks.length; i++) {
        sTracks.push(el.textTracks[i].label || el.textTracks[i].language || `Track ${i + 1}`);
      }
    }
    setSubTracks(sTracks);
  }, [videoRef, room?.media]);

  const wakeControls = useCallback(() => {
    setIsIdle(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (playback.isPlaying && !activeMenu) {
      idleTimerRef.current = setTimeout(() => {
        setIsIdle(true);
      }, 3000);
    }
  }, [playback.isPlaying, activeMenu]);

  useEffect(() => {
    wakeControls();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [playback.isPlaying, activeMenu, wakeControls]);

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

    return () => clearInterval(interval);
  }, [videoRef, mediaUrl]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA/.test((document.activeElement as HTMLElement)?.tagName || "")) return;
      if (e.key === " ") {
        e.preventDefault();
        playback.isPlaying ? handlePause() : handlePlay();
        wakeControls();
      } else if (e.key === "f" || e.key === "F") {
        handleToggleFullscreen();
      } else if (e.key === "m" || e.key === "M") {
        setIsVideoMuted((prev) => !prev);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const t = Math.min(playback.duration || 0, playback.currentTime + 10);
        handleSeek(t);
        wakeControls();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const t = Math.max(0, playback.currentTime - 10);
        handleSeek(t);
        wakeControls();
      } else if (e.key === "Escape" && activeMenu) {
        setActiveMenu(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playback.isPlaying, playback.duration, playback.currentTime, activeMenu, handlePlay, handlePause, handleSeek, wakeControls]);

  const handleCopyInvite = async () => {
    const url = inviteUrl || `${window.location.origin}/join/${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setIsInviteOpen(false);
    showToast("Invite link copied");
  };

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

  const isActuallyPlaying = !realVideoPaused && (!videoRef.current || !videoRef.current.paused) && playback.isPlaying;
  const curTime = isActuallyPlaying || videoCurrentTime > 0 ? (videoCurrentTime || playback.currentTime) : playback.currentTime;
  const rawDuration = videoDuration || playback.duration || 0;
  const totalDuration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;
  const scrubPercent = totalDuration > 0 && Number.isFinite(curTime) ? Math.min(100, Math.max(0, (curTime / totalDuration) * 100)) : 0;

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
    } catch {}
    const r = getScrubRatio(e.clientX);
    handleSeek(r * totalDuration);
    wakeControls();
  };

  const handleSeekMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = getScrubRatio(e.clientX);
    const time = r * totalDuration;
    setScrubTip({ text: fmtTime(time, totalDuration >= 3600), left: r * 100 });
    if (isScrubbing && canControl && totalDuration) {
      handleSeek(r * totalDuration);
    }
  };

  const handleSeekUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbing) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {}
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
      handleSeek(Math.max(0, curTime - 10));
      wakeControls();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (!canControl) {
        showToast("The host controls playback");
        return;
      }
      handleSeek(Math.min(totalDuration, curTime + 10));
      wakeControls();
    }
  };

  const handleMenuClick = (menu: "audio" | "subs" | "speed" | "zoom" | "react", e: React.MouseEvent<HTMLButtonElement>) => {
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

  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (stageRef.current?.requestFullscreen) {
      stageRef.current.requestFullscreen().catch(() => {});
    }
  };

  const handleLocalSubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let txt = String(reader.result || "").replace(/\r/g, "");
      if (!/^WEBVTT/.test(txt)) {
        txt = "WEBVTT\n\n" + txt.replace(/(\d+:\d+:\d+),(\d+)/g, "$1.$2");
      }
      const blob = new Blob([txt], { type: "text/vtt" });
      const trackUrl = URL.createObjectURL(blob);
      if (videoRef.current) {
        const trackEl = document.createElement("track");
        trackEl.kind = "subtitles";
        trackEl.label = file.name.replace(/\.[^.]+$/, "");
        trackEl.src = trackUrl;
        trackEl.default = true;
        videoRef.current.appendChild(trackEl);
        trackEl.addEventListener("load", () => {
          for (let i = 0; i < videoRef.current!.textTracks.length; i++) {
            videoRef.current!.textTracks[i].mode = "disabled";
          }
          trackEl.track.mode = "showing";
        });
      }
      handleUploadSubtitle({
        label: file.name.replace(/\.[^.]+$/, ""),
        srclang: "en",
        content: txt,
      });
      setSubTracks((prev) => [...prev, file.name.replace(/\.[^.]+$/, "")]);
      setSelectedSubIdx(subTracks.length);
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
      <header className="top gl">
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
        <span className="title" id="ttl">
          {room?.media ? mediaInfo.displayTitle : room?.name || "Friday movie night"}
        </span>
        {isHost && <span className="tag">Host</span>}
        <span className="sp"></span>

        <div style={{ position: "relative", display: "flex", gap: "8px", alignItems: "center" }}>
          <button type="button" className="b hs" id="inv" onClick={() => setIsInviteOpen(!isInviteOpen)}>
            <svg viewBox="0 0 24 24">
              <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
            </svg>
            <span>Invite</span>
          </button>

          <button
            type="button"
            className="b"
            id="cnt"
            aria-label="People"
            onClick={() => {
              setIsSidebarCollapsed(false);
              setActiveTab("participants");
            }}
          >
            <svg viewBox="0 0 24 24">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M3 20a6 6 0 0112 0M16 5a3.5 3.5 0 010 7M18 20a6 6 0 00-1.5-4" />
            </svg>
            <span id="n">{participants.length}</span>
          </button>

          <button
            type="button"
            className="b i"
            id="sb"
            aria-label="Show or hide sidebar"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          >
            <svg viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="16" rx="4" />
              <path d="M15 4v16" />
            </svg>
          </button>

          <button
            type="button"
            className="b i"
            id="leave"
            aria-label="Leave room"
            onClick={() => {
              handleLeaveRoom();
              navigate("/", { replace: true });
            }}
          >
            <svg viewBox="0 0 24 24">
              <path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4M15 8l4 4-4 4M19 12H9" />
            </svg>
          </button>

          {/* Invite Popover */}
          <div className={`pop gl ${isInviteOpen ? "o" : ""}`} id="pop">
            <h4>Invite friends</h4>
            <p>Anyone with this code can join the room.</p>
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
          </div>
        </div>
      </header>

      {/* ================= MAIN CONTENT ================= */}
      <div className={`main ${isSidebarCollapsed ? "hide" : ""}`} id="main">
        {/* Cinema Stage */}
        <section
          ref={stageRef}
          className={`stage ${isIdle ? "idle" : ""}`}
          id="stage"
          aria-label="Video"
          onPointerMove={wakeControls}
          onPointerDown={wakeControls}
          onDragOver={(e) => {
            e.preventDefault();
            stageRef.current?.classList.add("drag");
          }}
          onDragLeave={() => stageRef.current?.classList.remove("drag")}
          onDrop={(e) => {
            e.preventDefault();
            stageRef.current?.classList.remove("drag");
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              setIsUploadOpen(true);
            }
          }}
        >
          <video
            ref={videoRef as React.RefObject<HTMLVideoElement>}
            id="v"
            src={mediaUrl}
            playsInline
            crossOrigin="anonymous"
            style={{
              objectFit: zoom === 2 ? "fill" : "contain",
              transform: zoom === 1 ? "scale(1.34)" : undefined,
            }}
            onClick={() => (isActuallyPlaying ? handlePause() : handlePlay())}
          />
          <div className="scrim t"></div>
          <div className="scrim bt"></div>

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
              <p>Friends who join will wait here until it’s ready. You can also drop a file anywhere on this screen.</p>
              <div className="row">
                <button type="button" className="b p" id="add" onClick={() => setIsUploadOpen(true)}>
                  Choose a file
                </button>
                <button type="button" className="b" id="smp" onClick={handleMediaRetry}>
                  Try a sample
                </button>
              </div>
              <small>MKV, MP4, WebM and MOV</small>
            </div>
          ) : isMediaProcessing ? (
            <div className="empty" id="preparingState">
              <div className="ring gl">
                <RefreshCw className="w-8 h-8 animate-spin" style={{ color: "var(--accent, #6366f1)" }} />
              </div>
              <h1 style={{ fontSize: "22px", fontWeight: 600 }}>Preparing your movie…</h1>
              <p style={{ color: "var(--t2)", maxWidth: "26em", fontSize: "14px" }}>
                {room.media.stage || (isHost ? "Optimizing video format for zero-drift sync..." : "Host is preparing the movie...")}
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
              {/* Autoplay Blocked Overlay Prompt */}
              {isAutoplayBlocked && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(0,0,0,0.68)",
                    backdropFilter: "blur(6px)",
                    zIndex: 10,
                  }}
                >
                  <button
                    type="button"
                    className="b p"
                    style={{
                      height: "48px",
                      padding: "0 28px",
                      fontSize: "15px",
                      fontWeight: 600,
                      borderRadius: "99px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                    onClick={() => {
                      setIsAutoplayBlocked(false);
                      handleUserGestureStart();
                      if (videoRef.current) {
                        videoRef.current.muted = isVideoMuted;
                        videoRef.current.play().catch(() => {});
                      }
                      handlePlay();
                    }}
                  >
                    <svg viewBox="0 0 24 24" style={{ width: "20px", height: "20px", fill: "currentColor" }}>
                      <path d="M7 4.5v15L19.5 12z" />
                    </svg>
                    <span>Press play to start</span>
                  </button>
                  <p style={{ color: "var(--t2)", fontSize: "13px", marginTop: "12px" }}>
                    Browser autoplay policy requires an initial user interaction.
                  </p>
                </div>
              )}

              {/* Buffering Indicator */}
              {isBuffering && !isAutoplayBlocked && (
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
              <div className="ovl" id="ovl">
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
              <div ref={ctlRef} className="ctl gl" id="ctl" onClick={(e) => e.stopPropagation()}>
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
                    onClick={() => {
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
                    onClick={() => {
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
                    onClick={() => {
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
                      onClick={() => setIsVideoMuted(!isVideoMuted)}
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
                    data-m="speed"
                    aria-label="Speed"
                    aria-expanded={activeMenu === "speed"}
                    onClick={(e) => handleMenuClick("speed", e)}
                  >
                    <svg viewBox="0 0 24 24">
                      <circle cx="12" cy="13" r="8" />
                      <path d="M12 13l3-3M10 3h4" />
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

                  <button type="button" className="cb" id="pip" aria-label="Picture in picture" onClick={handleTogglePiP}>
                    <svg viewBox="0 0 24 24">
                      <rect x="3" y="5" width="18" height="14" rx="4" />
                      <rect x="12" y="11" width="6" height="5" rx="1.2" />
                    </svg>
                  </button>

                  <button type="button" className="cb" id="fs" aria-label="Fullscreen" onClick={handleToggleFullscreen}>
                    <svg viewBox="0 0 24 24">
                      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                    </svg>
                  </button>
                </div>

                {/* Popover Menu inside Player */}
                {activeMenu && (
                  <div
                    className="mn gl"
                    id="mn"
                    role="menu"
                    style={{ left: `${menuLeft}px` }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {activeMenu === "audio" && (
                      <>
                        <h4>Audio</h4>
                        <small>Only you hear this choice.</small>
                        {audioTracks.map((tr, i) => (
                          <button
                            key={i}
                            role="menuitemradio"
                            aria-checked={selectedAudioIdx === i}
                            onClick={() => {
                              setSelectedAudioIdx(i);
                              showToast(`Audio changed`);
                              setActiveMenu(null);
                            }}
                          >
                            {tr}
                            {selectedAudioIdx === i && (
                              <svg className="ck" viewBox="0 0 24 24">
                                <path d="M5 12.5l4.5 4.5L19 7.5" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </>
                    )}

                    {activeMenu === "subs" && (
                      <>
                        <h4>Subtitles</h4>
                        <small>Only you see this choice.</small>
                        <button
                          role="menuitemradio"
                          aria-checked={selectedSubIdx === -1}
                          onClick={() => {
                            setSelectedSubIdx(-1);
                            if (videoRef.current) {
                              for (let i = 0; i < videoRef.current.textTracks.length; i++) {
                                videoRef.current.textTracks[i].mode = "disabled";
                              }
                            }
                            showToast("Subtitles off");
                            setActiveMenu(null);
                          }}
                        >
                          Off
                          {selectedSubIdx === -1 && (
                            <svg className="ck" viewBox="0 0 24 24">
                              <path d="M5 12.5l4.5 4.5L19 7.5" />
                            </svg>
                          )}
                        </button>
                        {subTracks.map((st, i) => (
                          <button
                            key={i}
                            role="menuitemradio"
                            aria-checked={selectedSubIdx === i}
                            onClick={() => {
                              setSelectedSubIdx(i);
                              if (videoRef.current) {
                                for (let j = 0; j < videoRef.current.textTracks.length; j++) {
                                  videoRef.current.textTracks[j].mode = j === i ? "showing" : "disabled";
                                }
                              }
                              showToast("Subtitles on");
                              setActiveMenu(null);
                            }}
                          >
                            {st}
                            {selectedSubIdx === i && (
                              <svg className="ck" viewBox="0 0 24 24">
                                <path d="M5 12.5l4.5 4.5L19 7.5" />
                              </svg>
                            )}
                          </button>
                        ))}
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
                      </>
                    )}

                    {activeMenu === "speed" && (
                      <>
                        <h4>Speed</h4>
                        {SPEEDS.map((v) => (
                          <button
                            key={v}
                            role="menuitemradio"
                            aria-checked={speed === v}
                            onClick={() => {
                              setSpeed(v);
                              if (videoRef.current) videoRef.current.playbackRate = v;
                              showToast(`Speed ${v === 1 ? "normal" : `${v}×`}`);
                              setActiveMenu(null);
                            }}
                          >
                            {v === 1 ? "Normal" : `${v}×`}
                            {speed === v && (
                              <svg className="ck" viewBox="0 0 24 24">
                                <path d="M5 12.5l4.5 4.5L19 7.5" />
                              </svg>
                            )}
                          </button>
                        ))}
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
                              burstReactions(em);
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

        {/* Sidebar */}
        <aside className="side gl" aria-label="Call, chat and people">
          {/* Video Call Card */}
          <div className="call">
            <div className="rh">
              <h3>Video call</h3>
              <span className="live">
                <i></i>
                <span id="inc">{participants.length} in the call</span>
              </span>
            </div>

            <div className="grid" id="grid">
              {/* Local User Tile */}
              <div className={`tile me ${isCameraOn ? "cam" : ""}`} id="t-me">
                {isCameraOn ? (
                  <VideoTile
                    participantId={currentParticipantId}
                    displayName={currentDisplayName}
                    stream={getStream(currentParticipantId || "", true)}
                    isLocal={true}
                    isMuted={isMuted}
                    isCameraOff={false}
                    getStream={getStream}
                  />
                ) : (
                  <>
                    <video muted playsInline autoPlay style={{ opacity: 0 }} />
                    <div className="ph" style={{ "--g": "linear-gradient(145deg,#f1d9a0,#d9a85c)" } as any}>
                      <i>{(displayName || "A").charAt(0).toUpperCase()}</i>
                    </div>
                  </>
                )}
                {isHost && <span className="hb">Host</span>}
                <div className="meta">
                  <span className="nm">{displayName || "You"}</span>
                  {isMuted && (
                    <span className="mi">
                      <svg viewBox="0 0 24 24">
                        <rect x="9" y="3" width="6" height="11" rx="3" />
                        <path d="M5 11a7 7 0 0014 0M12 18v3M4 4l16 16" />
                      </svg>
                    </span>
                  )}
                </div>
              </div>

              {/* Real Remote Participants */}
              {participants
                .filter((p) => p.sessionId !== sessionId)
                .map((p) => {
                  const peer = cameraPeers.find((cp) => cp.participantId === p.id);
                  const hasCamera = peer && !peer.isCameraOff && peer.stream;
                  return (
                    <div key={p.id} className={`tile peer ${hasCamera ? "cam" : ""}`}>
                      {hasCamera ? (
                        <VideoTile
                          participantId={p.id}
                          displayName={p.displayName}
                          stream={peer.stream || getStream(p.id, false)}
                          isLocal={false}
                          isMuted={peer.isMuted}
                          isCameraOff={false}
                          connectionState={peer.connectionState}
                          getStream={getStream}
                        />
                      ) : (
                        <>
                          <video muted playsInline autoPlay style={{ opacity: 0 }} />
                          <div className="ph" style={{ "--g": "linear-gradient(145deg,#b8e0f2,#6ba7c6)" } as any}>
                            <i>{(p.displayName || "A").charAt(0).toUpperCase()}</i>
                          </div>
                        </>
                      )}
                      {p.isHost && <span className="hb">Host</span>}
                      <div className="meta">
                        <span className="nm">{p.displayName}</span>
                        {peer?.isMuted ? (
                          <span className="mi">
                            <svg viewBox="0 0 24 24">
                              <rect x="9" y="3" width="6" height="11" rx="3" />
                              <path d="M5 11a7 7 0 0014 0M12 18v3M4 4l16 16" />
                            </svg>
                          </span>
                        ) : (
                          <span className="qb mid">
                            <i></i>
                            <i></i>
                            <i></i>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

              {/* Invite Tile */}
              <button
                type="button"
                className="tile add"
                id="inv2"
                aria-label="Invite someone"
                onClick={() => setIsInviteOpen(true)}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>Invite</span>
              </button>
            </div>

            {/* Bottom Dock for Audio/Video */}
            <div className="dock">
              <button
                type="button"
                className={`b ${isMuted ? "off" : ""}`}
                id="dMic"
                onClick={toggleMute}
              >
                {isMuted ? (
                  <svg viewBox="0 0 24 24" id="dMicI">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0014 0M12 18v3M4 4l16 16" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" id="dMicI">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0014 0M12 18v3" />
                  </svg>
                )}
                <span>{isMuted ? "Muted" : "Mic"}</span>
              </button>

              <button
                type="button"
                className={`b ${!isCameraOn ? "off" : ""}`}
                id="dCam"
                onClick={toggleCamera}
                disabled={isConnecting}
              >
                {!isCameraOn ? (
                  <svg viewBox="0 0 24 24" id="dCamI">
                    <rect x="3" y="6" width="12" height="12" rx="3.5" />
                    <path d="M15 10.5l5.5-3v9l-5.5-3M4 4l16 16" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" id="dCamI">
                    <rect x="3" y="6" width="12" height="12" rx="3.5" />
                    <path d="M15 10.5l5.5-3v9l-5.5-3" />
                  </svg>
                )}
                <span>Camera</span>
              </button>
            </div>
          </div>

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

          {/* Chat Pane */}
          {activeTab === "chat" ? (
            <div className="pane" id="pc">
              <div ref={msgStreamRef} className="msgs" id="ms">
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

              <form className="cmp" id="fm" onSubmit={handleChatSubmit}>
                <input
                  id="mi"
                  placeholder="Message"
                  autoComplete="off"
                  aria-label="Message"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <button type="submit" className="b p i" aria-label="Send">
                  <svg viewBox="0 0 24 24">
                    <path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" />
                  </svg>
                </button>
              </form>
            </div>
          ) : (
            /* People Pane */
            <div className="pane" id="pp2">
              {participants.map((p) => {
                const isMe = p.sessionId === sessionId;
                const initial = (p.displayName || "A").charAt(0).toUpperCase();
                return (
                  <div key={p.id} className="row">
                    <span className="av">
                      <i style={{ background: isMe ? "#f1d9a0" : "#b8e0f2" }}>{initial}</i>
                    </span>
                    <span>
                      {p.displayName} {isMe ? "(You)" : ""}
                    </span>
                    {p.isHost ? (
                      <span className="r">Host</span>
                    ) : isHost ? (
                      <button
                        type="button"
                        className="b"
                        style={{ marginLeft: "auto", height: "30px", fontSize: "12px" }}
                        onClick={() => handleKickParticipant(p.id)}
                      >
                        Remove
                      </button>
                    ) : (
                      <span className="r">Viewer</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </aside>
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
      <WebRTCDebugPanel />
    </div>
  );
};
