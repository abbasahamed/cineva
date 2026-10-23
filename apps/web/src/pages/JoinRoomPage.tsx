import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { joinRoom, checkRoom } from '../services/api.js';
import { AmbientBackground } from '../components/AmbientBackground.js';

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
      const next = [...boxes];
      next[idx - 1] = '';
      setBoxes(next);
      inputRefs.current[idx - 1]?.focus();
      setCodeBad(false);
      setCodeMsg(null);
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text') || '';
    fillCode(pasted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let ok = true;

    if (currentCode.length < 6) {
      setCodeBad(true);
      setCodeMsg({ text: 'Enter all six characters of the code.', isOk: false });
      ok = false;
      const firstEmpty = boxes.findIndex((b) => !b);
      inputRefs.current[firstEmpty !== -1 ? firstEmpty : 0]?.focus();
    }

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setNameError('Enter a name so your friends know who you are.');
      if (ok) {
        nameInputRef.current?.focus();
      }
      ok = false;
    } else {
      setNameError('');
    }

    if (!ok) return;

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
          <Link to="/create" className="pill glass" onPointerMove={handlePointerMove}>
            Create a room
          </Link>
        </header>

        <main className="page">
          <div>
            <h1>Join your friends</h1>
            <p className="lead">
              Enter the six-character code your host sent you. Add a name and you’re in.
            </p>
            <ul className="facts">
              <li>
                <b>No account</b> needed
              </li>
              <li>
                <b>Camera and mic</b> are off until you turn them on
              </li>
              <li>
                <b>Your audio and subtitle choices</b> stay yours
              </li>
            </ul>
          </div>

          <section className="card glass" onPointerMove={handlePointerMove}>
            <form id="form" noValidate onSubmit={handleSubmit}>
              <h2>Join a room</h2>
              <p className="hint">The code is on the host’s invite link.</p>

              <div className="field">
                <span className="label" id="clabel">
                  Room code
                </span>
                <div
                  className={`code ${codeBad ? 'bad' : ''}`.trim()}
                  id="code"
                  role="group"
                  aria-labelledby="clabel"
                >
                  {boxes.map((val, idx) => (
                    <input
                      key={idx}
                      ref={(el) => (inputRefs.current[idx] = el)}
                      aria-label={`Character ${idx + 1}`}
                      maxLength={1}
                      placeholder=" "
                      autoCapitalize="characters"
                      autoComplete="off"
                      value={val}
                      onChange={(e) => handleBoxChange(idx, e)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      onPaste={handlePaste}
                      onFocus={(e) => e.target.select()}
                    />
                  ))}
                </div>
                <p
                  className={`msg ${codeMsg?.isOk ? 'ok' : ''}`.trim()}
                  id="codeMsg"
                  role="status"
                  aria-live="polite"
                  style={{
                    color: codeMsg?.isChecking ? 'var(--text-2)' : undefined,
                  }}
                >
                  {codeMsg?.text || ''}
                </p>
              </div>

              <div className="field" style={{ marginTop: 0 }}>
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

              <button
                className="btn"
                type="submit"
                style={{ marginTop: 10 }}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Joining...' : 'Join room'}
              </button>
            </form>

            <p className="foot">
              Want to host instead? <Link to="/create">Create a room</Link>
            </p>
          </section>
        </main>
      </div>
    </>
  );
};
