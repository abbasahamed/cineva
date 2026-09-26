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

  public async acquireLocalMedia(): Promise<MediaStream> {
    if (!VideoCallManager.isSupported()) {
      throw new Error('WebRTC is not supported in this browser.');
    }

    // Try acquiring both camera and microphone with optimal watch-party constraints
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { max: 24 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.localStream = stream;
      return stream;
    } catch (err: any) {
      // If user has no camera but has mic, fallback to audio-only
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        try {
          const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          this.localStream = audioOnlyStream;
          this.isCameraOff = true;
          return audioOnlyStream;
        } catch {
          // If audio-only also fails, rethrow original error
        }
      }
      throw err;
    }
  }

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public setMute(muted: boolean): boolean {
    this.isMuted = muted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    return this.isMuted;
  }

  public setCameraOff(cameraOff: boolean): boolean {
    this.isCameraOff = cameraOff;
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = !cameraOff;
      });
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

      // Flush any queued candidates
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
      // Queue until remote description is set
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
    this.pendingCandidates.delete(participantId);
    this.callbacks.onRemotePeerLeft(participantId);
  }

  public cleanup() {
    // 1. Stop all tracks in local media stream immediately (turns off camera/mic hardware LEDs)
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore track stop error
        }
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
      } catch {
        // ignore close error
      }
      this.callbacks.onRemotePeerLeft(participantId);
    }
    this.peerConnections.clear();
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

    // Attach local media stream tracks to this peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc!.addTrack(track, this.localStream!);
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
        } catch {
          // restartIce not supported in older engines
        }
      }
    };

    this.peerConnections.set(targetParticipantId, pc);
    return pc;
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
