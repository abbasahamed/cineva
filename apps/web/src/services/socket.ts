import { io, Socket } from 'socket.io-client';
import {
  SOCKET_EVENTS,
  PlaybackState,
  RoomStateSnapshot,
  ParticipantInfo,
  ChatMessage,
  ClockSyncPong,
  calculateServerOffset,
  RoomInfo,
} from '@syncwatch/shared';

export class SocketService {
  private socket: Socket | null = null;
  private serverOffset: number = 0; // ms offset between client and server time
  private rtt: number = 0; // ms round-trip time
  private pingInterval: NodeJS.Timeout | null = null;

  public connect(url?: string): Socket {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    const socketUrl = url ||
      (import.meta.env.VITE_SOCKET_URL as string | undefined) ||
      (import.meta.env.VITE_API_URL as string | undefined) ||
      '/';

    this.socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      this.startClockSync();
    });

    this.socket.on(SOCKET_EVENTS.PONG, (data: ClockSyncPong) => {
      const clientReceiveTime = performance.now();
      const rtt = clientReceiveTime - data.clientTime;
      this.rtt = Math.round(rtt);

      // Calculate server clock offset
      // Date.now() on client corresponds to clientReceiveTime
      const clientWallClockAtSend = Date.now() - (clientReceiveTime - data.clientTime);
      this.serverOffset = calculateServerOffset(clientWallClockAtSend, data.serverTime, Date.now());
    });

    this.socket.on('disconnect', () => {
      this.stopClockSync();
    });

    return this.socket;
  }

  public getSocket(): Socket | null {
    return this.socket;
  }

  public getServerOffset(): number {
    return this.serverOffset;
  }

  public getRTT(): number {
    return this.rtt;
  }

  public getEstimatedServerTime(): number {
    return Date.now() + this.serverOffset;
  }

  private startClockSync() {
    this.stopClockSync();
    this.performPing();
    this.pingInterval = setInterval(() => {
      this.performPing();
    }, 2500);
  }

  private stopClockSync() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private performPing() {
    if (this.socket && this.socket.connected) {
      this.socket.emit(SOCKET_EVENTS.PING, {
        clientTime: performance.now(),
      });
    }
  }

  public joinRoom(roomCode: string, displayName: string, sessionId?: string) {
    this.socket?.emit(SOCKET_EVENTS.JOIN_ROOM, { roomCode, displayName, sessionId });
  }

  public emitPlay(position?: number, playbackRate?: number) {
    this.socket?.emit(SOCKET_EVENTS.PLAYBACK_PLAY, { position, playbackRate });
  }

  public emitPause(position?: number) {
    this.socket?.emit(SOCKET_EVENTS.PLAYBACK_PAUSE, { position });
  }

  public emitSeek(position: number) {
    this.socket?.emit(SOCKET_EVENTS.PLAYBACK_SEEK, { position });
  }

  public emitPlaybackRate(playbackRate: number) {
    this.socket?.emit(SOCKET_EVENTS.PLAYBACK_RATE, { playbackRate });
  }

  public emitChatMessage(message: string) {
    this.socket?.emit(SOCKET_EVENTS.CHAT_SEND, { message });
  }

  public emitUpdateSettings(settings: { allowGuestControl?: boolean }) {
    this.socket?.emit(SOCKET_EVENTS.ROOM_UPDATE_SETTINGS, settings);
  }

  public emitUpdateTitle(title: string) {
    this.socket?.emit(SOCKET_EVENTS.ROOM_UPDATE_TITLE, { title });
  }

  public emitKickParticipant(participantId: string) {
    this.socket?.emit(SOCKET_EVENTS.ROOM_KICK_PARTICIPANT, { participantId });
  }

  public emitEndRoom() {
    this.socket?.emit(SOCKET_EVENTS.ROOM_END);
  }

  // WebRTC Video Calling Signaling Emitters
  public emitVideoJoin() {
    this.socket?.emit(SOCKET_EVENTS.VIDEO_JOIN);
  }

  public emitVideoLeave() {
    this.socket?.emit(SOCKET_EVENTS.VIDEO_LEAVE);
  }

  public emitVideoOffer(payload: { targetParticipantId: string; sdp: { type: 'offer' | 'answer' | 'pranswer' | 'rollback'; sdp: string } }) {
    this.socket?.emit(SOCKET_EVENTS.VIDEO_OFFER, payload);
  }

  public emitVideoAnswer(payload: { targetParticipantId: string; sdp: { type: 'offer' | 'answer' | 'pranswer' | 'rollback'; sdp: string } }) {
    this.socket?.emit(SOCKET_EVENTS.VIDEO_ANSWER, payload);
  }

  public emitVideoIceCandidate(payload: { targetParticipantId: string; candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null } }) {
    this.socket?.emit(SOCKET_EVENTS.VIDEO_ICE_CANDIDATE, payload);
  }

  public emitVideoStateUpdate(payload: { isMuted?: boolean; isCameraOff?: boolean }) {
    this.socket?.emit(SOCKET_EVENTS.VIDEO_STATE_UPDATE, payload);
  }

  public disconnect() {
    this.stopClockSync();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
