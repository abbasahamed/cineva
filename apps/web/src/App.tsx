import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './components/Toast.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { LandingPage } from './pages/LandingPage.js';
import { CreateRoomPage } from './pages/CreateRoomPage.js';
import { JoinRoomPage } from './pages/JoinRoomPage.js';
import { WatchRoomPage } from './pages/WatchRoomPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { DiagnosticsPage } from './pages/DiagnosticsPage.js';
import { CameraStressPage } from './pages/CameraStressPage.js';
import { WebRTCCameraPage } from './pages/WebRTCCameraPage.js';
import { MovieCameraPage } from './pages/MovieCameraPage.js';
import { DesignSystemPage } from './pages/DesignSystemPage.js';

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ThemeProvider>
          <div className="relative min-h-screen bg-[#09090b] text-[#f5f5f7] selection:bg-white/20 selection:text-white overflow-x-hidden">
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
                      <Route path="/design-system" element={<DesignSystemPage />} />
                    </>
                  )}
                  {/* Dedicated 404 Route */}
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </BrowserRouter>
            </div>
          </div>
        </ThemeProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
