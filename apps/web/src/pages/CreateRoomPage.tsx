import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createRoom,
  createDemoRoom,
  uploadMedia,
  abortRoom,
  sendAbortBeacon,
} from '../services/api.js';
import {
  getRoomInviteUrl,
  shareOnWhatsApp,
  copyToClipboard,
  isPrivateAddress,
} from '../utils/inviteUtils.js';
import { socketService } from '../services/socket.js';
import { SOCKET_EVENTS } from '@cineva/shared';
import { LiquidGlassCursor } from '../components/LiquidGlassCursor';

export const CreateRoomPage: React.FC = () => {
  const navigate = useNavigate();

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [roomTitle, setRoomTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [allowGuestControl, setAllowGuestControl] = useState(false);

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
  const [copyError, setCopyError] = useState('');
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);
  const [lanInviteLink, setLanInviteLink] = useState('');

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
    if (file && file.size > 15 * 1073741824) {
      setFileError('This file is over 15 GB. Choose a smaller one.');
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
    if (!createdRoomCode) return;
    try {
      const link = await getRoomInviteUrl(createdRoomCode, {
        forceRefresh: !inviteLink || isPrivateAddress(inviteLink),
      });
      const ok = await copyToClipboard(link);
      if (ok) {
        setInviteLink(link);
        setCopied(true);
        setCopyError('');
        setTimeout(() => setCopied(false), 2000);
      } else {
        setCopyError('Failed to copy link to clipboard');
      }
    } catch (err: any) {
      setCopyError(err.message || 'Public invite link unavailable: active public tunnel or deployed domain required.');
    }
  };

  const handleWhatsAppShare = async () => {
    if (!createdRoomCode) return;
    try {
      const link = await getRoomInviteUrl(createdRoomCode, {
        forceRefresh: !inviteLink || isPrivateAddress(inviteLink),
      });
      setInviteLink(link);
      setCopyError('');
      const win = shareOnWhatsApp(link);
      if (!win) {
        setCopyError('Popup blocked: please allow popups to open WhatsApp.');
      }
    } catch (err: any) {
      setCopyError(err.message || 'Public invite link unavailable: active public tunnel or deployed domain required.');
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

        try {
          const invite = await getRoomInviteUrl(demoResult.room.roomCode);
          if (invite && !isPrivateAddress(invite)) {
            setInviteLink(invite);
          }
        } catch {
          // Public link will be resolved on demand or prompt error when user clicks copy/whatsapp
        }

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
        try {
          const invite = await getRoomInviteUrl(roomResult.room.roomCode);
          if (invite && !isPrivateAddress(invite)) {
            setInviteLink(invite);
          }
        } catch {
          // Public link will be resolved on demand or prompt error when user clicks copy/whatsapp
        }

        try {
          const lan = await getRoomInviteUrl(roomResult.room.roomCode, { useLan: true });
          if (lan) {
            setLanInviteLink(lan);
          }
        } catch {}

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

        try {
          const invite = await getRoomInviteUrl(roomResult.room.roomCode);
          if (invite && !isPrivateAddress(invite)) {
            setInviteLink(invite);
          }
        } catch {
          // Public link will be resolved on demand or prompt error when user clicks copy/whatsapp
        }

        try {
          const lan = await getRoomInviteUrl(roomResult.room.roomCode, { useLan: true });
          if (lan) {
            setLanInviteLink(lan);
          }
        } catch {}

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
    <div className="create-root min-h-screen flex flex-col items-center justify-center p-5 sm:p-8 relative overflow-x-hidden text-white selection:bg-[#0A84FF]/25 selection:text-white">
      {/* Liquid Glass Interactive Cursor */}
      <LiquidGlassCursor />

      {/* Controlled Atmospheric Ambient Background (Electric Cobalt #1E45FB & Chartreuse Lime #CDF22B) */}
      <div className="landing-aurora" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>

      <main className="app-shell relative z-10">
        {/* Back to Home navigation */}
        <Link to="/" className="top-nav lg-nav" onPointerMove={handlePointerMove}>
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

        {/* Create Watch Room Card - Prominent Frosted Glass Panel */}
        <section ref={cardRef} className="card create-card" onPointerMove={handlePointerMove}>
          <div className="badge">
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
                    if (fileError) setFileError('');
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
                  onChange={(e) => {
                    setRoomTitle(e.target.value);
                    if (fileError) setFileError('');
                  }}
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
                  <div className="dropzone-sub">MP4, WebM, MKV, MOV • up to 15 GB (or add inside room)</div>
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
        <div className="modal-box create-card">
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
                background: 'linear-gradient(90deg, #1E45FB, #CDF22B)',
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
        <div className="modal-box create-card">
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', marginTop: 16, width: '100%', maxWidth: '340px', margin: '16px auto 0' }}>
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <button
                type="button"
                className="btn frost"
                id="createCopyLinkBtn"
                style={{
                  flex: 1,
                  height: 38,
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  borderRadius: 12,
                }}
                onClick={handleCopy}
              >
                <span>{copied ? 'Copied Link!' : 'Copy Link'}</span>
              </button>
              <button
                type="button"
                className="btn"
                id="createWaShareBtn"
                style={{
                  flex: 1,
                  height: 38,
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  borderRadius: 12,
                  background: '#25D366',
                  color: '#072412',
                  border: 'none',
                }}
                onClick={handleWhatsAppShare}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.28-2.42 5.84-1.56 1.56-3.64 2.41-5.84 2.41-1.49 0-2.95-.39-4.23-1.15l-.3-.18-3.13.82.83-3.05-.2-.31a8.196 8.196 0 01-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.03-1.25-.75-.67-1.26-1.5-1.41-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.72 4.31 3.81.6.26 1.07.42 1.44.54.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.29z" />
                </svg>
                <span>WhatsApp</span>
              </button>
            </div>
            {copyError && (
              <p
                id="createCopyError"
                style={{
                  fontSize: 12,
                  color: '#fb7185',
                  marginTop: 8,
                  marginBottom: 10,
                  textAlign: 'center',
                  lineHeight: 1.4,
                }}
                role="alert"
              >
                {copyError}
              </p>
            )}
            {lanInviteLink && (
              <div style={{ width: '100%', marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
                <button
                  type="button"
                  className="btn frost"
                  style={{
                    width: '100%',
                    height: 32,
                    fontSize: 11,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    borderRadius: 10,
                  }}
                  onClick={async () => {
                    const ok = await copyToClipboard(lanInviteLink);
                    if (ok) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }
                  }}
                >
                  <span>Copy Local Wi-Fi Link</span>
                </button>
              </div>
            )}
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: 0, width: '100%' }}
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
