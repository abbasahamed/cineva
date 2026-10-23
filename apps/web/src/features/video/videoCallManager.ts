import { socketService } from '../../services/socket.js';
import {
  RTCSessionDescriptionInitLike,
  RTCIceCandidateInitLike,
} from '@cineva/shared';
import { getIceServers } from './iceConfig.js';

export interface VideoCallManagerCallbacks {
  onRemoteStream: (participantId: string, stream: MediaStream) => void;
  onRemotePeerLeft: (participantId: string) => void;
  onConnectionStateChange: (participantId: string, state: RTCPeerConnectionState) => void;
  onError: (error: string) => void;
}

export interface PeerNegotiationState {
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  lastIceRestartTime: number;
}

export class VideoCallManager {
  private localStream: MediaStream | null = null;
  private remoteStreams: Map<string, MediaStream> = new Map();
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInitLike[]> = new Map();
  private negotiationStates: Map<string, PeerNegotiationState> = new Map();
  private callbacks: VideoCallManagerCallbacks;
  private localParticipantId: string = '';
  private isMuted: boolean = false;
  private isCameraOff: boolean = false;

  constructor(callbacks: VideoCallManagerCallbacks, localParticipantId: string = '') {
    this.callbacks = callbacks;
    this.localParticipantId = localParticipantId;
  }

  public setLocalParticipantId(id: string) {
    this.localParticipantId = id;
  }

  public static isSupported(): boolean {
    return Boolean(
      typeof window !== 'undefined' &&
      window.RTCPeerConnection &&
      navigator?.mediaDevices?.getUserMedia
    );
  }

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getStream(participantId: string, isLocal?: boolean): MediaStream | null {
    if (isLocal) {
      return this.localStream;
    }
    return this.remoteStreams.get(participantId) || null;
  }

  public async acquireLocalMedia(): Promise<MediaStream> {
    return this.enableCamera();
  }

  public async enableCamera(): Promise<MediaStream> {
    if (!VideoCallManager.isSupported()) {
      throw new Error('WebRTC is not supported in this browser.');
    }

    try {
      // Optimal webcam constraints: 1280x720 max, 30fps max
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: !this.localStream?.getAudioTracks().length
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const newVideoTrack = stream.getVideoTracks()[0];
      const newAudioTrack = stream.getAudioTracks()[0];

      const local: MediaStream = this.localStream || (typeof MediaStream !== 'undefined' ? new MediaStream() : (stream as any));
      this.localStream = local;

      if (newAudioTrack && !local.getAudioTracks().length) {
        newAudioTrack.enabled = !this.isMuted;
        local.addTrack(newAudioTrack);
      }

      // Stop and remove old video tracks
      local.getVideoTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
        local.removeTrack(track);
      });

      if (newVideoTrack) {
        local.addTrack(newVideoTrack);
      }

      this.isCameraOff = false;

      // Update video sender on all active peer connections without teardown
      for (const pc of this.peerConnections.values()) {
        if (!newVideoTrack) continue;
        const videoTransceiver = typeof pc.getTransceivers === 'function'
          ? pc.getTransceivers().find(
              (t) => t.sender.track?.kind === 'video' || t.receiver.track?.kind === 'video'
            )
          : null;
        if (videoTransceiver && videoTransceiver.sender) {
          try {
            await videoTransceiver.sender.replaceTrack(newVideoTrack);
          } catch {
            pc.addTrack(newVideoTrack, local);
          }
          this.applySenderBitrate(videoTransceiver.sender);
        } else {
          const videoSender = typeof pc.getSenders === 'function'
            ? pc.getSenders().find((s) => s.track?.kind === 'video')
            : null;
          if (videoSender) {
            try {
              await videoSender.replaceTrack(newVideoTrack);
            } catch {
              pc.addTrack(newVideoTrack, local);
            }
            this.applySenderBitrate(videoSender);
          } else {
            const sender = pc.addTrack(newVideoTrack, local);
            this.applySenderBitrate(sender);
          }
        }
      }

