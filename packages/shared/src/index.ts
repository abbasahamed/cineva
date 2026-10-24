import { z } from 'zod';

// ==========================================
// 1. Core Synchronization Types & Constants
// ==========================================

export interface PlaybackState {
  isPlaying: boolean;
  position: number; // in seconds
  lastUpdatedAt: number; // server timestamp in milliseconds
  playbackRate: number;
  version: number;
}

export interface ClockSyncPing {
  clientTime: number; // client performance.now() or Date.now()
}

export interface ClockSyncPong {
  clientTime: number;
  serverTime: number; // server Date.now()
}

export interface DriftCorrectionConfig {
  minThreshold: number; // default: 0.25 seconds - below this, do nothing
  maxThreshold: number; // default: 1.00 second - between min and max, adjust playbackRate
  syncIntervalMs: number; // default: 500ms
  rateNudgeLow: number; // 0.95
  rateNudgeHigh: number; // 1.05
}

export const DEFAULT_DRIFT_CONFIG: DriftCorrectionConfig = {
  minThreshold: 0.25,
  maxThreshold: 1.0,
  syncIntervalMs: 500,
  rateNudgeLow: 0.95,
  rateNudgeHigh: 1.05,
};

// ==========================================
// 2. Room & Participant Data Types
// ==========================================

export interface ParticipantInfo {
  id: string;
  sessionId: string;
  displayName: string;
  isHost: boolean;
  joinedAt: string;
  lastSeenAt: string;
  isOnline: boolean;
}

export type MediaStatus = 'ready' | 'processing' | 'failed';

export interface VideoTrackInfo {
  index: number;
  codec: string;
  width?: number;
  height?: number;
  bitrate?: number;
  profile?: string;
}

export interface AudioTrackInfo {
  index: number;
  streamIndex: number;
  language: string;
  title: string;
  codec: string;
  channels: number;
  channelLayout?: string;
  bitrate?: number;
  isDefault: boolean;
}

export interface SubtitleTrackInfo {
  index: number;
  streamIndex: number;
  language: string;
  title: string;
  codec: string;
  isForced: boolean;
  isDefault: boolean;
  supported: boolean;
  unsupportedReason?: string;
  url?: string;
}

export interface TrackManifest {
  formatName: string;
  duration: number;
  sizeBytes: number;
  videoTracks: VideoTrackInfo[];
  audioTracks: AudioTrackInfo[];
  subtitleTracks: SubtitleTrackInfo[];
  hlsMasterUrl?: string;
  mp4FallbackUrl?: string;
  isHls: boolean;
}

export interface MediaInfo {
  id: string;
  roomId: string;
  title: string;
  filename: string;
  mimeType: string;
  size: number | string;
  duration?: number;
  url: string;
  status: MediaStatus;
  transcodeProgress?: number;
  transcodeError?: string;
  videoCodec?: string;
  audioCodec?: string;
  width?: number;
  height?: number;
  speed?: string;
  etaSeconds?: number;
  stage?: string;
  trackManifest?: TrackManifest;
  hlsMasterUrl?: string;
  mp4FallbackUrl?: string;
  isHls?: boolean;
  createdAt: string;
}

export interface MediaProgressPayload {
  mediaId?: string;
  roomId: string;
  status: MediaStatus;
  progress: number;
  speed?: string;
  etaSeconds?: number;
  stage?: string;
  error?: string;
  media?: MediaInfo;
}

export interface RoomSettings {
  allowGuestControl: boolean;
  maxParticipants: number;
}

export interface RoomInfo {
  id: string;
  roomCode: string;
  name: string;
  hostParticipantId: string;
  hostSessionId: string;
  media?: MediaInfo | null;
  settings: RoomSettings;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  status: 'active' | 'ended' | 'expired';
}

export interface RoomStateSnapshot {
  room: RoomInfo;
  participants: ParticipantInfo[];
  playback: PlaybackState;
  serverTimestamp: number;
  myParticipantId: string;
  isHost: boolean;
}

// ==========================================
// 3. Realtime Chat Types
// ==========================================

export interface ChatMessage {
  id: string;
  roomId: string;
  participantId: string;
  displayName: string;
  message: string;
  createdAt: string;
  isSystem?: boolean;
}

