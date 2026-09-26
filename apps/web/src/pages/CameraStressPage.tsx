import React, { useState, useEffect, useRef } from 'react';

export const CameraStressPage: React.FC = () => {
  const [selectedPreset, setSelectedPreset] = useState<string>('640x480@24');
  const [isActive, setIsActive] = useState<boolean>(false);
  const [trackSettings, setTrackSettings] = useState<any>(null);
  const [videoQuality, setVideoQuality] = useState<any>({ total: 0, dropped: 0, corrupted: 0 });
  const [rafStats, setRafStats] = useState<any>({ currentDelta: 0, avgDelta: 0, maxDelta: 0, stalls50: 0, stalls100: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const rafTimesRef = useRef<number[]>([]);
  const lastRafTimeRef = useRef<number>(performance.now());
  const maxDeltaRef = useRef<number>(0);
  const stalls50Ref = useRef<number>(0);
  const stalls100Ref = useRef<number>(0);

  const presets: Record<string, MediaStreamConstraints> = {
    '320x240@15': { video: { width: { exact: 320 }, height: { exact: 240 }, frameRate: { exact: 15 } } },
    '640x480@15': { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 15 } } },
    '640x480@24': { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 24 } } },
    '640x480@30': { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 30 } } },
    '1280x720@30': { video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { max: 30 } } },
    '1920x1080@30': { video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { max: 30 } } },
  };

  const startCamera = async (presetKey: string) => {
    stopCamera();
    try {
      const constraints = presets[presetKey] || presets['640x480@24'];
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const track = stream.getVideoTracks()[0];
      if (track) {
        setTrackSettings(track.getSettings());
      }
      setIsActive(true);
    } catch (err: any) {
      console.error('Failed to start camera:', err);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
    setTrackSettings(null);
  };

  // rAF Responsiveness Probe
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

      if (videoRef.current && (videoRef.current as any).getVideoPlaybackQuality) {
        const q = (videoRef.current as any).getVideoPlaybackQuality();
        setVideoQuality({
          total: q.totalVideoFrames || 0,
          dropped: q.droppedVideoFrames || 0,
          corrupted: q.corruptedVideoFrames || 0,
        });
      }

      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  return (
    <div style={{ backgroundColor: '#000', color: '#fff', minHeight: '100vh', padding: '24px', fontFamily: 'monospace' }}>
      <h1 style={{ fontSize: '18px', margin: '0 0 16px 0' }}>/diagnostics/camera-stress — Minimal Camera Harness</h1>
      <p style={{ color: '#888', margin: '0 0 16px 0', fontSize: '13px' }}>
        Zero Cineva UI, Zero CSS Blur/Effects, Zero WebRTC, Zero Starfield.
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {Object.keys(presets).map((key) => (
          <button
            key={key}
            onClick={() => {
              setSelectedPreset(key);
              if (isActive) startCamera(key);
            }}
            style={{
              padding: '6px 12px',
              backgroundColor: selectedPreset === key ? '#4f46e5' : '#222',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {key}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        {!isActive ? (
          <button
            onClick={() => startCamera(selectedPreset)}
            style={{ padding: '8px 16px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Start Camera
          </button>
        ) : (
          <button
            onClick={stopCamera}
            style={{ padding: '8px 16px', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Stop Camera
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
            <div>Current Interval: <strong>{rafStats.currentDelta} ms</strong> (expected ~16.7ms @ 60Hz)</div>
            <div>Average Interval: <strong>{rafStats.avgDelta} ms</strong></div>
            <div>Max Spike Delay: <strong style={{ color: rafStats.maxDelta > 100 ? '#f87171' : '#fff' }}>{rafStats.maxDelta} ms</strong></div>
            <div>Stalls &gt; 50ms: <strong style={{ color: rafStats.stalls50 > 0 ? '#f87171' : '#fff' }}>{rafStats.stalls50}</strong></div>
            <div>Stalls &gt; 100ms: <strong style={{ color: rafStats.stalls100 > 0 ? '#f87171' : '#fff' }}>{rafStats.stalls100}</strong></div>
          </div>

          <div style={{ marginBottom: '16px', padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '6px' }}>
            <strong style={{ color: '#34d399' }}>HTMLVideoElement Frame Quality:</strong>
            <div>Total Frames: <strong>{videoQuality.total}</strong></div>
            <div>Dropped Frames: <strong style={{ color: videoQuality.dropped > 0 ? '#f87171' : '#fff' }}>{videoQuality.dropped}</strong></div>
            <div>Corrupted Frames: <strong>{videoQuality.corrupted}</strong></div>
          </div>

          <div style={{ padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '6px' }}>
            <strong style={{ color: '#fbbf24' }}>Hardware Track Settings:</strong>
            <pre style={{ margin: '8px 0 0 0', overflowX: 'auto' }}>
              {trackSettings ? JSON.stringify(trackSettings, null, 2) : 'Camera inactive'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
