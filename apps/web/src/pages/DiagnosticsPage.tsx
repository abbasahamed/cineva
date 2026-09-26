import React, { useState, useEffect, useRef } from 'react';
import { Video, VideoOff, RefreshCw, Cpu, HardDrive, Shield, Activity, Play, Square, Layers } from 'lucide-react';
import { getIceServers } from '../features/video/iceConfig.js';

interface TrackDiagnostic {
  label: string;
  kind: string;
  enabled: boolean;
  readyState: string;
  settings: MediaTrackSettings;
}

interface WebRTCStatsSummary {
  codec: string;
  encoderImplementation: string;
  powerEfficientEncoder?: boolean;
  frameWidth: number;
  frameHeight: number;
  framesPerSecond: number;
  framesEncoded: number;
  keyFramesEncoded: number;
  totalEncodeTimeMs: number;
  avgEncodeTimeMs: number;
  bytesSent: number;
  bitrateKbps: number;
  qualityLimitationReason: string;
  cpuLimitationResolutionChanges?: number;
}

export const DiagnosticsPage: React.FC = () => {
  const [mode, setMode] = useState<'full' | 'black-minimal'>('full');
  const [selectedConstraint, setSelectedConstraint] = useState<string>('640x480@24');
  const [preferH264, setPreferH264] = useState<boolean>(true);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isWebRtcActive, setIsWebRtcActive] = useState<boolean>(false);
  const [isRemoteRenderActive, setIsRemoteRenderActive] = useState<boolean>(false);

  const [trackDiagnostics, setTrackDiagnostics] = useState<TrackDiagnostic[]>([]);
  const [webrtcStats, setWebrtcStats] = useState<WebRTCStatsSummary | null>(null);
  const [systemTelemetry, setSystemTelemetry] = useState<any>(null);

  // Diagnostic counters
  const [trackCount, setTrackCount] = useState<number>(0);
  const [pcCount, setPcCount] = useState<number>(0);
  const [senderCount, setSenderCount] = useState<number>(0);

  // Toggle stress test state
  const [isStressTesting, setIsStressTesting] = useState<boolean>(false);
  const [stressCycles, setStressCycles] = useState<number>(0);
  const [stressLog, setStressLog] = useState<string[]>([]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const pc1Ref = useRef<RTCPeerConnection | null>(null);
  const pc2Ref = useRef<RTCPeerConnection | null>(null);
  const statsIntervalRef = useRef<any>(null);
  const prevBytesSentRef = useRef<number>(0);
  const prevTimestampRef = useRef<number>(0);

  const getConstraints = (key: string): MediaStreamConstraints => {
    switch (key) {
      case '320x240@15':
        return {
          video: { width: { exact: 320 }, height: { exact: 240 }, frameRate: { exact: 15 } },
          audio: false,
        };
      case '640x360@15':
        return {
          video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { max: 15 } },
          audio: false,
        };
      case '640x480@24':
        return {
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 24 } },
          audio: false,
        };
      case '640x480@30':
        return {
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 30 } },
          audio: false,
        };
      case '1280x720@30':
        return {
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { max: 30 } },
          audio: false,
        };
      case 'unconstrained':
        return { video: true, audio: false };
      default:
        return { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 24 } }, audio: false };
    }
  };

  const startCamera = async () => {
    try {
      stopCamera();
      const constraints = getConstraints(selectedConstraint);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      setIsCameraActive(true);
      updateTrackDiagnostics(stream);
    } catch (err: any) {
      alert(`getUserMedia failed: ${err.message}`);
    }
  };

  const stopCamera = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setTrackDiagnostics([]);
    setTrackCount(0);
    stopWebRtc();
  };

  const updateTrackDiagnostics = (stream: MediaStream) => {
    const tracks = stream.getTracks();
    setTrackCount(tracks.length);
    setTrackDiagnostics(
      tracks.map((t) => ({
        label: t.label,
        kind: t.kind,
        enabled: t.enabled,
        readyState: t.readyState,
        settings: t.getSettings(),
      }))
    );
  };

  const startWebRtcLoopback = async () => {
    if (!localStreamRef.current) {
      alert('Start camera first before enabling WebRTC loopback');
      return;
    }

    stopWebRtc();

    const config: RTCConfiguration = {
      iceServers: getIceServers(),
    };

    const pc1 = new RTCPeerConnection(config);
    const pc2 = new RTCPeerConnection(config);
    pc1Ref.current = pc1;
    pc2Ref.current = pc2;
    setPcCount(2);

    pc1.onicecandidate = (e) => {
      if (e.candidate) pc2.addIceCandidate(e.candidate).catch(() => {});
    };
    pc2.onicecandidate = (e) => {
      if (e.candidate) pc1.addIceCandidate(e.candidate).catch(() => {});
    };

    pc2.ontrack = (e) => {
      if (remoteVideoRef.current && isRemoteRenderActive) {
        remoteVideoRef.current.srcObject = e.streams[0];
        remoteVideoRef.current.play().catch(() => {});
      }
    };

    // Add local tracks to pc1
    let sendersTotal = 0;
    localStreamRef.current.getTracks().forEach((track) => {
      const sender = pc1.addTrack(track, localStreamRef.current!);
      sendersTotal++;
    });
    setSenderCount(sendersTotal);

    // Apply H264 preference if selected
    if (preferH264 && 'RTCRtpTransceiver' in window && 'setCodecPreferences' in RTCRtpTransceiver.prototype) {
      const transceivers = pc1.getTransceivers();
      for (const t of transceivers) {
        if (t.sender.track?.kind === 'video') {
          const capabilities = RTCRtpSender.getCapabilities('video');
          if (capabilities) {
            const h264Codecs = capabilities.codecs.filter(
              (c) => c.mimeType.toLowerCase() === 'video/h264'
            );
            const otherCodecs = capabilities.codecs.filter(
              (c) => c.mimeType.toLowerCase() !== 'video/h264'
            );
            if (h264Codecs.length > 0) {
              t.setCodecPreferences([...h264Codecs, ...otherCodecs]);
            }
          }
        }
      }
    }

    const offer = await pc1.createOffer();
    await pc1.setLocalDescription(offer);
    await pc2.setRemoteDescription(offer);

    const answer = await pc2.createAnswer();
    await pc2.setLocalDescription(answer);
    await pc1.setRemoteDescription(answer);

    setIsWebRtcActive(true);

    // Start stats polling loop
    startStatsLoop(pc1);
  };

  const stopWebRtc = () => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    if (pc1Ref.current) {
      pc1Ref.current.close();
      pc1Ref.current = null;
    }
    if (pc2Ref.current) {
      pc2Ref.current.close();
      pc2Ref.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setIsWebRtcActive(false);
    setPcCount(0);
    setSenderCount(0);
    setWebrtcStats(null);
  };

  const startStatsLoop = (pc: RTCPeerConnection) => {
    statsIntervalRef.current = setInterval(async () => {
      if (!pc || pc.connectionState === 'closed') return;
      try {
        const stats = await pc.getStats();
        let outboundStats: any = null;
        let codecStats: any = null;

        stats.forEach((report) => {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            outboundStats = report;
          }
        });

        if (outboundStats && outboundStats.codecId) {
          codecStats = stats.get(outboundStats.codecId);
        }

        if (outboundStats) {
          const now = outboundStats.timestamp || Date.now();
          const bytes = outboundStats.bytesSent || 0;
          let bitrate = 0;
          if (prevTimestampRef.current > 0 && now > prevTimestampRef.current) {
            bitrate = Math.round(
              ((bytes - prevBytesSentRef.current) * 8) / ((now - prevTimestampRef.current) / 1000) / 1000
            );
          }
          prevBytesSentRef.current = bytes;
          prevTimestampRef.current = now;

          const framesEncoded = outboundStats.framesEncoded || 0;
          const totalEncodeTimeSec = outboundStats.totalEncodeTime || 0;
          const avgEncodeTimeMs =
            framesEncoded > 0 ? (totalEncodeTimeSec * 1000) / framesEncoded : 0;

          setWebrtcStats({
            codec: codecStats?.mimeType || 'unknown',
            encoderImplementation: outboundStats.encoderImplementation || 'unknown',
            powerEfficientEncoder: outboundStats.powerEfficientEncoder,
            frameWidth: outboundStats.frameWidth || 0,
            frameHeight: outboundStats.frameHeight || 0,
            framesPerSecond: outboundStats.framesPerSecond || 0,
            framesEncoded,
            keyFramesEncoded: outboundStats.keyFramesEncoded || 0,
            totalEncodeTimeMs: Math.round(totalEncodeTimeSec * 1000),
            avgEncodeTimeMs: Number(avgEncodeTimeMs.toFixed(2)),
            bytesSent: bytes,
            bitrateKbps: Math.max(0, bitrate),
            qualityLimitationReason: outboundStats.qualityLimitationReason || 'none',
            cpuLimitationResolutionChanges: outboundStats.cpuLimitationResolutionChanges || 0,
          });
        }
      } catch {}
    }, 1000);
  };

  // Automated 7-cycle toggle stress test
  const runToggleStressTest = async () => {
    setIsStressTesting(true);
    setStressLog([]);
    const logs: string[] = [];

    for (let i = 1; i <= 7; i++) {
      logs.push(`Cycle ${i}/7: Turning camera ON...`);
      setStressCycles(i);
      setStressLog([...logs]);

      const constraints = getConstraints(selectedConstraint);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      await new Promise((r) => setTimeout(r, 600));

      logs.push(`Cycle ${i}/7: Tracks active = ${stream.getTracks().length}. Turning camera OFF...`);
      setStressLog([...logs]);

      stream.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      await new Promise((r) => setTimeout(r, 400));
    }

    logs.push('Stress Test Complete: All 7 cycles finished successfully.');
    setStressLog([...logs]);
    setIsStressTesting(false);
  };

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-100 p-4 sm:p-6 font-sans">
      {/* Header Bar */}
      <div className="max-w-6xl mx-auto flex items-center justify-between pb-4 border-b border-white/[0.08] mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-300">
            <Activity className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              Cineva Video & WebRTC Telemetry Diagnostics
            </h1>
            <p className="text-xs text-slate-400">
              MacBook Air M4 Hardware Capture & Encoder Analysis
            </p>
          </div>
        </div>

        {/* Minimal Black Page Toggle (Step 10) */}
        <button
          onClick={() => setMode(mode === 'full' ? 'black-minimal' : 'full')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
            mode === 'black-minimal'
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-white/[0.05] border-white/[0.1] text-slate-300'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>{mode === 'black-minimal' ? 'Exit Minimal Canvas' : 'Step 10: Black Canvas Only'}</span>
        </button>
      </div>

      {mode === 'black-minimal' ? (
        /* STEP 10: Completely Isolated Black Page with ONLY <video> */
        <div className="fixed inset-0 bg-black flex flex-col items-center justify-center p-4 z-50">
          <div className="absolute top-4 left-4 z-10 flex items-center gap-3">
            <button
              onClick={() => setMode('full')}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs"
            >
              Back to Diagnostics
            </button>
            <button
              onClick={isCameraActive ? stopCamera : startCamera}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                isCameraActive ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
              }`}
            >
              {isCameraActive ? 'Turn Camera OFF' : 'Turn Camera ON'}
            </button>
            <span className="text-xs text-slate-400 font-mono">
              Constraint: {selectedConstraint} | Tracks: {trackCount}
            </span>
          </div>

          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full max-w-2xl aspect-video rounded-xl border border-white/20 object-cover"
          />
        </div>
      ) : (
        /* Comprehensive Diagnostics Suite */
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Controls and Experiments */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Capture Constraints Selector */}
            <div className="p-4 rounded-2xl bg-[#090c18] border border-white/[0.08] shadow-md">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-brand-400" />
                <span>1. Camera Capture Constraints (Step 5)</span>
              </h2>

              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                {[
                  { id: '320x240@15', label: '320x240 @ 15fps' },
                  { id: '640x360@15', label: '640x360 @ 15fps' },
                  { id: '640x480@24', label: '640x480 @ 24fps (Cineva)' },
                  { id: '640x480@30', label: '640x480 @ 30fps' },
                  { id: '1280x720@30', label: '1280x720 @ 30fps' },
                  { id: 'unconstrained', label: 'Device Max (Native)' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedConstraint(item.id);
                      if (isCameraActive) {
                        // Restart with new constraint
                        setTimeout(() => startCamera(), 50);
                      }
                    }}
                    className={`p-2 rounded-xl border text-left font-medium transition-all ${
                      selectedConstraint === item.id
                        ? 'bg-brand-500/20 border-brand-500/40 text-brand-300 shadow-sm'
                        : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Codec Selection (Hardware H264 vs Software VP8) */}
              <div className="pt-3 border-t border-white/[0.06]">
                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span className="text-slate-300 font-medium">
                    Force Hardware H.264 Encoder (Apple VideoToolbox)
                  </span>
                  <input
                    type="checkbox"
                    checked={preferH264}
                    onChange={(e) => setPreferH264(e.target.checked)}
                    className="w-4 h-4 accent-brand-500 rounded"
                  />
                </label>
                <p className="text-[11px] text-slate-500 mt-1">
                  When enabled, requests hardware H.264 instead of CPU software VP8/VP9.
                </p>
              </div>
            </div>

            {/* Test Action Buttons */}
            <div className="p-4 rounded-2xl bg-[#090c18] border border-white/[0.08] shadow-md flex flex-col gap-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-1 flex items-center gap-2">
                <Play className="w-4 h-4 text-emerald-400" />
                <span>2. Pipeline Test Isolation</span>
              </h2>

              {/* Local Camera Only */}
              <button
                onClick={isCameraActive ? stopCamera : startCamera}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                  isCameraActive
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-glass-glow'
                }`}
              >
                {isCameraActive ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                <span>{isCameraActive ? 'Step 2: Stop Local Camera' : 'Step 2: Start Local Camera Only'}</span>
              </button>

              {/* WebRTC Loopback Sender */}
              <button
                onClick={isWebRtcActive ? stopWebRtc : startWebRtcLoopback}
                disabled={!isCameraActive}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                  !isCameraActive
                    ? 'opacity-40 cursor-not-allowed bg-white/[0.02] border-white/[0.05] text-slate-500'
                    : isWebRtcActive
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-brand-500/20 border-brand-500/40 text-brand-300 shadow-glass-glow'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>
                  {isWebRtcActive ? 'Step 3: Stop WebRTC Sender' : 'Step 3: Start WebRTC Sender (Loopback)'}
                </span>
              </button>

              {/* Remote Video Rendering Toggle */}
              <label className="flex items-center justify-between text-xs py-1.5 px-1 cursor-pointer">
                <span className="text-slate-300 font-medium">Step 4: Decode & Render Remote Video</span>
                <input
                  type="checkbox"
                  checked={isRemoteRenderActive}
                  onChange={(e) => setIsRemoteRenderActive(e.target.checked)}
                  className="w-4 h-4 accent-brand-500 rounded"
                />
              </label>

              {/* 7-Cycle Toggle Stress Test */}
              <button
                onClick={runToggleStressTest}
                disabled={isStressTesting}
                className="mt-2 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold hover:bg-purple-500/25 transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isStressTesting ? 'animate-spin' : ''}`} />
                <span>Step 13: Run 7-Cycle Camera Toggle Stress Test</span>
              </button>
            </div>

            {/* Stress Test Logs */}
            {stressLog.length > 0 && (
              <div className="p-3 rounded-xl bg-black/60 border border-white/[0.08] text-[11px] font-mono text-slate-400 max-h-36 overflow-y-auto">
                <div className="text-slate-200 font-bold mb-1">Stress Test Progress:</div>
                {stressLog.map((log, i) => (
                  <div key={i} className="text-emerald-400/90">{log}</div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Live Viewports & Real-Time Telemetry */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* Viewports Container */}
            <div className="grid grid-cols-2 gap-3">
              {/* Local Camera Viewport */}
              <div className="relative rounded-2xl bg-black border border-white/[0.1] overflow-hidden aspect-video flex items-center justify-center shadow-lg">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 border border-white/10 text-[10px] text-white font-mono">
                  Local Camera (Input)
                </div>
                {!isCameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-xs font-mono">
                    <VideoOff className="w-5 h-5 mb-1 opacity-50" />
                    Camera Inactive
                  </div>
                )}
              </div>

              {/* Remote Loopback Viewport */}
              <div className="relative rounded-2xl bg-black border border-white/[0.1] overflow-hidden aspect-video flex items-center justify-center shadow-lg">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 border border-white/10 text-[10px] text-white font-mono">
                  Remote (Decoded Output)
                </div>
                {(!isWebRtcActive || !isRemoteRenderActive) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-xs font-mono text-center p-2">
                    <Layers className="w-5 h-5 mb-1 opacity-50" />
                    {!isWebRtcActive ? 'WebRTC Inactive' : 'Remote Render Disabled'}
                  </div>
                )}
              </div>
            </div>

            {/* Live MediaStreamTrack Telemetry */}
            <div className="p-4 rounded-2xl bg-[#090c18] border border-white/[0.08] shadow-md">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-brand-400" />
                  <span>MediaStreamTrack Actual Settings (Step 6 & 12)</span>
                </span>
                <span className="text-[11px] font-mono text-brand-300 font-normal">
                  Active Tracks: {trackCount} | PCs: {pcCount} | Senders: {senderCount}
                </span>
              </h2>

              {trackDiagnostics.length === 0 ? (
                <div className="p-3 text-center text-slate-500 text-xs font-mono">
                  No active media tracks. Start camera to inspect hardware settings.
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-xs font-mono">
                  {trackDiagnostics.map((track, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-black/50 border border-white/[0.06] flex flex-col gap-1 text-slate-300"
                    >
                      <div className="flex items-center justify-between font-bold text-white">
                        <span>{track.label}</span>
                        <span className="text-emerald-400 text-[11px] uppercase">
                          {track.readyState}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-slate-400 text-[11px] mt-1">
                        <div>Resolution: <span className="text-white">{track.settings.width}x{track.settings.height}</span></div>
                        <div>Frame Rate: <span className="text-white">{track.settings.frameRate} fps</span></div>
                        <div>Aspect Ratio: <span className="text-white">{track.settings.aspectRatio?.toFixed(2)}</span></div>
                        <div>Facing Mode: <span className="text-white">{track.settings.facingMode || 'user'}</span></div>
                        <div>Resize Mode: <span className="text-white">{(track.settings as any).resizeMode || 'none'}</span></div>
                        <div>Device ID: <span className="text-white truncate block max-w-[120px]">{track.settings.deviceId?.slice(0, 10)}...</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Real-time WebRTC Outbound Stats (Step 7 & 8) */}
            <div className="p-4 rounded-2xl bg-[#090c18] border border-white/[0.08] shadow-md">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>WebRTC Outbound Encoder Stats (Step 7 & 8)</span>
                </span>
                {webrtcStats && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Live Polling (1s)
                  </span>
                )}
              </h2>

              {!webrtcStats ? (
                <div className="p-3 text-center text-slate-500 text-xs font-mono">
                  WebRTC loopback inactive. Start WebRTC Sender to measure live encoder statistics.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06]">
                    <div className="text-slate-400 text-[10px]">Negotiated Codec</div>
                    <div className="text-white font-bold text-sm mt-0.5">{webrtcStats.codec}</div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06]">
                    <div className="text-slate-400 text-[10px]">Encoder Implementation</div>
                    <div className={`font-bold text-xs mt-0.5 ${
                      webrtcStats.encoderImplementation.toLowerCase().includes('external') ||
                      webrtcStats.encoderImplementation.toLowerCase().includes('videotoolbox') ||
                      webrtcStats.powerEfficientEncoder
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}>
                      {webrtcStats.encoderImplementation}
                      {webrtcStats.powerEfficientEncoder ? ' (Hardware Accel)' : ''}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06]">
                    <div className="text-slate-400 text-[10px]">Encoder Resolution / FPS</div>
                    <div className="text-white font-bold text-xs mt-0.5">
                      {webrtcStats.frameWidth}x{webrtcStats.frameHeight} @ {webrtcStats.framesPerSecond}fps
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06]">
                    <div className="text-slate-400 text-[10px]">Avg Encode Time / Frame</div>
                    <div className="text-white font-bold text-sm mt-0.5">
                      {webrtcStats.avgEncodeTimeMs} ms
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06]">
                    <div className="text-slate-400 text-[10px]">Sender Bitrate</div>
                    <div className="text-brand-300 font-bold text-sm mt-0.5">
                      {webrtcStats.bitrateKbps} kbps
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06]">
                    <div className="text-slate-400 text-[10px]">Quality Limitation</div>
                    <div className={`font-bold text-xs mt-0.5 ${
                      webrtcStats.qualityLimitationReason === 'cpu'
                        ? 'text-rose-400'
                        : 'text-slate-300'
                    }`}>
                      {webrtcStats.qualityLimitationReason.toUpperCase()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