export type PlaybackActivityType = 'PLAY' | 'PAUSE' | 'SEEK';

export interface PlaybackActivityPayload {
  type: PlaybackActivityType;
  participantId: string;
  displayName: string;
  currentTime: number;
  message: string;
  timestamp: number;
}

// ==========================================
// 4. Socket Events Enum & Signatures
// ==========================================

export const SOCKET_EVENTS = {
  // Client -> Server
  JOIN_ROOM: 'room:join',
  LEAVE_ROOM: 'room:leave',
  PLAYBACK_PLAY: 'playback:play',
  PLAYBACK_PAUSE: 'playback:pause',
  PLAYBACK_SEEK: 'playback:seek',
  PLAYBACK_RATE: 'playback:rate',
  ROOM_UPDATE_SETTINGS: 'room:updateSettings',
  ROOM_UPDATE_TITLE: 'room:updateTitle',
  ROOM_KICK_PARTICIPANT: 'room:kickParticipant',
  ROOM_END: 'room:end',
  MEDIA_RETRY: 'media:retry',
  CHAT_SEND: 'chat:send',
  SUBTITLE_UPDATE: 'room:subtitleUpdate',
  PING: 'sync:ping',

  // Server -> Client
  ROOM_STATE: 'room:state',
  ROOM_NOT_FOUND: 'room:notFound',
  ROOM_ENDED: 'room:ended',
  ROOM_CANCELLED: 'room:cancelled',
  PARTICIPANT_JOINED: 'participant:joined',
  PARTICIPANT_LEFT: 'participant:left',
  PARTICIPANT_KICKED: 'participant:kicked',
  PLAYBACK_STATE: 'playback:state',
  PLAYBACK_ACTIVITY: 'playback:activity',
  CHAT_MESSAGE: 'chat:message',
  CHAT_HISTORY: 'chat:history',
  SUBTITLE_STATE: 'room:subtitleState',
  PONG: 'sync:pong',
  ERROR: 'system:error',
  MEDIA_PROCESSING: 'media:processing',
  MEDIA_PROGRESS: 'media:progress',
  MEDIA_READY: 'media:ready',
  MEDIA_FAILED: 'media:failed',
  RENDITIONS_UPDATED: 'media:renditions_updated',

  // Buffering-aware Sync Events (Part A3)
  BUFFERING_START: 'playback:buffering_start',
  BUFFERING_READY: 'playback:buffering_ready',
  BUFFERING_WAIT: 'playback:buffering_wait',
  BUFFERING_SKIP: 'playback:buffering_skip',

  // WebRTC Video Calling Signaling Events
  VIDEO_JOIN: 'video:join',
  VIDEO_LEAVE: 'video:leave',
  VIDEO_OFFER: 'video:offer',
  VIDEO_ANSWER: 'video:answer',
  VIDEO_ICE_CANDIDATE: 'video:iceCandidate',
  VIDEO_STATE_UPDATE: 'video:stateUpdate',
  VIDEO_PARTICIPANTS: 'video:participants',
  VIDEO_PEER_JOINED: 'video:peerJoined',
  VIDEO_PEER_LEFT: 'video:peerLeft',
  VIDEO_PEER_STATE: 'video:peerState',
} as const;

// ==========================================
// 5. WebRTC Video Calling Types
// ==========================================

export interface VideoParticipant {
  participantId: string;
  displayName: string;
  isMuted: boolean;
  isCameraOff: boolean;
  joinedAt: number;
}

export interface RTCSessionDescriptionInitLike {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp: string;
}

