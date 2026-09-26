import { socketService } from '../../services/socket.js';
import {
  RTCSessionDescriptionInitLike,
  RTCIceCandidateInitLike,
} from '@syncwatch/shared';
import { getIceServers } from './iceConfig.js';

export interface VideoCallManagerCallbacks {
  onRemoteStream: (participantId: string, stream: MediaStream) => void;
  onRemotePeerLeft: (participantId: string) => void;
  onConnectionStateChange: (participantId: string, state: RTCPeerConnectionState) => void;
  onError: (error: string) => void;
}

export class VideoCallManager {
  private localStream: MediaStream | null = null;
  private remoteStreams: Map<string, MediaStream> = new Map();
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInitLike[]> = new Map();
  private callbacks: VideoCallManagerCallbacks;
  private isMuted: boolean = false;
  private isCameraOff: boolean = false;

  constructor(callbacks: VideoCallManagerCallbacks) {
    this.callbacks = callbacks;
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

      // Update video sender on all active peer connections
      for (const pc of this.peerConnections.values()) {
        const videoSender = pc
          .getSenders()
          .find((s) => s.track?.kind === 'video' || (!s.track && (s as any).dtlsTransport));
        if (videoSender && newVideoTrack) {
          try {
            await videoSender.replaceTrack(newVideoTrack);
          } catch {
            pc.addTrack(newVideoTrack, local);
          }
        } else if (newVideoTrack) {
          const sender = pc.addTrack(newVideoTrack, local);
          this.applySenderBitrate(sender);
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
      const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender) {
        videoSender.replaceTrack(null).catch(() => {});
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
          const audioSender = pc.getSenders().find((s) => s.track?.kind === 'audio');
          if (audioSender) {
            audioSender.replaceTrack(audioTrack).catch(() => {});
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

  public async initiateConnectionToPeer(targetParticipantId: string): Promise<void> {
    const pc = this.getOrCreatePeerConnection(targetParticipantId);

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);

      if (pc.localDescription) {
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
    }
  }

  public async handleIncomingOffer(
    fromParticipantId: string,
    sdp: RTCSessionDescriptionInitLike
  ): Promise<void> {
    const pc = this.getOrCreatePeerConnection(fromParticipantId);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp as RTCSessionDescriptionInit));
      await this.flushPendingCandidates(fromParticipantId, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (pc.localDescription) {
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
    const pc = this.peerConnections.get(fromParticipantId);
    if (!pc) return;

    try {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp as RTCSessionDescriptionInit));
        await this.flushPendingCandidates(fromParticipantId, pc);
      }
    } catch (err: any) {
      this.callbacks.onError(`Failed to handle connection answer: ${err.message}`);
    }
  }

  public async handleIncomingIceCandidate(
    fromParticipantId: string,
    candidate: RTCIceCandidateInitLike
  ): Promise<void> {
    const pc = this.peerConnections.get(fromParticipantId);

    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate as RTCIceCandidateInit));
      } catch (err: any) {
        console.warn('Error adding ICE candidate:', err);
      }
    } else {
      const pending = this.pendingCandidates.get(fromParticipantId) || [];
      pending.push(candidate);
      this.pendingCandidates.set(fromParticipantId, pending);
    }
  }

  public closePeerConnection(participantId: string) {
    const pc = this.peerConnections.get(participantId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
      this.peerConnections.delete(participantId);
    }
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
    this.remoteStreams.clear();
    this.pendingCandidates.clear();
  }

  private getOrCreatePeerConnection(targetParticipantId: string): RTCPeerConnection {
    let pc = this.peerConnections.get(targetParticipantId);
    if (pc) return pc;

    const configuration: RTCConfiguration = {
      iceServers: getIceServers(),
      iceCandidatePoolSize: 2,
    };

    pc = new RTCPeerConnection(configuration);

    // Attach local media stream tracks if active
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        const sender = pc!.addTrack(track, this.localStream!);
        this.applySenderBitrate(sender);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && event.candidate.candidate) {
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
      if (event.streams && event.streams[0]) {
        this.remoteStreams.set(targetParticipantId, event.streams[0]);
        this.callbacks.onRemoteStream(targetParticipantId, event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      if (!pc) return;
      this.callbacks.onConnectionStateChange(targetParticipantId, pc.connectionState);

      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeerConnection(targetParticipantId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (!pc) return;
      if (pc.iceConnectionState === 'failed') {
        try {
          pc.restartIce();
        } catch {}
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
      } catch (err: any) {
        console.warn('Failed to add queued candidate:', err);
      }
    }
    this.pendingCandidates.delete(participantId);
  }
}