      return local;
    } catch (err: any) {
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        // Fallback to audio only if camera hardware is missing
        try {
          const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          this.localStream = audioOnlyStream;
          this.isCameraOff = true;
          return audioOnlyStream;
        } catch {}
      }
      throw err;
    }
  }

  public disableCamera(): void {
    this.isCameraOff = true;
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
        this.localStream!.removeTrack(track);
      });
    }

    for (const pc of this.peerConnections.values()) {
      const videoTransceiver = typeof pc.getTransceivers === 'function'
        ? pc.getTransceivers().find(
            (t) => t.sender.track?.kind === 'video' || t.receiver.track?.kind === 'video'
          )
        : null;
      if (videoTransceiver?.sender) {
        videoTransceiver.sender.replaceTrack(null).catch(() => {});
      } else if (typeof pc.getSenders === 'function') {
        const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(null).catch(() => {});
        }
      }
    }
  }

  public async enableMic(): Promise<void> {
    this.isMuted = false;
    if (!this.localStream || !this.localStream.getAudioTracks().length) {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const audioTrack = audioStream.getAudioTracks()[0];
      if (audioTrack) {
        const local: MediaStream = this.localStream || (typeof MediaStream !== 'undefined' ? new MediaStream() : (audioStream as any));
        this.localStream = local;
        local.addTrack(audioTrack);
        for (const pc of this.peerConnections.values()) {
          const audioTransceiver = pc.getTransceivers().find(
            (t) => t.sender.track?.kind === 'audio' || t.receiver.track?.kind === 'audio'
          );
          if (audioTransceiver && audioTransceiver.sender) {
            audioTransceiver.sender.replaceTrack(audioTrack).catch(() => {});
          } else {
            pc.addTrack(audioTrack, local);
          }
        }
      }
    } else {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
    }
  }

  public disableMic(): void {
    this.isMuted = true;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }
    for (const pc of this.peerConnections.values()) {
      const audioTransceiver = pc.getTransceivers().find(
        (t) => t.sender.track?.kind === 'audio' || t.receiver.track?.kind === 'audio'
      );
      if (audioTransceiver?.sender?.track) {
        audioTransceiver.sender.track.enabled = false;
      }
    }
  }

  public setMute(muted: boolean): boolean {
    if (muted) {
      this.disableMic();
    } else {
      this.enableMic().catch(() => {});
    }
    return this.isMuted;
  }

  public setCameraOff(cameraOff: boolean): boolean {
    if (cameraOff) {
      this.disableCamera();
    } else {
      this.enableCamera().catch(() => {});
    }
    return this.isCameraOff;
  }

  public isPolite(targetParticipantId: string): boolean {
    // Deterministic tie-breaking using participant ID string comparison
    return (this.localParticipantId || '') > targetParticipantId;
  }

  public getPeerNegotiationState(participantId: string): PeerNegotiationState {
    let state = this.negotiationStates.get(participantId);
    if (!state) {
      state = {
        makingOffer: false,
        ignoreOffer: false,
        isSettingRemoteAnswerPending: false,
        lastIceRestartTime: 0,
      };
      this.negotiationStates.set(participantId, state);
    }
    return state;
  }

  public getPeerDebugId(targetParticipantId: string): string {
    return `PC-${this.localParticipantId || 'anon'}-${targetParticipantId}`;
  }

  public async initiateConnectionToPeer(targetParticipantId: string): Promise<void> {
    const peerDebugId = this.getPeerDebugId(targetParticipantId);
    const state = this.getPeerNegotiationState(targetParticipantId);
    const pc = this.getOrCreatePeerConnection(targetParticipantId);

    if (state.makingOffer || pc.signalingState !== 'stable') {
      console.log('[WebRTC DIAG] OFFER_SKIPPED_BUSY', {
        peerDebugId,
        makingOffer: state.makingOffer,
        signalingState: pc.signalingState,
      });
      return;
    }

    try {
      state.makingOffer = true;
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      console.log('[WebRTC DIAG] OFFER_CREATED', {
        peerDebugId,
        localParticipantId: this.localParticipantId,
        remoteParticipantId: targetParticipantId,
        direction: 'outbound',
        timestamp: Date.now(),
        signalingState: pc.signalingState,
        iceConnectionState: pc.iceConnectionState,
        connectionState: pc.connectionState,
      });

      if (pc.signalingState !== 'stable') {
        return;
      }

      await pc.setLocalDescription(offer);

      if (pc.localDescription) {
        console.log('[WebRTC DIAG] OFFER_SENT', {
          peerDebugId,
          localParticipantId: this.localParticipantId,
          remoteParticipantId: targetParticipantId,
          direction: 'outbound',
          timestamp: Date.now(),
          signalingState: pc.signalingState,
          iceConnectionState: pc.iceConnectionState,
          connectionState: pc.connectionState,
        });
        socketService.emitVideoOffer({
          targetParticipantId,
          sdp: {
            type: pc.localDescription.type,
            sdp: pc.localDescription.sdp,
          },
        });
      }
    } catch (err: any) {
      this.callbacks.onError(`Failed to create connection offer: ${err.message}`);
    } finally {
      state.makingOffer = false;
    }
  }

  public async handleIncomingOffer(
    fromParticipantId: string,
    sdp: RTCSessionDescriptionInitLike
  ): Promise<void> {
    const peerDebugId = this.getPeerDebugId(fromParticipantId);
    const state = this.getPeerNegotiationState(fromParticipantId);
    const pc = this.getOrCreatePeerConnection(fromParticipantId, false);
    const isPolite = this.isPolite(fromParticipantId);

    console.log('[WebRTC DIAG] OFFER_RECEIVED', {
      peerDebugId,
      localParticipantId: this.localParticipantId,
      remoteParticipantId: fromParticipantId,
      direction: 'inbound',
      timestamp: Date.now(),
      signalingState: pc.signalingState,
      iceConnectionState: pc.iceConnectionState,
      connectionState: pc.connectionState,
    });

    const offerCollision = state.makingOffer || pc.signalingState !== 'stable';
    if (offerCollision) {
      console.log('[WebRTC DIAG] OFFER_COLLISION', {
        peerDebugId,
        isPolite,
        makingOffer: state.makingOffer,
        signalingState: pc.signalingState,
      });
    }

    state.ignoreOffer = !isPolite && offerCollision;
    if (state.ignoreOffer) {
      console.log('[WebRTC DIAG] IGNORE_OFFER', { peerDebugId });
      return;
    }

    try {
      if (offerCollision && isPolite) {
        console.log('[WebRTC DIAG] ROLLBACK', { peerDebugId });
        try {
          await pc.setLocalDescription({ type: 'rollback' });
        } catch {}
      }

      await pc.setRemoteDescription(new RTCSessionDescription(sdp as RTCSessionDescriptionInit));
      console.log('[WebRTC DIAG] REMOTE_OFFER_SET', {
        peerDebugId,
        localParticipantId: this.localParticipantId,
        remoteParticipantId: fromParticipantId,
        signalingState: pc.signalingState,
      });

      this.ensureTransceiversAndTracks(pc, false);

      await this.flushPendingCandidates(fromParticipantId, pc);

      const answer = await pc.createAnswer();
      console.log('[WebRTC DIAG] ANSWER_CREATED', {
        peerDebugId,
        signalingState: pc.signalingState,
      });

      await pc.setLocalDescription(answer);

      if (pc.localDescription) {
        console.log('[WebRTC DIAG] ANSWER_SENT', {
          peerDebugId,
          localParticipantId: this.localParticipantId,
          remoteParticipantId: fromParticipantId,
          direction: 'outbound',
          timestamp: Date.now(),
          signalingState: pc.signalingState,
          iceConnectionState: pc.iceConnectionState,
          connectionState: pc.connectionState,
        });
        socketService.emitVideoAnswer({
          targetParticipantId: fromParticipantId,
          sdp: {
            type: pc.localDescription.type,
            sdp: pc.localDescription.sdp,
          },
        });
      }
    } catch (err: any) {
      this.callbacks.onError(`Failed to handle incoming offer: ${err.message}`);
    }
  }

  public async handleIncomingAnswer(
    fromParticipantId: string,
    sdp: RTCSessionDescriptionInitLike
  ): Promise<void> {
    const peerDebugId = this.getPeerDebugId(fromParticipantId);
    const state = this.getPeerNegotiationState(fromParticipantId);
    const pc = this.peerConnections.get(fromParticipantId);
    console.log('[WebRTC DIAG] ANSWER_RECEIVED', {
      peerDebugId,
      localParticipantId: this.localParticipantId,
      remoteParticipantId: fromParticipantId,
      direction: 'inbound',
      timestamp: Date.now(),
      signalingState: pc?.signalingState,
    });
    if (!pc) return;

    try {
      if (pc.signalingState === 'have-local-offer') {
        state.isSettingRemoteAnswerPending = true;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp as RTCSessionDescriptionInit));
        console.log('[WebRTC DIAG] REMOTE_ANSWER_SET', {
          peerDebugId,
          localParticipantId: this.localParticipantId,
          remoteParticipantId: fromParticipantId,
          signalingState: pc.signalingState,
        });
        state.isSettingRemoteAnswerPending = false;
        await this.flushPendingCandidates(fromParticipantId, pc);
      }
    } catch (err: any) {
      state.isSettingRemoteAnswerPending = false;
      this.callbacks.onError(`Failed to handle connection answer: ${err.message}`);
    }
  }

  public async handleIncomingIceCandidate(
    fromParticipantId: string,
    candidate: RTCIceCandidateInitLike
  ): Promise<void> {
    console.log('[WebRTC DIAG] ICE_CANDIDATE_RECEIVED', {
      localParticipantId: this.localParticipantId,
      remoteParticipantId: fromParticipantId,
    });

    const pc = this.peerConnections.get(fromParticipantId);

    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate as RTCIceCandidateInit));
        console.log('[WebRTC DIAG] ICE_CANDIDATE_ADDED', {
          localParticipantId: this.localParticipantId,
          remoteParticipantId: fromParticipantId,
        });
      } catch (err: any) {
        console.error('[WebRTC DIAG] ICE_CANDIDATE_ERROR', {
          errorName: err?.name || 'Error',
          errorMessage: err?.message || String(err),
        });
      }
    } else {
      console.log('[WebRTC DIAG] ICE_CANDIDATE_BUFFERED', {
        localParticipantId: this.localParticipantId,
        remoteParticipantId: fromParticipantId,
      });
      const pending = this.pendingCandidates.get(fromParticipantId) || [];
      pending.push(candidate);
      this.pendingCandidates.set(fromParticipantId, pending);
    }
  }

  public closePeerConnection(participantId: string) {
    const peerDebugId = this.getPeerDebugId(participantId);
    console.log('[WebRTC DIAG] PC_CLOSED', {
      peerDebugId,
      localParticipantId: this.localParticipantId,
      remoteParticipantId: participantId,
      timestamp: Date.now(),
    });
    const pc = this.peerConnections.get(participantId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
      this.peerConnections.delete(participantId);
    }
    this.negotiationStates.delete(participantId);
    this.remoteStreams.delete(participantId);
    this.pendingCandidates.delete(participantId);
    this.callbacks.onRemotePeerLeft(participantId);
  }

  public cleanup() {
    // 1. Stop all tracks in local media stream immediately (turns off camera/mic hardware LEDs)
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.localStream = null;
    }

    // 2. Close all active WebRTC peer connections
    for (const [participantId, pc] of this.peerConnections.entries()) {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.close();
      } catch {}
      this.callbacks.onRemotePeerLeft(participantId);
    }
    this.peerConnections.clear();
    this.negotiationStates.clear();
    this.remoteStreams.clear();
    this.pendingCandidates.clear();
  }

  private applyCodecPreferences(transceiver: RTCRtpTransceiver) {
    if (
      typeof RTCRtpReceiver !== 'undefined' &&
      typeof RTCRtpReceiver.getCapabilities === 'function' &&
      typeof transceiver.setCodecPreferences === 'function'
    ) {
      try {
        const capabilities = RTCRtpReceiver.getCapabilities('video');
        if (capabilities && capabilities.codecs && capabilities.codecs.length > 0) {
          const h264Codecs = capabilities.codecs.filter(
            (c) => c.mimeType.toLowerCase() === 'video/h264'
          );
          const otherCodecs = capabilities.codecs.filter(
            (c) => c.mimeType.toLowerCase() !== 'video/h264'
          );
          if (h264Codecs.length > 0) {
            transceiver.setCodecPreferences([...h264Codecs, ...otherCodecs]);
          } else {
            transceiver.setCodecPreferences(capabilities.codecs);
          }
        }
      } catch (err) {
        console.warn('[WebRTC] Failed to apply codec preferences:', err);
      }
    }
  }

  public setupTransceivers(pc: RTCPeerConnection) {
    this.ensureTransceiversAndTracks(pc, true);
  }

  public ensureTransceiversAndTracks(pc: RTCPeerConnection, isOfferer: boolean = true) {
    try {
      const activeTransceivers = pc.getTransceivers().filter((t) => !(t as any).stopped);

      let videoTransceiver = activeTransceivers
        .slice()
        .reverse()
        .find((t) => t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video');

      if (!videoTransceiver && isOfferer && typeof pc.addTransceiver === 'function') {
        videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
      }

      if (videoTransceiver) {
        if (videoTransceiver.direction !== 'sendrecv') {
          videoTransceiver.direction = 'sendrecv';
        }
        this.applyCodecPreferences(videoTransceiver);
        const localVideoTrack = this.localStream?.getVideoTracks()[0];
        if (localVideoTrack && videoTransceiver.sender) {
          videoTransceiver.sender.replaceTrack(localVideoTrack).catch(() => {});
          this.applySenderBitrate(videoTransceiver.sender);
        }
      }

      let audioTransceiver = activeTransceivers
        .slice()
        .reverse()
        .find((t) => t.receiver.track?.kind === 'audio' || t.sender.track?.kind === 'audio');

      if (!audioTransceiver && isOfferer && typeof pc.addTransceiver === 'function') {
        audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
      }

      if (audioTransceiver) {
        if (audioTransceiver.direction !== 'sendrecv') {
          audioTransceiver.direction = 'sendrecv';
        }
        const localAudioTrack = this.localStream?.getAudioTracks()[0];
        if (localAudioTrack && audioTransceiver.sender) {
          audioTransceiver.sender.replaceTrack(localAudioTrack).catch(() => {});
        }
      }
    } catch {}
  }

  private getOrCreatePeerConnection(targetParticipantId: string, isOfferer: boolean = true): RTCPeerConnection {
    let pc = this.peerConnections.get(targetParticipantId);
    if (pc) return pc;

    const peerDebugId = this.getPeerDebugId(targetParticipantId);
    const configuration: RTCConfiguration = {
      iceServers: getIceServers(),
      iceCandidatePoolSize: 2,
    };

    pc = new RTCPeerConnection(configuration);

    console.log('[WebRTC DIAG] PC_CREATED', {
      peerDebugId,
      localParticipantId: this.localParticipantId,
      remoteParticipantId: targetParticipantId,
      totalPCs: this.peerConnections.size + 1,
      timestamp: Date.now(),
    });

    // Setup transceivers and attach local media if offerer
    this.ensureTransceiversAndTracks(pc, isOfferer);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candStr = event.candidate.candidate || '';
        const match = candStr.match(/typ\s+(host|srflx|relay)/i);
        const candidateType = match ? match[1].toLowerCase() : 'host';

        console.log('[WebRTC DIAG] ICE_CANDIDATE_GENERATED', {
          localParticipantId: this.localParticipantId,
          remoteParticipantId: targetParticipantId,
          candidateType,
          timestamp: Date.now(),
        });

        console.log('[WebRTC DIAG] ICE_CANDIDATE_SENT', {
          localParticipantId: this.localParticipantId,
          remoteParticipantId: targetParticipantId,
        });

        socketService.emitVideoIceCandidate({
          targetParticipantId,
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            usernameFragment: event.candidate.usernameFragment,
          },
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC DIAG] REMOTE_TRACK_RECEIVED', {
        peerDebugId,
        localParticipantId: this.localParticipantId,
        remoteParticipantId: targetParticipantId,
        trackId: event.track?.id,
        kind: event.track?.kind,
        readyState: event.track?.readyState,
        enabled: event.track?.enabled,
        streamsLength: event.streams?.length || 0,
      });

      let stream: MediaStream | null = event.streams && event.streams[0] ? event.streams[0] : null;
      if (!stream) {
        let existing = this.remoteStreams.get(targetParticipantId);
        if (!existing) {
          existing =
            typeof MediaStream !== 'undefined'
              ? new MediaStream()
              : ({ getTracks: () => [event.track] } as any);
        }
        if (existing && typeof existing.addTrack === 'function' && !existing.getTracks().includes(event.track)) {
          existing.addTrack(event.track);
        }
        if (existing) {
          this.remoteStreams.set(targetParticipantId, existing);
          stream = existing;
        }
      } else {
        this.remoteStreams.set(targetParticipantId, stream);
      }

      const notifyStream = () => {
        if (stream) {
          console.log('[WebRTC DIAG] REMOTE_STREAM_READY', {
            peerDebugId,
            remoteParticipantId: targetParticipantId,
            streamId: stream.id,
            videoTracks: stream.getVideoTracks().length,
            audioTracks: stream.getAudioTracks().length,
          });
          this.callbacks.onRemoteStream(targetParticipantId, stream);
        }
      };

      notifyStream();

      if (event.track) {
        event.track.onunmute = () => {
          console.log('[WebRTC DIAG] TRACK_UNMUTED', {
            peerDebugId,
            remoteParticipantId: targetParticipantId,
            kind: event.track?.kind,
            trackId: event.track?.id,
          });
          notifyStream();
        };
      }
    };

    pc.onconnectionstatechange = () => {
      if (!pc) return;
      console.log('[WebRTC DIAG] CONNECTION_STATE_CHANGE', {
        peerDebugId,
        connectionState: pc.connectionState,
        signalingState: pc.signalingState,
        iceConnectionState: pc.iceConnectionState,
      });
      this.callbacks.onConnectionStateChange(targetParticipantId, pc.connectionState);

      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeerConnection(targetParticipantId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (!pc) return;
      console.log('[WebRTC DIAG] ICE_STATE', {
        localParticipantId: this.localParticipantId,
        remoteParticipantId: targetParticipantId,
        state: pc.iceConnectionState,
      });

      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        console.log('[WebRTC DIAG] ICE_CONNECTED', {
          peerDebugId,
          participantId: targetParticipantId,
          iceState: pc.iceConnectionState,
          connState: pc.connectionState,
        });
      } else if (pc.iceConnectionState === 'failed') {
        const state = this.getPeerNegotiationState(targetParticipantId);
        const now = Date.now();
        // Guard against ICE restart loops: throttle to minimum 5s interval
        if (now - state.lastIceRestartTime > 5000) {
          state.lastIceRestartTime = now;
          try {
            pc.restartIce();
          } catch {}
        }
      }
    };

    this.peerConnections.set(targetParticipantId, pc);
    return pc;
  }

  private applySenderBitrate(sender: RTCRtpSender) {
    if (sender.track?.kind === 'video') {
      try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = 750000; // 750 kbps max for webcam tile
        sender.setParameters(params).catch(() => {});
      } catch {}
    }
  }

  private async flushPendingCandidates(participantId: string, pc: RTCPeerConnection): Promise<void> {
    const candidates = this.pendingCandidates.get(participantId);
    if (!candidates || candidates.length === 0) return;

    for (const cand of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand as RTCIceCandidateInit));
        console.log('[WebRTC DIAG] ICE_CANDIDATE_ADDED', {
          localParticipantId: this.localParticipantId,
          remoteParticipantId: participantId,
        });
      } catch (err: any) {
        console.error('[WebRTC DIAG] ICE_CANDIDATE_ERROR', {
          errorName: err?.name || 'Error',
          errorMessage: err?.message || String(err),
        });
      }
    }
    this.pendingCandidates.delete(participantId);
  }

  public getPeerDiagnostics(targetParticipantId: string) {
    const pc = this.peerConnections.get(targetParticipantId);
    if (!pc) return null;
    const transceivers = pc.getTransceivers().map((t) => ({
      mid: t.mid,
      direction: t.direction,
      currentDirection: t.currentDirection,
      senderTrackKind: t.sender.track?.kind || null,
      senderTrackReadyState: t.sender.track?.readyState || null,
      receiverTrackKind: t.receiver.track?.kind || null,
      receiverTrackReadyState: t.receiver.track?.readyState || null,
    }));
    return {
      peerDebugId: this.getPeerDebugId(targetParticipantId),
      signalingState: pc.signalingState,
      iceConnectionState: pc.iceConnectionState,
      connectionState: pc.connectionState,
      sendersCount: pc.getSenders().length,
      receiversCount: pc.getReceivers().length,
      transceiverCount: transceivers.length,
      transceivers,
    };
  }

  public getAllPeerDiagnostics(): Record<string, any> {
    const res: Record<string, any> = {};
    for (const [id, _pc] of this.peerConnections.entries()) {
      res[id] = this.getPeerDiagnostics(id);
    }
    return res;
  }
}

