import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createRoom,
  createDemoRoom,
  uploadMedia,
  abortRoom,
  sendAbortBeacon,
  getPublicUrl,
} from '../services/api.js';
import { socketService } from '../services/socket.js';
import { SOCKET_EVENTS } from '@cineva/shared';

export const CreateRoomPage: React.FC = () => {
  const navigate = useNavigate();

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [roomTitle, setRoomTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [allowGuestControl, setAllowGuestControl] = useState(true);

  // Errors & UI states
  const [nameError, setNameError] = useState('');
  const [fileError, setFileError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  // Preparing / Ready state
  const [isPreparing, setIsPreparing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentStage, setCurrentStage] = useState(0); // 0: Uploading, 1: Analyzing, 2: Converting, 3: Ready, 4: All Done
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [progressStateText, setProgressStateText] = useState('Uploading');
  const [etaText, setEtaText] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);

  // Refs
  const nameInputRef = useRef<HTMLInputElement>(null);
  const filePickerRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const activeRoomRef = useRef<{ roomId: string; sessionId: string; roomCode: string } | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const uploadStartTimeRef = useRef<number>(0);

  // Pointer sheen tracker on card and pill links
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    target.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    target.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }, []);

  // Cleanup abandoned room on unexpected beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeRoomRef.current && !isReady) {
        const { roomId, sessionId } = activeRoomRef.current;
        sendAbortBeacon(roomId, sessionId);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isReady]);

  // Size helper matching prototype: b >= 1073741824 ? (b/1073741824).toFixed(1)+' GB' : (b/1048576).toFixed(0)+' MB'
  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1073741824) {
      return `${(bytes / 1073741824).toFixed(1)} GB`;
    }
    return `${(bytes / 1048576).toFixed(0)} MB`;
  };

  const handleSelectFile = (file: File | null, useSampleMedia = false) => {
    setFileError('');
    if (file && file.size > 5 * 1073741824) {
      setFileError('This file is over 5 GB. Choose a smaller one.');
      return;
    }

    setSelectedFile(file);
    setIsSample(useSampleMedia);

    if (filePickerRef.current && !file) {
      filePickerRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectFile(e.dataTransfer.files[0], false);
    }
  };

  const handleDropzoneKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      filePickerRef.current?.click();
    }
  };

  const handleEnterRoom = () => {
    if (createdRoomCode) {
      navigate(`/room/${createdRoomCode}`);
    }
  };

  const handleCopy = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = inviteLink;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCancel = async () => {
    isCancelledRef.current = true;
    if (activeRoomRef.current) {
      try {
        await abortRoom(activeRoomRef.current.roomId, activeRoomRef.current.sessionId);
      } catch (err) {
        console.warn('Failed to abort room:', err);
      }
      activeRoomRef.current = null;
    }
    setIsPreparing(false);
    setIsReady(false);
    setCurrentStage(0);
    setProgressBarWidth(0);
    setProgressStateText('Uploading');
    setEtaText('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let hasError = false;
    const trimmedName = displayName.trim();

    if (!trimmedName) {
      setNameError('Enter a name so your friends know who you are.');
      hasError = true;
      nameInputRef.current?.focus();
    } else {
      setNameError('');
    }

    setFileError('');

    if (hasError) return;

    setIsPreparing(true);
    setIsReady(false);
    isCancelledRef.current = false;
    setCurrentStage(0);
    setProgressBarWidth(5);
    setProgressStateText('Creating room');
    setEtaText('');
    uploadStartTimeRef.current = Date.now();

    try {
      if (isSample) {
        // Fast path: Server-side synthetic demo room with pre-converted sample video
        const demoResult = await createDemoRoom(trimmedName);
        if (isCancelledRef.current) return;

        activeRoomRef.current = {
          roomId: demoResult.room.id,
          sessionId: demoResult.hostSessionId,
          roomCode: demoResult.room.roomCode,
        };
        setCreatedRoomCode(demoResult.room.roomCode);

        // Store host credentials for /room/:code
        sessionStorage.setItem(`cineva_session_${demoResult.room.roomCode}`, demoResult.hostSessionId);
        sessionStorage.setItem(`sw_name_${demoResult.room.roomCode}`, trimmedName);

        // Animate fast preparation stages matching prototype
        setProgressBarWidth(40);
        setCurrentStage(1);
        setProgressStateText('Analyzing');
        setEtaText('Checking audio and subtitle tracks…');

        await new Promise((r) => setTimeout(r, 450));
        if (isCancelledRef.current) return;

        setProgressBarWidth(80);
        setCurrentStage(2);
        setProgressStateText('Converting');
        setEtaText('Almost ready…');

        await new Promise((r) => setTimeout(r, 400));
        if (isCancelledRef.current) return;

        setProgressBarWidth(100);
        setCurrentStage(3);
        setProgressStateText('Ready');
        setEtaText('');

        let publicBase = window.location.origin;
        try {
          const pubUrl = await getPublicUrl();
          if (pubUrl) publicBase = pubUrl;
        } catch {
          // fallback to origin
        }
        setInviteLink(`${publicBase}/join/${demoResult.room.roomCode}`);

        await new Promise((r) => setTimeout(r, 300));
        if (isCancelledRef.current) return;
        setIsReady(true);
      } else if (selectedFile) {
        // Real File Path: 1. Create room -> 2. Upload with XHR progress -> 3. Transcode pipeline
        const roomResult = await createRoom({
          displayName: trimmedName,
          roomName: roomTitle.trim() || `${trimmedName}'s Room`,
          allowGuestControl,
        });
        if (isCancelledRef.current) return;

        activeRoomRef.current = {
          roomId: roomResult.room.id,
          sessionId: roomResult.hostSessionId,
          roomCode: roomResult.room.roomCode,
        };
        setCreatedRoomCode(roomResult.room.roomCode);

        // Store host credentials
        sessionStorage.setItem(`cineva_session_${roomResult.room.roomCode}`, roomResult.hostSessionId);
        sessionStorage.setItem(`sw_name_${roomResult.room.roomCode}`, trimmedName);

        // Resolve public base invite URL
        let publicBase = window.location.origin;
        try {
          const pubUrl = await getPublicUrl();
          if (pubUrl) publicBase = pubUrl;
        } catch {
          // fallback to origin
        }
        setInviteLink(`${publicBase}/join/${roomResult.room.roomCode}`);

        // Upload media with real progress tracking
        await uploadMedia(
          roomResult.room.id,
          roomResult.hostSessionId,
          selectedFile,
          selectedFile.name,
          (pct: number) => {
            if (isCancelledRef.current) return;
            const uploadMapped = Math.round(pct * 0.5); // 0..50%
            setProgressBarWidth(Math.max(5, uploadMapped));
            setCurrentStage(0);
            setProgressStateText('Uploading');

            const elapsedSec = (Date.now() - uploadStartTimeRef.current) / 1000;
            if (pct > 5 && elapsedSec > 1) {
              const totalSec = elapsedSec / (pct / 100);
              const remainingSec = Math.max(0, Math.round(totalSec - elapsedSec));
              const mins = Math.floor(remainingSec / 60);
              const secs = remainingSec % 60;
              setEtaText(`About ${mins > 0 ? `${mins}m ` : ''}${secs}s remaining`);
            }
          }
        );

        if (isCancelledRef.current) return;

        // Complete
        setProgressBarWidth(100);
        setCurrentStage(3);
        setProgressStateText('Ready');
        setEtaText('');

        await new Promise((r) => setTimeout(r, 400));
        if (isCancelledRef.current) return;
        setIsReady(true);
      } else {
        // Direct room creation without upfront movie upload
        const roomResult = await createRoom({
          displayName: trimmedName,
          roomName: roomTitle.trim() || `${trimmedName}'s Room`,
          allowGuestControl,
        });
        if (isCancelledRef.current) return;

        activeRoomRef.current = {
          roomId: roomResult.room.id,
          sessionId: roomResult.hostSessionId,
          roomCode: roomResult.room.roomCode,
        };
        setCreatedRoomCode(roomResult.room.roomCode);

        // Store host credentials
        sessionStorage.setItem(`cineva_session_${roomResult.room.roomCode}`, roomResult.hostSessionId);
        sessionStorage.setItem(`sw_name_${roomResult.room.roomCode}`, trimmedName);

        let publicBase = window.location.origin;
        try {
          const pubUrl = await getPublicUrl();
          if (pubUrl) publicBase = pubUrl;
        } catch {
          // fallback to origin
        }
        setInviteLink(`${publicBase}/join/${roomResult.room.roomCode}`);

        setProgressBarWidth(100);
        setCurrentStage(3);
        setProgressStateText('Ready');
        setEtaText('');
        setIsReady(true);
      }
    } catch (err: any) {
      if (isCancelledRef.current) return;
      console.error('Room creation failed:', err);
      setIsPreparing(false);
      setIsReady(false);
      setFileError(err.message || 'Failed to create room. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-5 sm:p-8 relative overflow-x-hidden selection:bg-[#7c6cfb]/30">
      {/* 4-Orb Screen-Blended Aurora (Liquid Glass 2.0) */}
      <div className="aurora" aria-hidden="true">
        <div className="aurora-layer">
          <i id="orb1"></i>
          <i id="orb2"></i>
          <i id="orb3"></i>
          <i id="orb4"></i>
        </div>
      </div>

      <main className="app-shell">
        {/* Back to Home navigation */}
        <Link to="/" className="top-nav lg" onPointerMove={handlePointerMove}>
          <svg
            viewBox="0 0 24 24"
            width={18}
            height={18}
            style={{ width: 18, height: 18, stroke: 'currentColor', fill: 'none', strokeWidth: 2, flexShrink: 0 }}
          >
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Back to Home</span>
        </Link>

        {/* Create Watch Room Card */}
        <section ref={cardRef} className="card lg" onPointerMove={handlePointerMove}>
          <div className="badge lg">
            <span className="dot"></span>
            <span>Host Studio · 4K Sync</span>
          </div>

          <h1>Create your watch room</h1>
          <p className="subtitle">Set up your room, drop an authorized video, and invite your friends.</p>

          <form id="createForm" autoComplete="off" noValidate onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="displayName">
                Your display name
              </label>
              <div className="input-wrap">
                <input
                  ref={nameInputRef}
                  type="text"
                  id="displayName"
                  placeholder="e.g. Alex"
                  required
                  maxLength={30}
                  value={displayName}
                  aria-invalid={!!nameError}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    if (nameError) setNameError('');
                  }}
                />
              </div>
              {nameError && (
                <p className="msg text-rose-400 text-xs mt-1.5" role="alert">
                  {nameError}
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="roomTitle">
                Room title (optional)
              </label>
              <div className="input-wrap">
                <input
                  type="text"
                  id="roomTitle"
                  placeholder="e.g. Friday Movie Night"
                  maxLength={60}
                  value={roomTitle}
                  onChange={(e) => setRoomTitle(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Video source <span style={{ opacity: 0.6, fontWeight: 400 }}>(optional)</span>
              </label>

              <input
                ref={filePickerRef}
                type="file"
                id="videoFile"
                accept="video/mp4,video/webm,video/x-matroska,video/quicktime,.mkv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleSelectFile(e.target.files[0], false);
                  }
                }}
              />

              {/* Upload Dropzone */}
              {!selectedFile && !isSample ? (
                <div
                  className={`dropzone ${isDragOver ? 'dragover' : ''}`}
                  id="dropArea"
                  tabIndex={0}
                  aria-label="Drop video file or click to select"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('#sampleBtn')) return;
                    filePickerRef.current?.click();
                  }}
                  onKeyDown={handleDropzoneKeyDown}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                  }}
                  onDrop={handleDrop}
                >
                  <div className="upload-icon">
                    <svg viewBox="0 0 24 24">
                      <path
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="dropzone-title">Drag & drop your video here</div>
                  <div className="dropzone-sub">MP4, WebM, MKV, MOV • up to 5 GB (or add inside room)</div>
                  <button
                    type="button"
                    className="sample-btn"
                    id="sampleBtn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectFile(null, true);
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width={14}
                      height={14}
                      style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 2, flexShrink: 0 }}
                    >
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <span>Or use sample HD demo video</span>
                  </button>
                </div>
              ) : (
                /* Loaded file indicator */
                <div className="loaded-chip active" id="loadedChip">
                  <div className="info">
                    <span className="tag">Ready</span>
                    <span className="fname" id="fileNameDisplay">
                      {isSample ? 'Sample video' : selectedFile?.name}
                    </span>
                    <span className="sub text-xs text-slate-400 ml-2" id="fsub">
                      {isSample
                        ? 'Ready to play'
                        : selectedFile
                        ? `${formatFileSize(selectedFile.size)} · ${
                            /\.mkv$/i.test(selectedFile.name)
                              ? 'Will be converted for browsers'
                              : 'Ready to play'
                          }`
                        : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="remove-file"
                    id="removeFile"
                    aria-label="Remove video"
                    onClick={() => handleSelectFile(null, false)}
                  >
                    &times;
                  </button>
                </div>
              )}
              {fileError && (
                <p className="msg text-rose-400 text-xs mt-1.5" role="alert">
                  {fileError}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="btn-primary"
              id="submitBtn"
              disabled={isPreparing}
            >
              <span>{isPreparing ? 'Preparing Room...' : 'Create Room'}</span>
            </button>

            <div className="footer-switch">
              <span>Already have an invite code?</span>
              <Link to="/join">Join a room &rarr;</Link>
            </div>
          </form>
        </section>
      </main>

      {/* Preparing Video / Transcoding Modal */}
      <div className={`modal-overlay ${isPreparing && !isReady ? 'open' : ''}`} id="preparingModal">
        <div className="modal-box lg">
          <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
          <h2>Preparing Screening...</h2>
          <p className="subtitle" style={{ marginTop: 6 }}>
            {progressStateText} {etaText && `· ${etaText}`}
          </p>
          <div
            style={{
              width: '100%',
              height: 6,
              borderRadius: 99,
              background: 'rgba(255,255,255,0.1)',
              marginTop: 20,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progressBarWidth}%`,
                background: 'linear-gradient(90deg, #7b6bff, #6ee7a0)',
                transition: 'width 0.3s ease',
              }}
            ></div>
          </div>
          <button
            type="button"
            className="btn frost"
            style={{
              marginTop: 20,
              height: 36,
              padding: '0 20px',
              borderRadius: 99,
              border: '1px solid rgba(255,255,255,0.15)',
            }}
            onClick={handleCancel}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Room Created Success Modal */}
      <div className={`modal-overlay ${isReady ? 'open' : ''}`} id="modal">
        <div className="modal-box lg">
          <div className="modal-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2>Your Watch Room is Ready!</h2>
          <p className="subtitle" style={{ marginTop: 6 }}>
            Share this code with your friends to sync playback.
          </p>
          <div>
            <span className="modal-code" id="modalCodeDisplay">
              {createdRoomCode || 'CN-8892'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14 }}>
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: 0 }}
              onClick={handleEnterRoom}
            >
              Enter Theater
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