export interface RTCIceCandidateInitLike {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface VideoOfferPayload {
  targetParticipantId: string;
  sdp: RTCSessionDescriptionInitLike;
}

export interface VideoAnswerPayload {
  targetParticipantId: string;
  sdp: RTCSessionDescriptionInitLike;
}

export interface VideoIceCandidatePayload {
  targetParticipantId: string;
  candidate: RTCIceCandidateInitLike;
}

export interface VideoStateUpdatePayload {
  isMuted?: boolean;
  isCameraOff?: boolean;
}

export interface RelayedVideoOfferPayload {
  fromParticipantId: string;
  fromDisplayName: string;
  sdp: RTCSessionDescriptionInitLike;
}

export interface RelayedVideoAnswerPayload {
  fromParticipantId: string;
  sdp: RTCSessionDescriptionInitLike;
}

export interface RelayedVideoIceCandidatePayload {
  fromParticipantId: string;
  candidate: RTCIceCandidateInitLike;
}

export interface RelayedVideoStatePayload {
  participantId: string;
  isMuted?: boolean;
  isCameraOff?: boolean;
}

// ==========================================
// 6. Validation Schemas (Zod)
// ==========================================

export const CreateRoomSchema = z.object({
  displayName: z.string().trim().min(1, 'Display name is required').max(30, 'Display name too long'),
  roomName: z.string().trim().min(1, 'Room name is required').max(60, 'Room name too long'),
  mediaTitle: z.string().trim().max(100).optional(),
  allowGuestControl: z.boolean().default(true),
});

export type CreateRoomInput = z.input<typeof CreateRoomSchema>;

export const JoinRoomSchema = z.object({
  roomCode: z.string().trim().min(4, 'Invalid room code').max(10, 'Invalid room code').toUpperCase(),
  displayName: z.string().trim().min(1, 'Display name is required').max(30, 'Display name too long'),
  sessionId: z.string().optional(),
});

export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;

export const SendChatMessageSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(500, 'Message too long (max 500 chars)'),
});

export type SendChatMessageInput = z.infer<typeof SendChatMessageSchema>;

export const SeekPayloadSchema = z.object({
  position: z.number().min(0, 'Position cannot be negative'),
});

export const RatePayloadSchema = z.object({
  playbackRate: z.number().min(0.25).max(4.0),
});

export const UpdateMediaTitleSchema = z.object({
  title: z.string().trim().min(1).max(100),
});

export const VideoOfferSchema = z.object({
  targetParticipantId: z.string().min(1, 'Target participant is required').max(100),
  sdp: z.object({
    type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
    sdp: z.string().min(1, 'SDP is required').max(300000, 'SDP payload too large'),
  }),
});

export const VideoAnswerSchema = z.object({
  targetParticipantId: z.string().min(1, 'Target participant is required').max(100),
  sdp: z.object({
    type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
    sdp: z.string().min(1, 'SDP is required').max(300000, 'SDP payload too large'),
  }),
});

export const VideoIceCandidateSchema = z.object({
  targetParticipantId: z.string().min(1, 'Target participant is required').max(100),
  candidate: z.object({
    candidate: z.string().max(4000, 'Candidate string too large'),
    sdpMid: z.string().nullable().optional(),
    sdpMLineIndex: z.number().nullable().optional(),
    usernameFragment: z.string().nullable().optional(),
  }),
});

export const VideoStateUpdateSchema = z.object({
  isMuted: z.boolean().optional(),
  isCameraOff: z.boolean().optional(),
});

// ==========================================
// 6. Authoritative Synchronization Calculations
// ==========================================

/**
 * Computes current expected playback position based on server authoritative state and current server timestamp.
 */
export function calculateExpectedPosition(playback: PlaybackState, currentServerTime: number): number {
  if (!playback.isPlaying) {
    return playback.position;
  }
  const elapsedMs = Math.max(0, currentServerTime - playback.lastUpdatedAt);
  const elapsedSeconds = (elapsedMs / 1000) * playback.playbackRate;
  return playback.position + elapsedSeconds;
}

export function calculateServerOffset(requestClientTime: number, serverTime: number, responseClientTime: number): number {
  const roundTripTime = responseClientTime - requestClientTime;
  return serverTime - (requestClientTime + roundTripTime / 2);
}

/**
 * Format runtime seconds to HH:MM:SS or MM:SS format. Safely handles NaN, null, and non-finite values.
 */
export function formatTime(seconds: number): string {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds) || isNaN(seconds) || seconds < 0) {
    return '00:00';
  }
  const totalSeconds = Math.floor(seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ==========================================
// 7. Media & Upload Constants
// ==========================================

export const MAX_VIDEO_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5,368,709,120 bytes (5 GB in binary)
export const MAX_VIDEO_SIZE_MB = 5 * 1024; // 5120 MB
export const MAX_VIDEO_SIZE_LABEL = '5GB';

