import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Film,
  Play,
  Pause,
  Volume2,
  Captions,
  Maximize,
  Users,
  Zap,
  RefreshCw,
  Video,
  Languages,
  FileVideo,
  ShieldCheck,
  Upload,
  Share2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { LiquidGlassCursor } from '../components/LiquidGlassCursor';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  // Scrolled state for navigation pill
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 24);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Pointer light tracking on glass elements
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const target = (e.target as HTMLElement)?.closest?.('.lg, .tc, .glass, .pill-glass, .band, .st') as HTMLElement | null;
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
      dev.style.setProperty('--ry', `${x * 8}deg`);
      dev.style.setProperty('--rx', `${4 - y * 7}deg`);
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
      (el as HTMLElement).style.transitionDelay = `${(i % 3) * 80}ms`;
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
    setSeekToast(`Skipped to ${timeText}`);
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

  useEffect(() => {
    const firstInput = boxRefs.current[0];
    if (!firstInput || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          firstInput.focus({ preventScroll: true });
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(firstInput);
    return () => observer.disconnect();
  }, []);

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
    <div className="landing-root min-h-screen relative text-white selection:bg-[#0A84FF]/30 selection:text-white">
      {/* Liquid Glass Cursor */}
      <LiquidGlassCursor />

      {/* Clean cinematic dark background */}
      <div className="landing-aurora" aria-hidden="true" />

      {/* Floating Glass Nav Pill */}
      <header
        className={`nav glass-control ${isScrolled ? 'scrolled-body' : ''}`}
      >
        <Link to="/" className="logo" data-cursor="big">
          <span className="logo-badge">
            <Film className="w-4 h-4 text-white" strokeWidth={2.2} />
          </span>
          <span className="font-semibold text-[18px] tracking-tight text-white">Cineva</span>
        </Link>
        <nav className="links" aria-label="Main">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#join">Join</a>
        </nav>
        <span style={{ display: 'flex', gap: 10 }}>
          <a className="btn btn-glass btn-s" href="#join">
            Join room
          </a>
          <Link className="btn btn-primary btn-s" to="/create">
            Create room
          </Link>
        </span>
      </header>

      <main>
        {/* Hero Section */}
        <div className="hero">
          <div className="wrap">
            <span className="pill glass-control">
              <span className="pill-tag">
                <Sparkles className="w-3.5 h-3.5" strokeWidth={2.5} />
                New
              </span>
              <span>Pick your own audio language and subtitles</span>
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
              <Link className="btn btn-primary lgx" to="/create" data-cursor="big">
                <Play className="w-5 h-5 fill-current" strokeWidth={2.2} />
                <span>Create a room</span>
              </Link>
              <a className="btn btn-glass lgx" href="#join">
                <span>Join with a code</span>
              </a>
            </div>

            <div className="proof">
              <span className="avs">
                <i className="av-a">A</i>
                <i className="av-m">M</i>
                <i className="av-d">D</i>
                <i className="av-s">S</i>
              </span>
              <span>No accounts. Works in your browser.</span>
            </div>

            {/* Hero Interactive Stage Device */}
            <div className="stagewrap" id="sw" ref={stageWrapRef}>
              <div className="device" id="dev" ref={deviceRef}>
                <div className="film-canvas" />
                <div className="film-orb" />

                <div className="dtop lg">
                  <span className="dot" />
                  <span>Friday Movie Night · Interstellar</span>
                </div>

                <div className="dside lg">
                  <div className="tl">
                    <div className="tile tile-you">
                      A<small>You</small>
                    </div>
                    <div className="tile tile-friend sp">
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
                    <button
                      type="button"
                      aria-label={isSeeking ? 'Pause' : 'Play'}
                      onClick={() => setIsSeeking(!isSeeking)}
                    >
                      {isSeeking ? (
                        <Play className="w-5 h-5 fill-current" strokeWidth={2} />
                      ) : (
                        <Pause className="w-5 h-5 fill-current" strokeWidth={2} />
                      )}
                    </button>
                    <span className="font-mono text-xs tabular-nums text-white/90">
                      {formatTime(currentSec)} / 2:02:30
                    </span>
                    <span className="s" />
                    <button type="button" title="Switch Audio Track" aria-label="Switch Audio Track">
                      <Volume2 className="w-4 h-4" strokeWidth={2} />
                    </button>
                    <button type="button" title="Toggle Subtitles" aria-label="Toggle Subtitles">
                      <Captions className="w-4 h-4" strokeWidth={2} />
                    </button>
                    <button type="button" title="Fullscreen" aria-label="Fullscreen">
                      <Maximize className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Floating VisionOS Chips */}
              <div className="chip lg c1">
                <span className="icon-tile tile-cobalt !w-7 !h-7 !rounded-full">
                  <Users className="w-3.5 h-3.5" strokeWidth={2} />
                </span>
                <span>Friend joined</span>
              </div>
              <div className="chip lg c2">
                <span className="dot" />
                <span>In sync · 18 ms apart</span>
              </div>
              <div className="chip lg c3">
                <span className="icon-tile tile-cobalt !w-7 !h-7 !rounded-full">
                  <Volume2 className="w-3.5 h-3.5" strokeWidth={2} />
                </span>
                <span>Audio: English Dolby Atmos</span>
              </div>

              {/* Skip Toast Alert */}
              {seekToast && (
                <div
                  className="chip lg toast-chip"
                  role="status"
                  aria-live="polite"
                >
                  <span className="dot" />
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
                <div className="icon-tile tile-cobalt mb-5">
                  <RefreshCw className="w-6 h-6" strokeWidth={2} />
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
                      <i className="bar-tint" />
                    </div>
                  </div>
                  <div className="row2">
                    <b>Friend</b>
                    <div className="bar">
                      <i className="bar-peer" />
                    </div>
                  </div>
                  <div className="ms text-[#64d2ff] font-mono font-medium">38 ms apart</div>
                </div>
              </article>

              <article className="tc s2 rv">
                <div className="icon-tile tile-tint mb-5">
                  <Video className="w-6 h-6 text-white" strokeWidth={2} />
                </div>
                <h3>Talk while you watch</h3>
                <p>Video and voice between browsers, with chat beside the movie.</p>
                <div className="viz ring">
                  <i className="av-a">A</i>
                  <i className="av-m ring-pulse">M</i>
                  <i className="av-d">D</i>
                </div>
              </article>

              <article className="tc s2 rv">
                <div className="icon-tile tile-cobalt mb-5">
                  <Languages className="w-6 h-6" strokeWidth={2} />
                </div>
                <h3>Your language, your subtitles</h3>
                <p>Your choice stays yours.</p>
                <div className="viz langs">
                  <span className="on">
                    English <em className="badge-tint">5.1</em>
                  </span>
                  <span>Hindi</span>
                  <span>Telugu</span>
                </div>
              </article>

              <article className="tc s2 rv">
                <div className="icon-tile tile-cobalt mb-5">
                  <FileVideo className="w-6 h-6" strokeWidth={2} />
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
                <div className="icon-tile tile-tint mb-5">
                  <ShieldCheck className="w-6 h-6 text-white" strokeWidth={2} />
                </div>
                <h3>Gone when you leave</h3>
                <p>The movie is deleted from the host’s computer when the room closes.</p>
                <div className="viz conv">
                  <span className="fchip gone">movie.mp4</span>
                  <span className="text-[#ff453a] font-semibold">Deleted</span>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* How it works Section */}
        <section id="how" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="hd rv">
              <span className="eyebrow">How it works</span>
              <h2>Three steps. About two minutes.</h2>
            </div>
            <div className="steps">
              <div className="st rv">
                <span className="n">1</span>
                <div className="icon-tile tile-cobalt mb-5">
                  <Upload className="w-6 h-6" strokeWidth={2} />
                </div>
                <h3>Add your movie</h3>
                <p>Drop in a video file. If it needs converting, Cineva does it and shows progress.</p>
              </div>
              <div className="st rv">
                <span className="n">2</span>
                <div className="icon-tile tile-cobalt mb-5">
                  <Share2 className="w-6 h-6" strokeWidth={2} />
                </div>
                <h3>Send the link</h3>
                <p>You get a link and a six-character code. Friends open it in their browser.</p>
              </div>
              <div className="st rv">
                <span className="n">3</span>
                <div className="icon-tile tile-tint mb-5">
                  <Play className="w-6 h-6 fill-current text-white" strokeWidth={2} />
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
            <div className="band rv">
              <h2>Got a code from a friend?</h2>
              <p>Enter the six characters to sync up with their theater room instantly.</p>
              <form className="code-form" id="cf" onSubmit={handleJoinSubmit} autoComplete="off">
                <div className="code-cells" id="pinContainer">
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
                </div>
                <button type="submit" className="btn btn-primary lgx" style={{ marginLeft: 8 }} data-cursor="big">
                  <span>Join room</span>
                  <ArrowRight className="w-5 h-5 ml-1" strokeWidth={2.2} />
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
          <span className="font-semibold tracking-tight text-white/90">Cineva</span>
          <span className="text-white/60">Use only videos you have permission to share.</span>
        </div>
      </footer>
    </div>
  );
};
