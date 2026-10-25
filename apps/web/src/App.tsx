import React from 'react';
import { DesignSystemPage } from './pages/DesignSystemPage';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { LandingPage } from './pages/LandingPage.js';
import { CreateRoomPage } from './pages/CreateRoomPage.js';
import { JoinRoomPage } from './pages/JoinRoomPage.js';
import { WatchRoomPage } from './pages/WatchRoomPage.js';
import { DiagnosticsPage } from './pages/DiagnosticsPage.js';
import { CameraStressPage } from './pages/CameraStressPage.js';
import { WebRTCCameraPage } from './pages/WebRTCCameraPage.js';
import { MovieCameraPage } from './pages/MovieCameraPage.js';

export function App() {
  return (
    <ToastProvider>
      <ThemeProvider>
        <div className="relative min-h-screen bg-[#040508] text-slate-100 selection:bg-brand-500/30 selection:text-brand-200 overflow-x-hidden">
          <div className="relative z-10">
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/create" element={<CreateRoomPage />} />
                <Route path="/join" element={<JoinRoomPage />} />
                <Route path="/join/:roomCode" element={<JoinRoomPage />} />
                <Route path="/room/:roomCode" element={<WatchRoomPage />} />
                {/* Developer diagnostics routes (accessible only in development) */}
                {import.meta.env.DEV && (
                  <>
                    <Route path="/diagnostics" element={<DiagnosticsPage />} />
                    <Route path="/diagnostics/camera-stress" element={<CameraStressPage />} />
                    <Route path="/diagnostics/webrtc-camera" element={<WebRTCCameraPage />} />
                    <Route path="/diagnostics/movie-camera" element={<MovieCameraPage />} />
                  </>
                )}
                {/* Design system showcase (dev only) */}
                {import.meta.env.DEV && (
                  <Route path="/design-system" element={<DesignSystemPage />} />
                )}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </div>
        </div>
      </ThemeProvider>
    </ToastProvider>
  );
}

export default App;
