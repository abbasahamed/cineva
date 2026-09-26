import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useVideoPeers, useVideoControls } from './VideoContext.js';

export const WebRTCDebugPanel: React.FC = () => {
  const [searchParams] = useSearchParams();
  const isEnabled = searchParams.get('debugWebRTC') === '1';

  const { isCameraOn, isMuted } = useVideoControls();
  const { allPeers, currentParticipantId, currentDisplayName, getStream, getPeerDiagnostics } = useVideoPeers();

  const [tick, setTick] = useState(0);

  // Poll state every 1s while panel is active
  useEffect(() => {
    if (!isEnabled) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isEnabled]);

  if (!isEnabled) return null;

  const localStream = getStream('', true);
  const localVideoTrack = localStream?.getVideoTracks()[0];

  return (
    <div
      className="fixed bottom-4 right-4 z-50 bg-[#0b0e14]/95 border border-white/20 text-slate-200 p-3 rounded-xl shadow-2xl font-mono text-[10px] w-80 max-h-[70vh] overflow-y-auto backdrop-blur-md"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="flex items-center justify-between pb-1.5 border-b border-white/10 mb-2">
        <span className="font-bold text-amber-400">WebRTC Debug Panel</span>
        <span className="text-[9px] text-slate-400 font-normal">?debugWebRTC=1</span>
      </div>

      {/* Local Participant */}
      <div className="mb-2.5 pb-2 border-b border-white/5 space-y-0.5">
        <div className="text-emerald-400 font-semibold">Local: {currentDisplayName} ({currentParticipantId || 'no-id'})</div>
        <div>Camera: {isCameraOn ? 'ON' : 'OFF'} | Mic: {isMuted ? 'MUTED' : 'LIVE'}</div>
        <div>
          Local Track:{' '}
          {localVideoTrack
            ? `${localVideoTrack.id.slice(0, 8)}... (${localVideoTrack.readyState}, ${localVideoTrack.enabled ? 'en' : 'dis'})`
            : 'None'}
        </div>
      </div>

      {/* Remote Peers */}
      <div className="space-y-2">
        <div className="text-slate-400 font-semibold">Remote Peers ({allPeers.length}):</div>
        {allPeers.length === 0 ? (
          <div className="text-slate-500 italic">No remote peers registered</div>
        ) : (
          allPeers.map((peer) => {
            const diag = getPeerDiagnostics ? getPeerDiagnostics(peer.participantId) : null;
            const stream = peer.stream || getStream(peer.participantId, false);
            const remoteVideoTrack = stream?.getVideoTracks()[0];

            return (
              <div key={peer.participantId} className="bg-white/[0.03] border border-white/10 p-2 rounded-lg space-y-0.5">
                <div className="text-brand-300 font-bold">
                  {peer.displayName} ({peer.participantId.slice(0, 8)}...)
                </div>
                <div>Peer: {peer.peerDebugId || diag?.peerDebugId || 'N/A'}</div>
                <div>Signaling: <span className="text-amber-300">{diag?.signalingState || 'unknown'}</span></div>
                <div>ICE: <span className="text-sky-300">{diag?.iceConnectionState || 'unknown'}</span></div>
                <div>Connection: <span className="text-emerald-300">{peer.connectionState || diag?.connectionState || 'unknown'}</span></div>
                <div>
                  Remote Track:{' '}
                  {remoteVideoTrack
                    ? `${remoteVideoTrack.id.slice(0, 8)}... (${remoteVideoTrack.readyState}, ${remoteVideoTrack.enabled ? 'en' : 'dis'})`
                    : 'None'}
                </div>
                <div>Remote Stream: {stream ? `${stream.id.slice(0, 8)}... (${stream.getTracks().length} trks)` : 'None'}</div>
                <div>
                  Video: {remoteVideoTrack?.readyState === 'live' ? 'Rendering' : 'Unavailable'}
                </div>
                {diag?.transceivers && (
                  <div className="text-[9px] text-slate-400 pt-0.5">
                    Transceivers: {diag.transceivers.map((t: any, i: number) => `[#${i} ${t.direction}->${t.currentDirection || 'none'}]`).join(' ')}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
