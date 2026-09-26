import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast.js';
import { LandingPage } from './pages/LandingPage.js';
import { CreateRoomPage } from './pages/CreateRoomPage.js';
import { JoinRoomPage } from './pages/JoinRoomPage.js';
import { WatchRoomPage } from './pages/WatchRoomPage.js';

export function App() {
  return (
    <ToastProvider>
      <div className="relative min-h-screen bg-[#040508] text-slate-100 selection:bg-brand-500/30 selection:text-brand-200 overflow-x-hidden">
        <div className="relative z-10">
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/create" element={<CreateRoomPage />} />
              <Route path="/join" element={<JoinRoomPage />} />
              <Route path="/join/:roomCode" element={<JoinRoomPage />} />
              <Route path="/room/:roomCode" element={<WatchRoomPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </div>
      </div>
    </ToastProvider>
  );
}

export default App;
