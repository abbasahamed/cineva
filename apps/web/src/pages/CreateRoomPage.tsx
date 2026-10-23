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
import { AmbientBackground } from '../components/AmbientBackground.js';

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
  const dropzoneRef = useRef<HTMLDivElement>(null);
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

  // Cancel action
  const handleCancel = async () => {
    isCancelledRef.current = true;
    if (activeRoomRef.current) {
      const { roomId, sessionId } = activeRoomRef.current;
      activeRoomRef.current = null;
      await abortRoom(roomId, sessionId).catch(() => {});
    }
    setIsPreparing(false);
    setIsReady(false);
    setCurrentStage(0);
    setProgressBarWidth(0);
    setProgressStateText('Uploading');
    setEtaText('');
    setCreatedRoomCode(null);
  };

  // Copy invite link action
  const handleCopyLink = async () => {
    if (!inviteLink) return;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(inviteLink);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let valid = true;

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setNameError('Enter a name so your friends know who you are.');
      valid = false;
    } else {
      setNameError('');
    }

    if (!selectedFile && !isSample) {
      setFileError('Add a movie to start the room.');
      valid = false;
    }

    if (!valid) {
      if (!trimmedName) {
        nameInputRef.current?.focus();
      } else {
        dropzoneRef.current?.focus();
      }
      return;
    }

    // Switch to preparing UI
    setIsPreparing(true);
    setIsReady(false);
    setCurrentStage(0);
    setProgressBarWidth(0);
    setProgressStateText('Uploading');
    setEtaText('');
    isCancelledRef.current = false;
    uploadStartTimeRef.current = Date.now();

    try {
      // 1. If Sample Video was selected
      if (isSample) {
        setCurrentStage(0);
        setProgressStateText('Uploading');
        setProgressBarWidth(30);

        const demoResult = await createDemoRoom(trimmedName);
        if (isCancelledRef.current) return;

        sessionStorage.setItem(`cineva_session_${demoResult.room.roomCode}`, demoResult.hostSessionId);
        sessionStorage.setItem(`sw_name_${demoResult.room.roomCode}`, trimmedName);
        setCreatedRoomCode(demoResult.room.roomCode);

        // Advance through Analyzing -> Ready
        setCurrentStage(1);
        setProgressStateText('Analyzing');
        setProgressBarWidth(65);

        await new Promise((r) => setTimeout(r, 400));
        if (isCancelledRef.current) return;

        setCurrentStage(4);
        setProgressBarWidth(100);
        setProgressStateText('Ready');
        setEtaText('');
        setIsReady(true);

        const publicBase = (await getPublicUrl()) || window.location.origin;
        setInviteLink(`${publicBase}/room/${demoResult.room.roomCode}`);
        return;
      }

      // 2. Real file upload flow
      if (!selectedFile) return;

      const title = roomTitle.trim() || selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

      // Create room on server
      const roomResult = await createRoom({
        displayName: trimmedName,
        roomName: title,
        allowGuestControl,
      });

      if (isCancelledRef.current) return;

      activeRoomRef.current = {
        roomId: roomResult.room.id,
        sessionId: roomResult.hostSessionId,
        roomCode: roomResult.room.roomCode,
      };

      sessionStorage.setItem(`cineva_session_${roomResult.room.roomCode}`, roomResult.hostSessionId);
      sessionStorage.setItem(`sw_name_${roomResult.room.roomCode}`, trimmedName);
      setCreatedRoomCode(roomResult.room.roomCode);

      // Start socket connection to listen for real server transcode events
      const socket = socketService.connect();
      socketService.joinRoom(roomResult.room.roomCode, trimmedName, roomResult.hostSessionId);

      // Listen for server media events
      const handleMediaProgress = (data: any) => {
        if (isCancelledRef.current) return;
        const stageStr = (data.stage || '').toLowerCase();
        if (stageStr.includes('analyz')) {
          setCurrentStage(1);
          setProgressStateText('Analyzing');
        } else if (stageStr.includes('convert') || stageStr.includes('transcod') || data.progress > 25) {
          setCurrentStage(2);
          setProgressStateText('Converting');
        }
        if (typeof data.progress === 'number') {
          // Server conversion progress is between 25% and 99%
          const pct = Math.max(0, Math.min(100, data.progress));
          setProgressBarWidth(pct);
          if (pct < 100) {
            const minLeft = Math.max(1, Math.round((100 - pct) / 9));
            setEtaText(`About ${minLeft} min left`);
          }
        }
      };

      const handleMediaReady = async () => {
        if (isCancelledRef.current) return;
        setCurrentStage(4);
        setProgressBarWidth(100);
        setProgressStateText('Ready');
        setEtaText('');
        setIsReady(true);
        activeRoomRef.current = null; // Successfully prepared, no longer needs abort beacon

        const publicBase = (await getPublicUrl()) || window.location.origin;
        setInviteLink(`${publicBase}/room/${roomResult.room.roomCode}`);
      };

      const handleMediaFailed = (errData: any) => {
        if (isCancelledRef.current) return;
        setFileError(errData?.error || 'Failed to prepare video for browser playback.');
        handleCancel();
      };

      socket.on(SOCKET_EVENTS.MEDIA_PROGRESS, handleMediaProgress);
      socket.on(SOCKET_EVENTS.MEDIA_READY, handleMediaReady);
      socket.on(SOCKET_EVENTS.MEDIA_FAILED, handleMediaFailed);

      // Upload file directly via multipart
      const isMkv = /\.mkv$/i.test(selectedFile.name);

      await uploadMedia(
        roomResult.room.id,
        roomResult.hostSessionId,
        selectedFile,
        title,
        (pct, info) => {
          if (isCancelledRef.current) throw new Error('Upload cancelled');
          // Scale upload progress: if file needs conversion, upload is 0-50% overall
          const displayPct = isMkv ? Math.round(pct * 0.45) : pct;
          setProgressBarWidth(displayPct);
          setCurrentStage(0);
          setProgressStateText('Uploading');

          if (info && info.uploadedBytes > 0 && info.totalBytes > info.uploadedBytes) {
            const elapsedSec = (Date.now() - uploadStartTimeRef.current) / 1000;
            const bytesPerSec = info.uploadedBytes / Math.max(0.1, elapsedSec);
            const remainingSec = (info.totalBytes - info.uploadedBytes) / Math.max(1, bytesPerSec);
            if (remainingSec > 60) {
              setEtaText(`About ${Math.max(1, Math.round(remainingSec / 60))} min left`);
            } else {
              setEtaText(`About ${Math.max(1, Math.round(remainingSec))} sec left`);
            }
          }
        }
      );

      if (isCancelledRef.current) return;

      // Upload complete! Now analyzing media
      setCurrentStage(1);
      setProgressStateText('Analyzing');
      setEtaText('Analyzing video streams...');

      if (!isMkv) {
        // Direct play file (MP4/WebM) - server finishes analysis rapidly
        // Give a short visual beat so the user clearly sees analyzing stage finish
        setTimeout(async () => {
          if (isCancelledRef.current) return;
          setCurrentStage(4);
          setProgressBarWidth(100);
          setProgressStateText('Ready');
          setEtaText('');
          setIsReady(true);
          activeRoomRef.current = null;

          const publicBase = (await getPublicUrl()) || window.location.origin;
          setInviteLink(`${publicBase}/room/${roomResult.room.roomCode}`);
        }, 600);
      }
    } catch (err: any) {
      if (activeRoomRef.current) {
        const { roomId, sessionId } = activeRoomRef.current;
        activeRoomRef.current = null;
        await abortRoom(roomId, sessionId).catch(() => {});
      }
      setIsPreparing(false);
      setIsReady(false);
      setFileError(err.message || 'Failed to create room.');
    }
  };

  const STAGES = ['Uploading', 'Analyzing', 'Converting', 'Ready'];

  return (
    <>
      <AmbientBackground variant="ambient" still={true} />

      <div className="wrap">
        <header className="top">
          <Link to="/" className="logo" aria-label="Cineva home">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="16" rx="3.5" />
              <path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5" />
            </svg>
            Cineva
          </Link>
          <Link to="/join" className="pill glass" onPointerMove={handlePointerMove}>
            Join a room
          </Link>
        </header>

        <main className="page">
          <div>
            <h1>Set up your room</h1>
            <p className="lead">
              Add a movie and pick a name. You’ll get a link and a code to send to your friends.
            </p>
            <ul className="facts">
              <li>
                <b>MKV, MP4, WebM and MOV</b> files up to 5 GB
              </li>
              <li>
                <b>MKV files are converted</b> for you, with progress shown
              </li>
              <li>
                <b>The file is deleted</b> when the room closes
              </li>
            </ul>
          </div>

          <section
            className="card glass"
            id="card"
            ref={cardRef}
            aria-live="polite"
            onPointerMove={handlePointerMove}
          >
            {/* Form state */}
            {!isPreparing ? (
              <form id="form" noValidate onSubmit={handleSubmit}>
                <h2>Create a room</h2>
                <p className="hint">Only people with the link or code can join.</p>

                <div className="field">
                  <label htmlFor="name">Your name</label>
                  <input
                    ref={nameInputRef}
                    className="input"
                    id="name"
                    placeholder="Alex"
                    autoComplete="nickname"
                    maxLength={30}
                    value={displayName}
                    aria-invalid={!!nameError}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      if (nameError) setNameError('');
                    }}
                  />
                  <p className="msg" id="nameErr" role="alert">
                    {nameError}
                  </p>
                </div>

                <div className="field" style={{ marginTop: 6 }}>
                  <label htmlFor="title">
                    Room name <small>(optional)</small>
                  </label>
                  <input
                    className="input"
                    id="title"
                    placeholder="Friday movie night"
                    maxLength={60}
                    value={roomTitle}
                    onChange={(e) => setRoomTitle(e.target.value)}
                  />
                </div>

                <div className="field">
                  <span className="label" id="mlabel">
                    Movie
                  </span>

                  {/* Dropzone */}
                  {!selectedFile && !isSample ? (
                    <div
                      ref={dropzoneRef}
                      className={`drop ${isDragOver ? 'over' : ''}`.trim()}
                      id="drop"
                      tabIndex={0}
                      aria-labelledby="mlabel"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).id !== 'sample') {
                          filePickerRef.current?.click();
                        }
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
                      <div className="ico">
                        <svg viewBox="0 0 24 24">
                          <path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 15v2.5A2.5 2.5 0 007.5 20h9a2.5 2.5 0 002.5-2.5V15" />
                        </svg>
                      </div>
                      <strong>Drop a video here, or browse</strong>
                      <span>MKV, MP4, WebM, MOV</span>
                      <button
                        type="button"
                        id="sample"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectFile(null, true);
                        }}
                      >
                        Use the sample video instead
                      </button>
                    </div>
                  ) : (
                    /* Selected file row */
                    <div className="file" id="file">
                      <div className="ico">
                        <svg viewBox="0 0 24 24">
                          <rect x="3" y="5" width="18" height="14" rx="3" />
                          <path d="M10 9.5l5 2.5-5 2.5z" />
                        </svg>
                      </div>
                      <div className="meta">
                        <div className="name" id="fname">
                          {isSample ? 'Sample video' : selectedFile?.name}
                        </div>
                        <div className="sub" id="fsub">
                          {isSample
                            ? 'Ready to play'
                            : selectedFile
                            ? `${formatFileSize(selectedFile.size)} · ${
                                /\.mkv$/i.test(selectedFile.name)
                                  ? 'Will be converted for browsers'
                                  : 'Ready to play'
                              }`
                            : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="x"
                        id="remove"
                        aria-label="Remove file"
                        onClick={() => handleSelectFile(null, false)}
                      >
                        <svg viewBox="0 0 24 24">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </div>
                  )}

                  <input
                    ref={filePickerRef}
                    type="file"
                    id="picker"
                    accept="video/*,.mkv"
                    hidden
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleSelectFile(e.target.files[0], false);
                      }
                    }}
                  />
                  <p className="msg" id="fileErr" role="alert">
                    {fileError}
                  </p>
                </div>

                <div className="switch">
                  <span>
                    Guests can play, pause and skip
                    <small>Turn off to keep the controls to yourself.</small>
                  </span>
                  <button
                    type="button"
                    className="sw"
                    id="ctrl"
                    role="switch"
                    aria-checked={allowGuestControl}
                    aria-label="Guests can control playback"
                    onClick={() => setAllowGuestControl(!allowGuestControl)}
                  />
                </div>

                <button className="btn" type="submit">
                  Create room
                </button>
              </form>
            ) : (
              /* Preparing panel */
              <div className="prep" id="prep">
                <h2 id="ptitle">{isReady ? 'Your room is ready' : 'Getting your movie ready'}</h2>
                <p className="hint" id="pfile">
                  {isSample ? 'Sample video' : selectedFile?.name}
                </p>

                <div className="bar">
                  <i id="pbar" style={{ width: `${progressBarWidth}%` }} />
                </div>

                <div className="pmeta">
                  <span id="pstate">{progressStateText}</span>
                  <span id="peta">{etaText}</span>
                </div>

                <div className="stages" id="stages">
                  {STAGES.map((s, n) => {
                    const c = n < currentStage ? 'done' : n === currentStage ? 'now' : '';
                    return (
                      <div key={s} className={`stage ${c}`.trim()}>
                        <span className="d">
                          <svg viewBox="0 0 24 24">
                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                          </svg>
                        </span>
                        {s}
                      </div>
                    );
                  })}
                </div>

                {isReady && (
                  <div id="ready">
                    <div className="share">
                      <input
                        className="input"
                        id="link"
                        readOnly
                        aria-label="Invite link"
                        value={inviteLink}
                      />
                      <button
                        className="btn"
                        type="button"
                        id="copy"
                        onClick={handleCopyLink}
                      >
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <button
                      className="btn"
                      type="button"
                      style={{ marginTop: 14 }}
                      onClick={() => {
                        if (createdRoomCode) {
                          navigate(`/room/${createdRoomCode}`);
                        }
                      }}
                    >
                      Enter the room
                    </button>
                  </div>
                )}

                {!isReady && (
                  <button
                    className="btn ghost"
                    type="button"
                    id="cancel"
                    onClick={handleCancel}
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </>
  );
};
