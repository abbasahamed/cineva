import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { joinRoom, checkRoom } from '../services/api.js';

export const JoinRoomPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { roomCode: paramCode } = useParams<{ roomCode?: string }>();

  // Form state
  const [boxes, setBoxes] = useState<string[]>(['', '', '', '', '', '']);
  const [displayName, setDisplayName] = useState('');

  // Messages and UI states
  const [codeMsg, setCodeMsg] = useState<{ text: string; isOk: boolean; isChecking?: boolean } | null>(null);
  const [codeBad, setCodeBad] = useState(false);
  const [nameError, setNameError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refs
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const checkAbortControllerRef = useRef<AbortController | null>(null);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Pointer sheen tracker on glass card
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    target.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    target.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }, []);

  const cleanChars = (s: string) => s.replace(/[^a-z0-9]/gi, '').toUpperCase();
  const currentCode = boxes.join('');

  // Real room checking logic
  const performRoomCheck = useCallback(async (code: string) => {
    if (code.length !== 6) {
      setCodeMsg(null);
      setCodeBad(false);
      return;
    }

    setCodeBad(false);
    setCodeMsg({ text: 'Checking room…', isOk: false, isChecking: true });

    if (checkAbortControllerRef.current) {
      checkAbortControllerRef.current.abort();
    }
    checkAbortControllerRef.current = new AbortController();

    try {
      const res = await checkRoom(code);
      if (res.joinable) {
        setCodeBad(false);
        setCodeMsg({ text: 'Room found. Add your name to join.', isOk: true });
      } else if (res.status === 'ended' || res.status === 'expired') {
        setCodeBad(true);
        setCodeMsg({ text: 'This room has ended.', isOk: false });
      } else if (res.isFull) {
        setCodeBad(true);
        setCodeMsg({ text: 'This room is full.', isOk: false });
      } else {
        setCodeBad(true);
        setCodeMsg({ text: 'This room is not currently joinable.', isOk: false });
      }
    } catch (err: any) {
      setCodeBad(true);
      const msg = err.message || '';
      if (msg.includes('not found') || msg.includes('404')) {
        setCodeMsg({ text: "That room doesn't exist. Check the code.", isOk: false });
      } else {
        setCodeMsg({ text: 'Network error checking room. Check your connection.', isOk: false });
      }
    }
  }, []);

  const fillCode = useCallback(
    (val: string) => {
      const cleaned = cleanChars(val).slice(0, 6);
      const nextBoxes = ['', '', '', '', '', ''];
      for (let i = 0; i < cleaned.length; i++) {
        nextBoxes[i] = cleaned[i];
      }
      setBoxes(nextBoxes);

      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
      if (cleaned.length === 6) {
        performRoomCheck(cleaned);
      } else {
        setCodeMsg(null);
        setCodeBad(false);
      }

      const focusIdx = Math.min(cleaned.length, 5);
      inputRefs.current[focusIdx]?.focus();
    },
    [performRoomCheck]
  );

  // Initialize prefill from ?code= or route param
  useEffect(() => {
    const qCode = searchParams.get('code') || paramCode;
    if (qCode) {
      const cleaned = cleanChars(qCode).slice(0, 6);
      const nextBoxes = ['', '', '', '', '', ''];
      for (let i = 0; i < cleaned.length; i++) {
        nextBoxes[i] = cleaned[i];
      }
      setBoxes(nextBoxes);
      if (cleaned.length === 6) {
        performRoomCheck(cleaned);
      }
      nameInputRef.current?.focus();
    } else {
      inputRefs.current[0]?.focus();
    }
  }, [searchParams, paramCode, performRoomCheck]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
      if (checkAbortControllerRef.current) checkAbortControllerRef.current.abort();
    };
  }, []);

  const handleBoxChange = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = cleanChars(e.target.value);
    const char = raw.slice(-1);

    const next = [...boxes];
    next[idx] = char;
    setBoxes(next);

    const newCode = next.join('');
    if (char && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }

    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    if (newCode.length === 6) {
      checkTimeoutRef.current = setTimeout(() => {
        performRoomCheck(newCode);
      }, 250);
    } else {
      setCodeBad(false);
      setCodeMsg(null);
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !boxes[idx] && idx > 0) {
      e.preventDefault();
      const next = [...boxes];
      next[idx - 1] = '';
      setBoxes(next);
      inputRefs.current[idx - 1]?.focus();
      setCodeBad(false);
      setCodeMsg(null);
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < 5) {
      e.preventDefault();
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (text) {
      fillCode(text);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let hasError = false;
    const trimmedName = displayName.trim();

    if (currentCode.length !== 6) {
      setCodeBad(true);
      setCodeMsg({ text: 'Enter all six characters of the code.', isOk: false });
      hasError = true;
      const firstEmpty = boxes.findIndex((b) => !b);
      inputRefs.current[firstEmpty !== -1 ? firstEmpty : 0]?.focus();
    }

    if (!trimmedName) {
      setNameError('Enter your name so friends know who joined.');
      hasError = true;
      if (currentCode.length === 6) {
        nameInputRef.current?.focus();
      }
    } else {
      setNameError('');
    }

    if (hasError) return;

    try {
      setIsSubmitting(true);
      const existingSession = sessionStorage.getItem(`cineva_session_${currentCode}`) || undefined;

      const result = await joinRoom(currentCode, trimmedName, existingSession);

      sessionStorage.setItem(`cineva_session_${currentCode}`, result.sessionId);
      sessionStorage.setItem(`sw_name_${currentCode}`, trimmedName);

      navigate(`/room/${currentCode}`);
    } catch (err: any) {
      const msg = err.message || 'Failed to join room.';
      setCodeBad(true);
      if (msg.includes('not found') || msg.includes('404')) {
        setCodeMsg({ text: "That room doesn't exist. Check the code.", isOk: false });
      } else if (msg.includes('ended') || msg.includes('expired')) {
        setCodeMsg({ text: 'This watch room has ended.', isOk: false });
      } else if (msg.includes('full')) {
        setCodeMsg({ text: 'This watch room is full.', isOk: false });
      } else {
        setCodeMsg({ text: msg, isOk: false });
      }
    } finally {
      setIsSubmitting(false);
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
          <svg viewBox="0 0 24 24">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Back to Home</span>
        </Link>

        {/* Join Watch Room Card */}
        <section ref={cardRef} className="card lg" onPointerMove={handlePointerMove}>
          <div className="badge lg">
            <svg
              viewBox="0 0 24 24"
              style={{ width: 16, height: 16, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}
            >
              <path
                d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Join Watch Party</span>
          </div>

          <h1>Join a watch room</h1>
          <p className="subtitle">Enter the room code to sync up with your friends.</p>

          <form id="joinForm" autoComplete="off" noValidate onSubmit={handleSubmit}>
            <div className="form-group">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <label className="form-label" style={{ margin: 0 }}>
                  Room code
                </label>
                <span style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
                  6-CHAR CODE
                </span>
              </div>

              {/* 6 Character Cineva Input Grid */}
              <div className="code-grid" id="codeGrid">
                {boxes.map((val, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (inputRefs.current[idx] = el)}
                    className={`code-cell ${codeBad ? 'border-rose-500/60' : ''}`}
                    maxLength={1}
                    aria-label={`Character ${idx + 1}`}
                    autoFocus={idx === 0}
                    value={val}
                    onChange={(e) => handleBoxChange(idx, e)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    onPaste={handlePaste}
                    onFocus={(e) => e.target.select()}
                  />
                ))}
              </div>
              {codeMsg && (
                <p
                  className={`msg text-xs mt-2 ${
                    codeMsg.isOk
                      ? 'text-emerald-400'
                      : codeMsg.isChecking
                      ? 'text-slate-400'
                      : 'text-rose-400'
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  {codeMsg.text}
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="joinName">
                Your name
              </label>
              <div className="input-wrap">
                <input
                  ref={nameInputRef}
                  type="text"
                  id="joinName"
                  placeholder="Alex"
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

            <button
              type="submit"
              className="btn-primary"
              id="joinSubmit"
              disabled={isSubmitting}
            >
              <span>{isSubmitting ? 'Joining...' : 'Join Room'}</span>
            </button>

            <div className="footer-switch">
              <span>Want to host instead?</span>
              <Link to="/create">Create your own room &rarr;</Link>
            </div>
          </form>
        </section>
      </main>

      {/* Connecting Status Modal */}
      <div className={`modal-overlay ${isSubmitting ? 'open' : ''}`} id="modal">
        <div className="modal-box lg">
          <div className="spinner"></div>
          <h2>Connecting to Room...</h2>
          <p className="subtitle" style={{ marginTop: 6 }} id="statusText">
            Synchronizing clocks and video stream with host.
          </p>
        </div>
      </div>
    </div>
  );
};
