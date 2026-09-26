import React, { useState, useEffect, useRef } from 'react';

export const WebRTCCameraPage: React.FC = () => {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [webrtcStats, setWebrtcStats] = useState<any>(null);
  const [rafStats, setRafStats] = useState<any>({ currentDelta: 0, avgDelta: 0, maxDelta: 0, stalls50: 0, stalls100: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pc1Ref = useRef<RTCPeerConnection | null>(null);
  const pc2Ref = useRef<RTCPeerConnection | null>(null);
  const statsIntervalRef = useRef<any>(null);

  const rafIdRef = useRef<number | null>(null);
  const rafTimesRef = useRef<number[]>([]);
  const lastRafTimeRef = useRef<number>(performance.now());
  const maxDeltaRef = useRef<number>(0);
  const stalls50Ref = useRef<number>(0);
  const stalls100Ref = useRef<number>(0);

  const startWebRTC = async () => {
    stopWebRTC();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 24 } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const pc1 = new RTCPeerConnection();
      const pc2 = new RTCPeerConnection();
      pc1Ref.current = pc1;
      pc2Ref.current = pc2;

      pc1.onicecandidate = (e) => e.candidate && pc2.addIceCandidate(e.candidate);
      pc2.onicecandidate = (e) => e.candidate && pc1.addIceCandidate(e.candidate);

      // NO remote video rendering (deliberately discard ontrack)
      pc2.ontrack = (_e) => {
        // Deliberately do NOT attach to any DOM element
      };

      const transceiver = pc1.addTransceiver(stream.getVideoTracks()[0], {
        direction: 'sendonly',
        streams: [stream],
      });

      // Prioritize H.264
      if (typeof RTCRtpReceiver !== 'undefined' && 'getCapabilities' in RTCRtpReceiver) {
        const caps = RTCRtpReceiver.getCapabilities('video');
        if (caps && caps.codecs) {
          const h264 = caps.codecs.filter((c) => c.mimeType.toLowerCase() === 'video/h264');
          const others = caps.codecs.filter((c) => c.mimeType.toLowerCase() !== 'video/h264');
          if (h264.length > 0 && typeof transceiver.setCodecPreferences === 'function') {
            transceiver.setCodecPreferences([...h264, ...others]);
          }
        }
      }

      const offer = await pc1.createOffer();
      await pc1.setLocalDescription(offer);
      await pc2.setRemoteDescription(offer);

      const answer = await pc2.createAnswer();
      await pc2.setLocalDescription(answer);
      await pc1.setRemoteDescription(answer);

      setIsActive(true);

      // Start stats polling
      statsIntervalRef.current = setInterval(async () => {
        if (!pc1Ref.current) return;
        const stats = await pc1Ref.current.getStats();
        stats.forEach((report) => {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            setWebrtcStats({
              framesEncoded: report.framesEncoded || 0,
              keyFramesEncoded: report.keyFramesEncoded || 0,
              totalEncodeTime: report.totalEncodeTime ? Math.round(report.totalEncodeTime * 1000) : 0,
              bytesSent: report.bytesSent || 0,
              frameWidth: report.frameWidth || 0,
              frameHeight: report.frameHeight || 0,
              framesPerSecond: report.framesPerSecond || 0,
              qualityLimitationReason: report.qualityLimitationReason || 'none',
            });
          }
        });
      }, 1000);
    } catch (err: any) {
      console.error('WebRTC error:', err);
    }
  };

  const stopWebRTC = () => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    if (pc1Ref.current) {
      pc1Ref.current.close();
      pc1Ref.current = null;
    }
    if (pc2Ref.current) {
      pc2Ref.current.close();
      pc2Ref.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
    setWebrtcStats(null);
  };

  // rAF monitor
  useEffect(() => {
    const loop = (timestamp: number) => {
      const delta = timestamp - lastRafTimeRef.current;
      lastRafTimeRef.current = timestamp;

      if (delta > 50) stalls50Ref.current++;
      if (delta > 100) stalls100Ref.current++;
      if (delta > maxDeltaRef.current && delta < 5000) maxDeltaRef.current = delta;

      rafTimesRef.current.push(delta);
      if (rafTimesRef.current.length > 60) rafTimesRef.current.shift();

      const sum = rafTimesRef.current.reduce((a, b) => a + b, 0);
      const avg = sum / (rafTimesRef.current.length || 1);

      setRafStats({
        currentDelta: Math.round(delta * 10) / 10,
        avgDelta: Math.round(avg * 10) / 10,
        maxDelta: Math.round(maxDeltaRef.current * 10) / 10,
        stalls50: stalls50Ref.current,
        stalls100: stalls100Ref.current,
      });

      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  return (
    <div style={{ backgroundColor: '#000', color: '#fff', minHeight: '100vh', padding: '24px', fontFamily: 'monospace' }}>
      <h1 style={{ fontSize: '18px', margin: '0 0 16px 0' }}>/diagnostics/webrtc-camera — Camera + WebRTC Send (NO Remote Render)</h1>
      <p style={{ color: '#888', margin: '0 0 16px 0', fontSize: '13px' }}>
        Isolates WebRTC H.264 encoding load from remote video decoding/compositing.
      </p>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        {!isActive ? (
          <button
            onClick={startWebRTC}
            style={{ padding: '8px 16px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Start WebRTC Send
          </button>
        ) : (
          <button
            onClick={stopWebRTC}
            style={{ padding: '8px 16px', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Stop WebRTC
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 640px) 1fr', gap: '24px' }}>
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: '8px', overflow: 'hidden' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: 'auto', display: 'block', backgroundColor: '#000' }}
          />
        </div>

        <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
          <div style={{ marginBottom: '16px', padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '6px' }}>
            <strong style={{ color: '#818cf8' }}>rAF Event Loop Responsiveness Probe:</strong>
            <div>Current Interval: <strong>{rafStats.currentDelta} ms</strong></div>
            <div>Average Interval: <strong>{rafStats.avgDelta} ms</strong></div>
            <div>Max Spike Delay: <strong style={{ color: rafStats.maxDelta > 100 ? '#f87171' : '#fff' }}>{rafStats.maxDelta} ms</strong></div>
            <div>Stalls &gt; 50ms: <strong style={{ color: rafStats.stalls50 > 0 ? '#f87171' : '#fff' }}>{rafStats.stalls50}</strong></div>
            <div>Stalls &gt; 100ms: <strong style={{ color: rafStats.stalls100 > 0 ? '#f87171' : '#fff' }}>{rafStats.stalls100}</strong></div>
          </div>

          <div style={{ padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '6px' }}>
            <strong style={{ color: '#38bdf8' }}>WebRTC Outbound RTP (H.264 Encoder):</strong>
            <pre style={{ margin: '8px 0 0 0', overflowX: 'auto' }}>
              {webrtcStats ? JSON.stringify(webrtcStats, null, 2) : 'WebRTC inactive'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
