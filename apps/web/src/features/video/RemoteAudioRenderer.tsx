import React, { useEffect, useRef } from 'react';
import { VideoPeerDisplayState } from './videoCallTypes.js';

interface RemoteAudioItemProps {
  peerId: string;
  stream: MediaStream | null;
  volume: number; // 0 to 100
  isLocallyMuted: boolean;
}

const RemoteAudioItem: React.FC<RemoteAudioItemProps> = React.memo(
  ({ peerId, stream, volume, isLocallyMuted }) => {
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
      const el = audioRef.current;
      if (!el) return;

      if (stream && el.srcObject !== stream) {
        el.srcObject = stream;
        try {
          const playPromise = el.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch((err) => {
              if (err?.name !== 'NotAllowedError') {
                console.debug(`[RemoteAudio] Autoplay blocked for ${peerId}:`, err);
              }
            });
          }
        } catch (err: any) {
          if (err?.name !== 'NotAllowedError') {
            console.debug(`[RemoteAudio] Play error for ${peerId}:`, err);
          }
        }
      } else if (!stream && el.srcObject) {
        el.srcObject = null;
      }
    }, [peerId, stream]);

    useEffect(() => {
      const el = audioRef.current;
      if (!el) return;
      // Convert 0-100 to 0.0 - 1.0 volume range
      const normalizedVolume = Math.max(0, Math.min(1, volume / 100));
      el.volume = normalizedVolume;
      el.muted = isLocallyMuted;
    }, [volume, isLocallyMuted]);

    return (
      <audio
        ref={audioRef}
        autoPlay
        playsInline
        data-participant-id={peerId}
        style={{ display: 'none' }}
      />
    );
  }
);

RemoteAudioItem.displayName = 'RemoteAudioItem';

interface RemoteAudioRendererProps {
  peers: VideoPeerDisplayState[];
  participantVolumes: Map<string, number>;
  participantMutedLocally: Map<string, boolean>;
  getStream?: (participantId: string, isLocal?: boolean) => MediaStream | null;
}

export const RemoteAudioRenderer: React.FC<RemoteAudioRendererProps> = ({
  peers,
  participantVolumes,
  participantMutedLocally,
  getStream,
}) => {
  return (
    <div className="remote-audio-renderer" style={{ display: 'none' }} aria-hidden="true">
      {peers.map((peer) => {
        const stream = peer.stream || (getStream ? getStream(peer.participantId, false) : null);
        const volume = participantVolumes.get(peer.participantId) ?? 100;
        const isLocallyMuted = participantMutedLocally.get(peer.participantId) ?? false;

        return (
          <RemoteAudioItem
            key={peer.participantId}
            peerId={peer.participantId}
            stream={stream}
            volume={volume}
            isLocallyMuted={isLocallyMuted}
          />
        );
      })}
    </div>
  );
};
