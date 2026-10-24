import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  // Refraction feature check
  useEffect(() => {
    try {
      if (
        CSS.supports('backdrop-filter', 'url(#lens)') &&
        !window.matchMedia('(prefers-reduced-transparency: reduce)').matches
      ) {
        document.documentElement.classList.add('refract');
      }
    } catch {
      // Ignore CSS.supports error
    }
  }, []);

  // Scrolled state for navigation pill
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 24);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Pointer light tracking on all .lg, .tc, .card-glass elements
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const target = (e.target as HTMLElement)?.closest?.('.lg, .tc, .glass, .pill-glass') as HTMLElement | null;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      target.style.setProperty('--my', `${e.clientY - rect.top}px`);
    };

    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => document.removeEventListener('pointermove', handlePointerMove);
  }, []);

  // 3D device tilt on hover
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const deviceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sw = stageWrapRef.current;
    const dev = deviceRef.current;
    if (!sw || !dev) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasHover = window.matchMedia('(hover: hover)').matches;
    if (prefersReducedMotion || !hasHover) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = sw.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      dev.style.setProperty('--ry', `${x * 9}deg`);
      dev.style.setProperty('--rx', `${4 - y * 8}deg`);
    };

    const handleMouseLeave = () => {
      dev.style.setProperty('--ry', '0deg');
      dev.style.setProperty('--rx', '4deg');
    };

    sw.addEventListener('mousemove', handleMouseMove);
    sw.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      sw.removeEventListener('mousemove', handleMouseMove);
      sw.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  // Reveal on scroll
  useEffect(() => {
    const rvElements = document.querySelectorAll('.rv');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    rvElements.forEach((el, i) => {
      (el as HTMLElement).style.transitionDelay = `${(i % 3) * 90}ms`;
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // Interactive Seek Bar Demo in Hero Device
  const TOTAL_DURATION_SEC = 7350; // 2:02:30
  const [currentSec, setCurrentSec] = useState(2472); // 41:12
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekToast, setSeekToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (h > 0) {
      return `${h}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  };

  const showToast = (timeText: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setSeekToast(`You skipped to ${timeText}`);
    toastTimeoutRef.current = setTimeout(() => {
      setSeekToast(null);
    }, 2800);
  };

  const updateSeek = (clientX: number, barRect: DOMRect) => {
    const fraction = Math.max(0, Math.min(1, (clientX - barRect.left) / barRect.width));
    const newSec = Math.round(fraction * TOTAL_DURATION_SEC);
    setCurrentSec(newSec);
    showToast(formatTime(newSec));
  };

  const handleBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    setIsSeeking(true);
    updateSeek(e.clientX, rect);

    const onPointerMove = (moveEvent: PointerEvent) => {
      updateSeek(moveEvent.clientX, rect);
    };

    const onPointerUp = () => {
      setIsSeeking(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleBarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const nextSec = Math.max(0, currentSec - 10);
      setCurrentSec(nextSec);
      showToast(formatTime(nextSec));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextSec = Math.min(TOTAL_DURATION_SEC, currentSec + 10);
      setCurrentSec(nextSec);
      showToast(formatTime(nextSec));
    }
  };

  const progressPercent = Math.min(100, Math.max(0, (currentSec / TOTAL_DURATION_SEC) * 100));

  // Join Code Band Form
  const [codeBoxes, setCodeBoxes] = useState<string[]>(['', '', '', '', '', '']);
  const [codeError, setCodeError] = useState<string>('');
  const boxRefs = useRef<Array<HTMLInputElement | null>>([]);

  const handleBoxChange = (idx: number, val: string) => {
    const cleaned = val.replace(/[^a-zA-Z0-9]/gi, '').toUpperCase().slice(-1);
    setCodeError('');
    const newBoxes = [...codeBoxes];
    newBoxes[idx] = cleaned;
    setCodeBoxes(newBoxes);

    if (cleaned && idx < 5) {
      boxRefs.current[idx + 1]?.focus();
    }
  };

  const handleBoxKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codeBoxes[idx] && idx > 0) {
      e.preventDefault();
      const newBoxes = [...codeBoxes];
      newBoxes[idx - 1] = '';
      setCodeBoxes(newBoxes);
      boxRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      boxRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < 5) {
      boxRefs.current[idx + 1]?.focus();
    }
  };

  const handleBoxPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = (e.clipboardData.getData('text') || '').replace(/[^a-zA-Z0-9]/gi, '').toUpperCase().slice(0, 6);
    if (!text) return;
    const newBoxes = Array.from({ length: 6 }, (_, i) => text[i] || '');
    setCodeBoxes(newBoxes);
    const focusIdx = Math.min(text.length, 5);
    boxRefs.current[focusIdx]?.focus();
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = codeBoxes.join('');
    if (fullCode.length < 6) {
      setCodeError('Enter all six characters of the code.');
      const firstEmpty = codeBoxes.findIndex((b) => !b);
      boxRefs.current[firstEmpty !== -1 ? firstEmpty : 0]?.focus();
      return;
    }
    navigate(`/join?code=${encodeURIComponent(fullCode)}`);
  };

  return (
    <>
      {/* Liquid refraction SVG filter and iconography */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <filter id="lens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency=".009 .014" numOctaves={2} seed={7} result="n" />
            <feGaussianBlur in="n" stdDeviation={3} result="m" />
            <feDisplacementMap in="SourceGraphic" in2="m" scale={38} xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <symbol id="film" viewBox="0 0 24 24">
            <rect className="d" x="3" y="4" width="18" height="16" rx="4" />
            <rect x="3" y="4" width="18" height="16" rx="4" />
            <path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5" />
          </symbol>
          <symbol id="sync" viewBox="0 0 24 24">
            <circle className="d" cx="12" cy="12" r="9" />
            <path d="M20 12a8 8 0 01-13.7 5.6M4 12a8 8 0 0113.7-5.6M18 3v4h-4M6 21v-4h4" />
          </symbol>
          <symbol id="call" viewBox="0 0 24 24">
            <rect className="d" x="3" y="6" width="12" height="12" rx="3.5" />
            <rect x="3" y="6" width="12" height="12" rx="3.5" />
            <path d="M15 10.5l5.5-3v9l-5.5-3" />
          </symbol>
          <symbol id="lang" viewBox="0 0 24 24">
            <circle className="d" cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
          </symbol>
          <symbol id="file" viewBox="0 0 24 24">
            <path className="d" d="M6 3h8l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" />
            <path d="M6 3h8l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2zM14 3v5h5M9 14l2 2 4-4" />
          </symbol>
          <symbol id="lock" viewBox="0 0 24 24">
            <rect className="d" x="4" y="10" width="16" height="11" rx="3.5" />
            <rect x="4" y="10" width="16" height="11" rx="3.5" />
            <path d="M8 10V7a4 4 0 018 0v3M12 15v2.5" />
          </symbol>
          <symbol id="link" viewBox="0 0 24 24">
            <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
          </symbol>
          <symbol id="play" viewBox="0 0 24 24">
            <polygon points="7 4 19 12 7 20 7 4" fill="currentColor" />
          </symbol>
          <symbol id="up" viewBox="0 0 24 24">
            <path className="d" d="M12 3l-1 0" />
            <path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 15v2.5A2.5 2.5 0 007.5 20h9a2.5 2.5 0 002.5-2.5V15" />
          </symbol>
          <symbol id="user" viewBox="0 0 24 24">
            <circle className="d" cx="12" cy="8" r="4" />
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0116 0" />
          </symbol>
          <symbol id="pause" viewBox="0 0 24 24">
            <path d="M8 5v14M16 5v14" strokeWidth="2.4" />
          </symbol>
          <symbol id="cc" viewBox="0 0 24 24">
            <rect x="3" y="5" width="18" height="14" rx="4" />
            <path d="M7 11h3M13 11h4M7 15h5M15 15h2" />
          </symbol>
          <symbol id="full" viewBox="0 0 24 24">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </symbol>
        </defs>
      </svg>

      {/* Aurora Ambient Background */}
      <div className="aurora" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>

      {/* Floating Glass Nav Pill */}
      <header
        className={`nav lg ${isScrolled ? 'scrolled-body' : ''}`}
        style={{
          boxShadow: isScrolled
            ? 'inset 0 1px 1px rgba(255,255,255,0.7), 0 28px 70px -10px rgba(0,0,0,0.85)'
            : undefined,
          transition: 'box-shadow 0.3s var(--ease)',
        }}
      >
        <Link to="/" className="logo">
          <span className="mk">
            <svg className="ic">
              <use href="#film" />
            </svg>
          </span>
          Cineva
        </Link>
        <nav className="links" aria-label="Main">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#join">Join</a>
        </nav>
        <span style={{ display: 'flex', gap: 8 }}>
          <a className="btn g s lg" href="#join">
            Join room
          </a>
          <Link className="btn w s" to="/create">
            Create room
          </Link>
        </span>
      </header>

      <main>
        {/* Hero Section */}
        <div className="hero">
          <div className="wrap">
            <span className="pill lg">
              <b>New</b>Pick your own audio language and subtitles
            </span>
            <h1 aria-label="Watch movies together, even when you’re apart.">
              <span style={{ animationDelay: '.05s' }}>Watch</span>{' '}
              <span style={{ animationDelay: '.12s' }}>movies</span>{' '}
              <span style={{ animationDelay: '.19s' }}>together,</span>{' '}
              <span style={{ animationDelay: '.26s' }}>even</span>{' '}
              <span style={{ animationDelay: '.33s' }}>when</span>{' '}
              <span style={{ animationDelay: '.4s' }}>you’re</span>{' '}
              <span style={{ animationDelay: '.47s' }}>apart.</span>
            </h1>
            <p className="lead">
              Upload a movie, send a link, press play. Everyone sees the same frame at the same
              moment, and you can talk to each other while it plays.
            </p>
            <div className="cta">
              <Link className="btn w lgx" to="/create">
                <svg className="ic" style={{ width: 22, height: 22 }}>
                  <use href="#play" />
                </svg>
                Create a room
              </Link>
              <a className="btn g lgx lg" href="#join">
                Join with a code
              </a>
            </div>
            <div className="proof">
              <span className="avs">
                <i style={{ background: '#ffd9a0' }}>A</i>
                <i style={{ background: '#b8e0f2' }}>M</i>
                <i style={{ background: '#d8cdee' }}>D</i>
                <i style={{ background: '#ffc2dc' }}>S</i>
              </span>
              No accounts. Works in your browser.
            </div>

            {/* Hero Interactive Stage Device */}
            <div className="stagewrap" id="sw" ref={stageWrapRef}>
              <div className="device" id="dev" ref={deviceRef}>
                <div className="film" />
                <div className="sun" />
                <div className="dtop lg">
                  <span className="dot" />Friday Movie Night · Interstellar
                </div>
                <div className="dside lg">
                  <div className="tl">
                    <div className="tile" style={{ background: 'linear-gradient(145deg,#ffe3b0,#f0b860)' }}>
                      A<small>You</small>
                    </div>
                    <div className="tile sp" style={{ background: 'linear-gradient(145deg,#bfe6f7,#6fb0d2)' }}>
                      F<small>Friend</small>
                    </div>
                  </div>
                  <div className="chat">
                    <p>Is this the docking scene? 🚀</p>
                    <p className="me">Hold on tight, volume up!</p>
                    <p>Cooper, this is no time for caution! 🎶</p>
                  </div>
                </div>

                {/* Interactive Player Chrome with Seek Bar Demo */}
                <div className="dbar lg">
                  <div
                    className="sk"
                    role="slider"
                    tabIndex={0}
                    aria-label="Seek preview"
                    aria-valuemin={0}
                    aria-valuemax={TOTAL_DURATION_SEC}
                    aria-valuenow={currentSec}
                    aria-valuetext={formatTime(currentSec)}
                    style={{ cursor: 'pointer' }}
                    onPointerDown={handleBarPointerDown}
                    onKeyDown={handleBarKeyDown}
                  >
                    <i
                      style={{
                        width: `${progressPercent}%`,
                        animation: isSeeking ? 'none' : undefined,
                      }}
                    />
                  </div>
                  <div className="ctl">
                    <button type="button" aria-label="Play or Pause" onClick={() => setIsSeeking(!isSeeking)}>
                      <svg className="ic">
                        <use href="#pause" />
                      </svg>
                    </button>
                    <span>
                      {formatTime(currentSec)} / 2:02:30
                    </span>
                    <span className="s" />
                    <button type="button" title="Switch Audio Track">
                      <svg className="ic">
                        <use href="#lang" />
                      </svg>
                    </button>
                    <button type="button" title="Toggle Subtitles">
                      <svg className="ic">
                        <use href="#cc" />
                      </svg>
                    </button>
                    <button type="button" title="Fullscreen">
                      <svg className="ic">
                        <use href="#full" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Floating Chips */}
              <div className="chip lg c1">
                <span className="e" style={{ background: 'linear-gradient(145deg,#bfe6f7,#6fb0d2)', color: '#173a4d' }}>
                  <svg className="ic">
                    <use href="#user" />
                  </svg>
                </span>
                <span>Friend joined</span>
              </div>
              <div className="chip lg c2">
                <span className="dot" />
                <span>In sync · 18 ms apart</span>
              </div>
              <div className="chip lg c3">
                <span className="e" style={{ background: 'linear-gradient(145deg,#4ce0ff,#1796d1)', color: '#fff' }}>
                  <svg className="ic">
                    <use href="#lang" />
                  </svg>
                </span>
                <span>Audio: English Dolby Atmos</span>
              </div>

              {/* Skip Toast Alert */}
              {seekToast && (
                <div
                  className="chip lg"
                  role="status"
                  aria-live="polite"
                  style={{
                    position: 'absolute',
                    bottom: -24,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 10,
                    background: 'rgba(255, 255, 255, 0.2)',
                    boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
                  }}
                >
                  <span className="dot" style={{ background: 'var(--accent)' }} />
                  {seekToast}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Features Bento Section */}
        <section id="features">
          <div className="wrap">
            <div className="hd rv">
              <span className="eyebrow lg">Features</span>
              <h2>
                Everything for movie night.<br />Nothing you have to set up.
              </h2>
            </div>
            <div className="bento">
              <article className="tc s4 rv">
                <div className="ib i1">
                  <svg className="ic">
                    <use href="#sync" />
                  </svg>
                </div>
                <h3>Always on the same frame</h3>
                <p>
                  If someone’s connection slows down, their video speeds up a little to catch up.
                  Anyone can pause or skip, and everyone follows.
                </p>
                <div className="viz">
                  <div className="row2">
                    <b>You</b>
                    <div className="bar">
                      <i />
                    </div>
                  </div>
                  <div className="row2">
                    <b>Friend</b>
                    <div className="bar b">
                      <i />
                    </div>
                  </div>
                  <div className="ms">38 ms apart</div>
                </div>
              </article>

              <article className="tc s2 rv">
                <div className="ib i2">
                  <svg className="ic">
                    <use href="#call" />
                  </svg>
                </div>
                <h3>Talk while you watch</h3>
                <p>Video and voice between browsers, with chat beside the movie.</p>
                <div className="viz ring">
                  <i style={{ background: '#ffe3b0' }}>A</i>
                  <i style={{ background: '#bfe6f7' }}>M</i>
                  <i style={{ background: '#d8cdee' }}>D</i>
                </div>
              </article>

              <article className="tc s2 rv">
                <div className="ib i3">
                  <svg className="ic">
                    <use href="#lang" />
                  </svg>
                </div>
                <h3>Your language, your subtitles</h3>
                <p>Your choice stays yours.</p>
                <div className="viz langs">
                  <span className="on">
                    English <em>5.1</em>
                  </span>
                  <span>Hindi</span>
                  <span>Telugu</span>
                </div>
              </article>

              <article className="tc s2 rv">
                <div className="ib i4">
                  <svg className="ic">
                    <use href="#file" />
                  </svg>
                </div>
                <h3>Real movie files</h3>
                <p>MKV, MP4 and more, up to 5 GB, converted for you.</p>
                <div className="viz conv">
                  <span className="fchip">movie.mkv</span>
                  <span className="cb">
                    <i />
                  </span>
                  <span className="fchip">mp4</span>
                </div>
              </article>

              <article className="tc s2 rv">
                <div className="ib i5">
                  <svg className="ic">
                    <use href="#lock" />
                  </svg>
                </div>
                <h3>Gone when you leave</h3>
                <p>The movie is deleted from the host’s computer when the room closes.</p>
                <div className="viz conv">
                  <span className="fchip gone">movie.mp4</span>
                  <span style={{ color: 'var(--ok)' }}>Deleted</span>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* How it works Section */}
        <section id="how" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="hd rv">
              <span className="eyebrow lg">How it works</span>
              <h2>Three steps. About two minutes.</h2>
            </div>
            <div className="steps">
              <div className="st lg rv">
                <span className="n">1</span>
                <div className="ib i4">
                  <svg className="ic">
                    <use href="#up" />
                  </svg>
                </div>
                <h3>Add your movie</h3>
                <p>Drop in a video file. If it needs converting, Cineva does it and shows progress.</p>
              </div>
              <div className="st lg rv">
                <span className="n">2</span>
                <div className="ib i2">
                  <svg className="ic">
                    <use href="#link" />
                  </svg>
                </div>
                <h3>Send the link</h3>
                <p>You get a link and a six-character code. Friends open it in their browser.</p>
              </div>
              <div className="st lg rv">
                <span className="n">3</span>
                <div className="ib i1">
                  <svg className="ic">
                    <use href="#play" />
                  </svg>
                </div>
                <h3>Press play</h3>
                <p>Anyone can pause or skip ahead, and the call stays open the whole time.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Join Code Band Section */}
        <section id="join" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="band lg rv">
              <h2>Got a code from a friend?</h2>
              <p>Enter the six characters to join their room.</p>
              <form className="code" id="cf" onSubmit={handleJoinSubmit} autoComplete="off">
                {Array.from({ length: 6 }).map((_, i) => (
                  <input
                    key={i}
                    ref={(el) => { boxRefs.current[i] = el; }}
                    aria-label={`Character ${i + 1}`}
                    maxLength={1}
                    value={codeBoxes[i]}
                    onChange={(e) => handleBoxChange(i, e.target.value)}
                    onKeyDown={(e) => handleBoxKeyDown(i, e)}
                    onPaste={handleBoxPaste}
                    onFocus={(e) => e.target.select()}
                  />
                ))}
                <button type="submit" className="btn w lgx" style={{ marginLeft: 10 }}>
                  Join room &rarr;
                </button>
              </form>
              <p className="err" id="err" role="alert">
                {codeError}
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer>
        <div className="wrap">
          <span>Cineva</span>
          <span>Use only videos you have permission to share.</span>
        </div>
      </footer>
    </>
  );
};
