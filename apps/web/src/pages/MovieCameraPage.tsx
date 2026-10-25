import React, { useState, useEffect, useRef } from 'react';

export const MovieCameraPage: React.FC = () => {
  const [activeMode, setActiveMode] = useState<'none' | 'movie-only' | 'camera-only' | 'movie-and-camera'>('movie-and-camera');
  const [movieQuality, setMovieQuality] = useState<any>({ total: 0, dropped: 0 });
  const [cameraQuality, setCameraQuality] = useState<any>({ total: 0, dropped: 0 });
  const [rafStats, setRafStats] = useState<any>({ currentDelta: 0, avgDelta: 0, maxDelta: 0, stalls50: 0, stalls100: 0 });
  const [cameraSettings, setCameraSettings] = useState<any>(null);

  const movieRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const rafIdRef = useRef<number | null>(null);
  const rafTimesRef = useRef<number[]>([]);
  const lastRafTimeRef = useRef<number>(performance.now());
  const maxDeltaRef = useRef<number>(0);
  const stalls50Ref = useRef<number>(0);
  const stalls100Ref = useRef<number>(0);

  const demoMovieUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

  const startCamera = async () => {
    if (cameraStreamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 24 } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (cameraRef.current) {
        cameraRef.current.srcObject = stream;
        await cameraRef.current.play().catch(() => {});
      }
      const track = stream.getVideoTracks()[0];
      if (track) setCameraSettings(track.getSettings());
    } catch (err) {
      console.error('Camera error:', err);
    }
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (cameraRef.current) {
      cameraRef.current.srcObject = null;
    }
    setCameraSettings(null);
  };

  useEffect(() => {
    if (activeMode === 'movie-only' || activeMode === 'movie-and-camera') {
      if (movieRef.current && !movieRef.current.src) {
        movieRef.current.src = demoMovieUrl;
        movieRef.current.play().catch(() => {});
      }
    }

    if (activeMode === 'camera-only' || activeMode === 'movie-and-camera') {
      startCamera();
    } else {
      stopCamera();
    }
  }, [activeMode]);

  // Ensure camera hardware is released when navigating away
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

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

      if (movieRef.current && (movieRef.current as any).getVideoPlaybackQuality) {
        const q = (movieRef.current as any).getVideoPlaybackQuality();
        setMovieQuality({ total: q.totalVideoFrames || 0, dropped: q.droppedVideoFrames || 0 });
      }

      if (cameraRef.current && (cameraRef.current as any).getVideoPlaybackQuality) {
        const q = (cameraRef.current as any).getVideoPlaybackQuality();
        setCameraQuality({ total: q.totalVideoFrames || 0, dropped: q.droppedVideoFrames || 0 });
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
      <h1 style={{ fontSize: '18px', margin: '0 0 16px 0' }}>/diagnostics/movie-camera — Minimal Dual Video Harness</h1>
      <p style={{ color: '#888', margin: '0 0 16px 0', fontSize: '13px' }}>
        Isolates HTML video player #1 (Movie) + HTML video player #2 (Camera) without any React layout, CSS blur, or WebRTC.
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveMode('movie-only')}
          style={{
            padding: '8px 16px',
            backgroundColor: activeMode === 'movie-only' ? '#4f46e5' : '#222',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          A: Movie Only
        </button>

        <button
          onClick={() => setActiveMode('camera-only')}
          style={{
            padding: '8px 16px',
            backgroundColor: activeMode === 'camera-only' ? '#4f46e5' : '#222',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          B: Camera Only
        </button>

        <button
          onClick={() => setActiveMode('movie-and-camera')}
          style={{
            padding: '8px 16px',
            backgroundColor: activeMode === 'movie-and-camera' ? '#16a34a' : '#222',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          C: Movie + Camera
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        {/* Movie Video */}
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: '8px', padding: '8px' }}>
          <div style={{ fontSize: '12px', marginBottom: '8px', color: '#818cf8', fontWeight: 'bold' }}>Movie Player Video Surface (#1)</div>
          <video
            ref={movieRef}
            controls
            autoPlay
            loop
            muted
            playsInline
            style={{
              width: '100%',
              maxHeight: '360px',
              backgroundColor: '#000',
              display: (activeMode === 'movie-only' || activeMode === 'movie-and-camera') ? 'block' : 'none',
            }}
          />
        </div>

        {/* Camera Video */}
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: '8px', padding: '8px' }}>
          <div style={{ fontSize: '12px', marginBottom: '8px', color: '#34d399', fontWeight: 'bold' }}>Local Camera Video Surface (#2)</div>
          <video
            ref={cameraRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              maxHeight: '360px',
              backgroundColor: '#000',
              transform: 'scaleX(-1)',
              display: (activeMode === 'camera-only' || activeMode === 'movie-and-camera') ? 'block' : 'none',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', fontSize: '12px' }}>
        <div style={{ padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '6px' }}>
          <strong style={{ color: '#818cf8' }}>rAF Event Loop Probe:</strong>
          <div>Current Interval: <strong>{rafStats.currentDelta} ms</strong></div>
          <div>Average Interval: <strong>{rafStats.avgDelta} ms</strong></div>
          <div>Max Spike Delay: <strong style={{ color: rafStats.maxDelta > 100 ? '#f87171' : '#fff' }}>{rafStats.maxDelta} ms</strong></div>
          <div>Stalls &gt; 50ms: <strong style={{ color: rafStats.stalls50 > 0 ? '#f87171' : '#fff' }}>{rafStats.stalls50}</strong></div>
          <div>Stalls &gt; 100ms: <strong style={{ color: rafStats.stalls100 > 0 ? '#f87171' : '#fff' }}>{rafStats.stalls100}</strong></div>
        </div>

        <div style={{ padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '6px' }}>
          <strong style={{ color: '#34d399' }}>Movie Video Quality:</strong>
          <div>Total Frames: <strong>{movieQuality.total}</strong></div>
          <div>Dropped Frames: <strong style={{ color: movieQuality.dropped > 0 ? '#f87171' : '#fff' }}>{movieQuality.dropped}</strong></div>
        </div>

        <div style={{ padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '6px' }}>
          <strong style={{ color: '#fbbf24' }}>Camera Video Quality & Settings:</strong>
          <div>Total Frames: <strong>{cameraQuality.total}</strong></div>
          <div>Dropped Frames: <strong style={{ color: cameraQuality.dropped > 0 ? '#f87171' : '#fff' }}>{cameraQuality.dropped}</strong></div>
          <pre style={{ margin: '8px 0 0 0', fontSize: '10px', overflowX: 'auto' }}>
            {cameraSettings ? JSON.stringify(cameraSettings, null, 2) : 'Camera inactive'}
          </pre>
        </div>
      </div>
    </div>
  );
};
