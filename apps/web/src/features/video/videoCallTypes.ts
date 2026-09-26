import { VideoParticipant } from '@syncwatch/shared';

export type VideoCallConnectionStatus =
  | 'idle'
  | 'requesting-permissions'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'unsupported';

export type PermissionErrorType =
  | 'CAMERA_DENIED'
  | 'MIC_DENIED'
  | 'BOTH_DENIED'
  | 'DEVICE_NOT_FOUND'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

export interface RemotePeerState {
  participant: VideoParticipant;
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  isMuted: boolean;
  isCameraOff: boolean;
}

export interface VideoPeerDisplayState {
  participantId: string;
  displayName: string;
  isLocal: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  connectionState?: RTCPeerConnectionState;
}

export interface VideoCallControls {
  isCallActive: boolean;
  isConnecting: boolean;
  status: VideoCallConnectionStatus;
  permissionError: string | null;
  permissionErrorType: PermissionErrorType | null;
  localStream: MediaStream | null;
  remotePeers: Map<string, RemotePeerState>;
  isMuted: boolean;
  isCameraOff: boolean;
  startCall: () => Promise<void>;
  leaveCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
}
