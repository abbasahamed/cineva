import React, { useState, useEffect } from 'react';
import { Terminal, Activity, Zap, Play, Pause, RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-react';
import { PlaybackState } from '@syncwatch/shared';
import { ConnectionStatus } from '../hooks/useSyncWatch.js';
import { socketService } from '../services/socket.js';
import { calculateExpectedPosition } from '@syncwatch/shared';

interface DebugPanelProps {
  playback: PlaybackState;
  connectionStatus: ConnectionStatus;
  isHost: boolean;
  rtt: number;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  playback,
  connectionStatus,
  isHost,
  rtt,
  videoRef,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [localPos, setLocalPos] = useState<number>(0);
  const [authoritativePos, setAuthoritativePos] = useState<number>(0);
  const [driftMs, setDriftMs] = useState<number>(0);
  const [effectiveRate, setEffectiveRate] = useState<number>(1);

  // Update diagnostic metrics on 100ms interval
  useEffect(() => {
    const timer = setInterval(() => {
      const video = videoRef.current;
      const curLocal = video ? video.currentTime : 0;
      setLocalPos(curLocal);
      if (video) {
        setEffectiveRate(video.playbackRate);
      }

      const estimatedServerNow = socketService.getEstimatedServerTime();
      const curExpected = calculateExpectedPosition(playback, estimatedServerNow);
      setAuthoritativePos(curExpected);

      const drift = Math.round((curExpected - curLocal) * 1000);
      setDriftMs(drift);
    }, 100);

    return () => clearInterval(timer);
  }, [playback, videoRef]);

  if (!isOpen) return null;

  const serverOffset = socketService.getServerOffset();

  const injectDrift = (deltaSeconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + deltaSeconds);
    }
  };

  return (
    <aside
      aria-label="Synchronization Diagnostics Panel"
      className="fixed bottom-4 left-4 z-50 glass-card bg-[#08090f]/90 border border-indigo-500/30 rounded-2xl shadow-glass-elevated backdrop-blur-xl text-xs font-mono text-slate-200 w-80 overflow-hidden select-none"
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 bg-indigo-950/40 border-b border-indigo-500/20 flex items-center justify-between">
        <div className="flex items-center gap-2 text-indigo-300 font-bold">
          <Terminal className="w-4 h-4 text-indigo-400" />
          <span>Sync Diagnostics</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
            ?debug=1
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
            title="Close Debug Panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-3.5 space-y-2.5">
          {/* Status & Role Grid */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.08]">
              <span className="text-slate-500 block text-[10px]">CONNECTION</span>
              <span
                className={`font-bold ${
                  connectionStatus === 'connected'
                    ? 'text-emerald-400'
                    : connectionStatus === 'reconnecting'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {connectionStatus.toUpperCase()}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.08]">
              <span className="text-slate-500 block text-[10px]">ROLE</span>
              <span className={`font-bold ${isHost ? 'text-amber-400' : 'text-indigo-400'}`}>
                {isHost ? 'HOST' : 'GUEST'}
              </span>
            </div>
          </div>

          {/* Latency & Server Clock */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.08]">
              <span className="text-slate-500 block text-[10px]">SERVER OFFSET</span>
              <span className="font-semibold text-slate-200">
                {serverOffset >= 0 ? `+${serverOffset}` : serverOffset} ms
              </span>
            </div>
            <div className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.08]">
              <span className="text-slate-500 block text-[10px]">RTT (ROUND-TRIP)</span>
              <span className="font-semibold text-slate-200">{rtt} ms</span>
            </div>
          </div>

          {/* Playback & Positions */}
          <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Auth Position:</span>
              <span className="font-bold text-indigo-300">{authoritativePos.toFixed(3)}s</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Local Video:</span>
              <span className="font-bold text-slate-200">{localPos.toFixed(3)}s</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-white/[0.08]">
              <span className="text-slate-400">Calculated Drift:</span>
              <span
                className={`font-bold ${
                  Math.abs(driftMs) < 250
                    ? 'text-emerald-400'
                    : Math.abs(driftMs) < 1000
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {driftMs > 0 ? `+${driftMs}` : driftMs} ms
                <span className="text-[9px] font-normal ml-1 text-slate-500">
                  {Math.abs(driftMs) < 250 ? '(synced)' : Math.abs(driftMs) < 1000 ? '(nudging)' : '(seek)'}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Playback / Rate:</span>
              <span className="font-semibold text-slate-200">
                {playback.isPlaying ? 'PLAYING' : 'PAUSED'} ({effectiveRate.toFixed(2)}x)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">State Version:</span>
              <span className="font-semibold text-indigo-400">v{playback.version}</span>
            </div>
          </div>

          {/* Drift Injection Testing Tools */}
          <div className="pt-1">
            <span className="text-[10px] text-slate-500 block mb-1 uppercase font-semibold">
              Test Drift Injection
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                onClick={() => injectDrift(-2.0)}
                className="py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-[10px] font-bold text-slate-300 transition-colors"
                title="Force local video 2s behind"
              >
                -2.0s
              </button>
              <button
                onClick={() => injectDrift(-0.5)}
                className="py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-[10px] font-bold text-slate-300 transition-colors"
                title="Force local video 0.5s behind"
              >
                -0.5s
              </button>
              <button
                onClick={() => injectDrift(0.5)}
                className="py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-[10px] font-bold text-slate-300 transition-colors"
                title="Force local video 0.5s ahead"
              >
                +0.5s
              </button>
              <button
                onClick={() => injectDrift(2.0)}
                className="py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-[10px] font-bold text-slate-300 transition-colors"
                title="Force local video 2s ahead"
              >
                +2.0s
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
