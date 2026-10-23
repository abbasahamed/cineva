import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Film,
  Zap,
  ShieldCheck,
  Clock,
  MessageSquare,
  ArrowRight,
  Tv,
  CheckCircle2,
  Users,
  Play,
  UploadCloud,
  FileVideo,
  Sliders,
  Lock,
  Server,
  Wifi,
  Cpu,
  Layers,
  Check,
  Share2,
  MonitorPlay,
  Flame,
  Smile,
  ChevronRight,
  Menu,
  X,
  Shield,
  Activity,
  Sparkles,
  Info,
} from 'lucide-react';
import { createDemoRoom } from '../services/api.js';
import { CinematicBackground } from '../components/CinematicBackground.js';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [isCreatingDemo, setIsCreatingDemo] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activePipelineStep, setActivePipelineStep] = useState(2);
  const [timelineProgress, setTimelineProgress] = useState(62);

  // Subtle simulated timeline motion (respects user visual preference)
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const interval = setInterval(() => {
      setTimelineProgress((prev) => (prev >= 96 ? 15 : prev + 0.35));
    }, 120);

    return () => clearInterval(interval);
  }, []);

  const handleDemoRoom = async () => {
    try {
      setIsCreatingDemo(true);
      const res = await createDemoRoom('Host');
      sessionStorage.setItem(`cineva_session_${res.room.roomCode}`, res.hostSessionId);
      sessionStorage.setItem(`sw_name_${res.room.roomCode}`, 'Host');
      navigate(`/room/${res.room.roomCode}`);
    } catch (err: any) {
      alert(err.message || 'Failed to create demo room');
    } finally {
      setIsCreatingDemo(false);
    }
  };

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#030407] text-slate-100 flex flex-col selection:bg-indigo-600 selection:text-white relative overflow-x-hidden font-sans">
      {/* Shared Cinematic Background (Home Variant: Sharp Starfield & Deep Atmosphere) */}
      <CinematicBackground variant="home" />

      {/* ========================================================================= */}
      {/* 1. NAVBAR                                                                 */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#05060a]/80 backdrop-blur-xl transition-all">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/25 border border-white/20 group-hover:scale-105 group-hover:shadow-brand-500/40 transition-all">
              <Film className="w-4 h-4 text-white drop-shadow-sm" />
            </div>
            <span className="font-extrabold text-base tracking-wide text-white">
              <span className="text-white">CINE</span>
              <span className="text-brand-400 font-light ml-0.5">VA</span>
            </span>
          </a>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-slate-300">
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              How it works
            </button>
            <button
              onClick={() => scrollToSection('features')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('sync-tech')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Synchronization
            </button>
            <button
              onClick={() => scrollToSection('technology')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Technology
            </button>
            <button
              onClick={() => scrollToSection('privacy')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Privacy
            </button>
          </nav>

          {/* Right Action Buttons */}
          <div className="hidden sm:flex items-center gap-2.5">
            <button
              onClick={() => navigate('/join')}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white glass-btn-secondary transition-all active:scale-98"
            >
              Join Room
            </button>
            <button
              onClick={() => navigate('/create')}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white glass-btn-primary shadow-sm transition-all active:scale-98"
            >
              Create Room
            </button>
          </div>

          {/* Mobile Menu Toggle Button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-white/[0.08] bg-[#07090f]/95 backdrop-blur-2xl px-6 py-5 space-y-4">
            <div className="flex flex-col space-y-3 text-sm font-medium text-slate-300">
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="text-left py-1 hover:text-white transition-colors"
              >
                How it works
              </button>
              <button
                onClick={() => scrollToSection('features')}
                className="text-left py-1 hover:text-white transition-colors"
              >
                Features
              </button>
              <button
                onClick={() => scrollToSection('sync-tech')}
                className="text-left py-1 hover:text-white transition-colors"
              >
                Synchronization
              </button>
              <button
                onClick={() => scrollToSection('technology')}
                className="text-left py-1 hover:text-white transition-colors"
              >
                Technology
              </button>
              <button
                onClick={() => scrollToSection('privacy')}
                className="text-left py-1 hover:text-white transition-colors"
              >
                Privacy
              </button>
            </div>
            <div className="pt-3 border-t border-white/[0.08] flex flex-col gap-2.5">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/create');
                }}
                className="w-full py-2.5 rounded-xl text-xs font-semibold text-white glass-btn-primary text-center"
              >
                Create a Watch Room
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/join');
                }}
                className="w-full py-2.5 rounded-xl text-xs font-medium text-slate-200 glass-btn-secondary text-center"
              >
                Join with Room Code
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ========================================================================= */}
      {/* 2. MAIN CONTENT WRAPPER                                                   */}
      {/* ========================================================================= */}
      <main className="flex-1 relative z-10">
        {/* ======================================================================= */}
        {/* HERO SECTION (Preserved exact design & atmosphere)                     */}
        {/* ======================================================================= */}
        <section className="max-w-5xl mx-auto px-4 sm:px-8 pt-10 sm:pt-24 pb-8 sm:pb-12 text-center flex flex-col items-center relative">
          {/* Enhanced Ambient Purple Radial Glow behind Hero Title */}
          <div
            className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[450px] rounded-full pointer-events-none -z-10 blur-[95px]"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(129, 140, 248, 0.32) 0%, rgba(139, 92, 246, 0.18) 35%, rgba(99, 102, 241, 0.08) 60%, transparent 75%)',
            }}
          />

          {/* Pill Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-white/[0.04] border border-white/[0.1] text-brand-300 text-[11px] sm:text-xs font-medium mb-5 sm:mb-8 backdrop-blur-md shadow-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-60"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
            </span>
            <span>Sub-frame synchronized cinema</span>
          </div>

          {/* Headline */}
          <h1 className="text-3xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white mb-4 sm:mb-6 leading-[1.12] sm:leading-[1.08] drop-shadow-sm">
            Watch together.<br />
            <span className="bg-gradient-to-r from-brand-300 via-indigo-200 to-brand-400 bg-clip-text text-transparent cinematic-text-glow">
              Stay in sync.
            </span>
          </h1>

          {/* Supporting Text */}
          <p className="text-surface-muted text-sm sm:text-base md:text-lg max-w-xl mb-6 sm:mb-10 leading-relaxed font-normal px-2 sm:px-0">
            Create a private room, invite your friends, and watch authorized videos together with sub-second synchronization.
          </p>

          {/* Main Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3.5 w-full max-w-sm sm:max-w-md justify-center mb-4 sm:mb-6 px-2 sm:px-0">
            <button
              onClick={() => navigate('/create')}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 sm:px-7 sm:py-3.5 rounded-xl sm:rounded-2xl glass-btn-primary hover:shadow-[0_0_24px_rgba(99,102,241,0.4)] text-white font-semibold text-xs sm:text-sm shadow-xl active:scale-98 transition-all cursor-pointer"
            >
              <span>Create a Watch Room</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => navigate('/join')}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 sm:px-7 sm:py-3.5 rounded-xl sm:rounded-2xl glass-btn-secondary hover:border-white/20 text-slate-200 font-semibold text-xs sm:text-sm shadow-md active:scale-98 transition-all cursor-pointer"
            >
              <span>Join a Room</span>
            </button>
          </div>

          {/* Instant Demo Room trigger */}
          <div className="mb-5 sm:mb-8">
            <button
              onClick={handleDemoRoom}
              disabled={isCreatingDemo}
              className="inline-flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-brand-300 hover:text-brand-200 font-medium transition-colors p-1.5 rounded-xl hover:bg-white/[0.04] cursor-pointer"
            >
              <Tv className="w-3.5 h-3.5 text-brand-400 shrink-0" />
              <span>{isCreatingDemo ? 'Launching Demo Room...' : 'Or start an instant demo room with sample media →'}</span>
            </button>
          </div>

          {/* ===================================================================== */}
          {/* 3. PRODUCT PROOF / CAPABILITY STRIP                                    */}
          {/* ===================================================================== */}
          <div className="w-full max-w-4xl mt-1 sm:mt-4 mb-4 sm:mb-8 glass-card rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-white/[0.08] shadow-glass-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 text-left">
              {/* Item 1 */}
              <div className="flex items-start gap-2.5 sm:gap-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0 mt-0.5">
                  <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div>
                  <h4 className="text-[11px] sm:text-xs font-semibold text-white">Real-time sync</h4>
                  <p className="text-[10px] sm:text-[11px] text-surface-muted leading-tight mt-0.5">Everyone watches together</p>
                </div>
              </div>

              {/* Item 2 */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0 mt-0.5">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Private rooms</h4>
                  <p className="text-[11px] text-surface-muted leading-tight mt-0.5">Invite only who you want</p>
                </div>
              </div>

              {/* Item 3 */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0 mt-0.5">
                  <UploadCloud className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Up to 5 GB</h4>
                  <p className="text-[11px] text-surface-muted leading-tight mt-0.5">Upload authorized media</p>
                </div>
              </div>

              {/* Item 4 */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0 mt-0.5">
                  <MonitorPlay className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Built for browser</h4>
                  <p className="text-[11px] text-surface-muted leading-tight mt-0.5">No app or plugin required</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* 4 & 5. HOW IT WORKS                                                     */}
        {/* ======================================================================= */}
        <section id="how-it-works" className="py-12 sm:py-20 border-t border-white/[0.07] bg-white/[0.01] relative">
          <div className="max-w-5xl mx-auto px-4 sm:px-8">
            <div className="text-center max-w-xl mx-auto mb-10 sm:mb-16">
              <span className="text-[10px] sm:text-xs font-semibold text-brand-400 uppercase tracking-widest mb-1.5 sm:mb-2 block">
                HOW CINEVA WORKS
              </span>
              <h2 className="text-xl sm:text-4xl font-extrabold text-white tracking-tight">
                From upload to movie night in three simple steps
              </h2>
            </div>

            {/* 3 Step Cards with connecting arrows on desktop */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
              {/* Connector line for desktop */}
              <div
                className="hidden md:block absolute top-1/2 left-[18%] right-[18%] h-[2px] -translate-y-8 pointer-events-none z-0"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgba(129,140,248,0.3) 25%, rgba(129,140,248,0.3) 75%, transparent)',
                }}
              />

              {/* Step 1 */}
              <div className="p-5 sm:p-7 rounded-2xl sm:rounded-3xl glass-card border border-white/[0.09] relative z-10 flex flex-col justify-between group hover:border-brand-500/40 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <span className="text-2xl sm:text-3xl font-extrabold font-mono text-brand-400/90 drop-shadow-sm">
                      01
                    </span>
                    <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-300">
                      <Tv className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-base font-bold text-white mb-2 uppercase tracking-wide">
                    CREATE
                  </h3>
                  <p className="text-xs text-surface-muted leading-relaxed">
                    Create a private watch room and choose your display name. No account creation or password needed.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center gap-2 text-[11px] text-slate-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Instant room creation</span>
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-5 sm:p-7 rounded-2xl sm:rounded-3xl glass-card border border-white/[0.09] relative z-10 flex flex-col justify-between group hover:border-brand-500/40 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <span className="text-2xl sm:text-3xl font-extrabold font-mono text-brand-400/90 drop-shadow-sm">
                      02
                    </span>
                    <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-300">
                      <Share2 className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-base font-bold text-white mb-2 uppercase tracking-wide">
                    INVITE
                  </h3>
                  <p className="text-xs text-surface-muted leading-relaxed">
                    Share your clean 6-character room code or one-click invitation link with your friends.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center gap-2 text-[11px] text-slate-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>One-click direct join</span>
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-5 sm:p-7 rounded-2xl sm:rounded-3xl glass-card border border-white/[0.09] relative z-10 flex flex-col justify-between group hover:border-brand-500/40 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <span className="text-2xl sm:text-3xl font-extrabold font-mono text-brand-400/90 drop-shadow-sm">
                      03
                    </span>
                    <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-300">
                      <Film className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-base font-bold text-white mb-2 uppercase tracking-wide">
                    WATCH
                  </h3>
                  <p className="text-xs text-surface-muted leading-relaxed">
                    Upload authorized video media and watch together in real time with locked, host-controlled playback.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center gap-2 text-[11px] text-slate-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sub-second synchronization</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* 6 & 7. FEATURES (BENTO-STYLE GRID)                                      */}
        {/* ======================================================================= */}
        <section id="features" className="py-24 border-t border-white/[0.07] bg-[#05060a]/40 relative">
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-2 block">
                BUILT FOR MOVIE NIGHTS
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                Everything you need to watch together without fighting the timeline
              </h2>
            </div>

            {/* Bento Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Card 1: Real-Time Sync (Wide 7 cols) */}
              <div className="md:col-span-7 p-7 rounded-3xl glass-card border border-white/[0.08] relative overflow-hidden flex flex-col justify-between">
                <div className="relative z-10">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-500/20 to-indigo-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400 mb-4 shadow-glass-sm">
                    <Zap className="w-5 h-5 drop-shadow" />
                  </div>
                  <span className="text-[10px] font-mono text-brand-400 font-bold uppercase tracking-wider block mb-1">
                    FEATURE 01
                  </span>
                  <h3 className="text-lg font-bold text-white mb-2">
                    Real-Time Synchronization
                  </h3>
                  <p className="text-xs text-surface-muted leading-relaxed max-w-lg">
                    Playback stays tightly aligned across everyone in the room. When the host plays, pauses, or seeks, all viewers stay locked to the exact same frame.
                  </p>
                </div>

                {/* Conceptual UI Preview */}
                <div className="mt-6 pt-5 border-t border-white/[0.06] bg-black/30 -mx-7 -mb-7 p-5 px-7">
                  <div className="flex items-center justify-between text-xs font-mono mb-2">
                    <span className="text-slate-300 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Continuous Offset Correction
                    </span>
                    <span className="text-emerald-400 font-bold">Δ &lt; 15ms</span>
                  </div>
                  <div className="w-full bg-white/[0.06] h-1.5 rounded-full overflow-hidden">
                    <div className="bg-gradient-to-r from-brand-500 to-emerald-400 h-full w-[78%] rounded-full shadow-xs" />
                  </div>
                </div>
              </div>

              {/* Card 2: Host Control (5 cols) */}
              <div className="md:col-span-5 p-7 rounded-3xl glass-card border border-white/[0.08] relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-500/20 to-indigo-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400 mb-4 shadow-glass-sm">
                    <Sliders className="w-5 h-5 drop-shadow" />
                  </div>
                  <span className="text-[10px] font-mono text-brand-400 font-bold uppercase tracking-wider block mb-1">
                    FEATURE 02
                  </span>
                  <h3 className="text-lg font-bold text-white mb-2">
                    Host Control
                  </h3>
                  <p className="text-xs text-surface-muted leading-relaxed">
                    The room host controls play, pause, and seeking so everyone stays together without accidental timeline clashes or interruptions.
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-300">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Shield className="w-3.5 h-3.5 text-brand-400" />
                    Authoritative timeline
                  </span>
                  <span className="text-[11px] text-surface-muted font-mono">Host Only</span>
                </div>
              </div>

              {/* Card 3: Live Chat (4 cols) */}
              <div className="md:col-span-4 p-7 rounded-3xl glass-card border border-white/[0.08] relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-500/20 to-indigo-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400 mb-4 shadow-glass-sm">
                    <MessageSquare className="w-5 h-5 drop-shadow" />
                  </div>
                  <span className="text-[10px] font-mono text-brand-400 font-bold uppercase tracking-wider block mb-1">
                    FEATURE 03
                  </span>
                  <h3 className="text-lg font-bold text-white mb-2">
                    Live Chat
                  </h3>
                  <p className="text-xs text-surface-muted leading-relaxed">
                    Talk and react with your friends while you watch without leaving the screen. Includes automatic rate limiting and XSS safety.
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center gap-2 text-[11px] text-brand-300">
                  <Flame className="w-3.5 h-3.5" />
                  <span>Real-time reactions & timestamps</span>
                </div>
              </div>

              {/* Card 4: Private Watch Rooms (4 cols) */}
              <div className="md:col-span-4 p-7 rounded-3xl glass-card border border-white/[0.08] relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-500/20 to-indigo-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400 mb-4 shadow-glass-sm">
                    <ShieldCheck className="w-5 h-5 drop-shadow" />
                  </div>
                  <span className="text-[10px] font-mono text-brand-400 font-bold uppercase tracking-wider block mb-1">
                    FEATURE 04
                  </span>
                  <h3 className="text-lg font-bold text-white mb-2">
                    Private Watch Rooms
                  </h3>
                  <p className="text-xs text-surface-muted leading-relaxed">
                    Create a private room and invite only the people you want with unique 6-character room codes. No public directory.
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center gap-2 text-[11px] text-slate-300">
                  <Lock className="w-3.5 h-3.5 text-brand-400" />
                  <span>Ephemeral session codes</span>
                </div>
              </div>

              {/* Card 5: Large Media Support (4 cols) */}
              <div className="md:col-span-4 p-7 rounded-3xl glass-card border border-white/[0.08] relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-500/20 to-indigo-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400 mb-4 shadow-glass-sm">
                    <UploadCloud className="w-5 h-5 drop-shadow" />
                  </div>
                  <span className="text-[10px] font-mono text-brand-400 font-bold uppercase tracking-wider block mb-1">
                    FEATURE 05
                  </span>
                  <h3 className="text-lg font-bold text-white mb-2">
                    Large Media Support
                  </h3>
                  <p className="text-xs text-surface-muted leading-relaxed">
                    Upload authorized video files up to 5 GB with high-throughput streaming directly to room viewers.
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center gap-2 text-[11px] text-emerald-400 font-mono">
                  <span>Up to 5 GB per room</span>
                </div>
              </div>

              {/* Card 6: Smart Media Preparation (Full Width 12 cols) */}
              <div className="md:col-span-12 p-7 rounded-3xl glass-card border border-white/[0.08] relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500/20 to-indigo-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400 shadow-glass-sm">
                      <Cpu className="w-5 h-5 drop-shadow" />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-brand-400 font-bold uppercase tracking-wider block">
                        FEATURE 06
                      </span>
                      <h3 className="text-lg font-bold text-white">
                        Smart Media Preparation & Stream-Copy
                      </h3>
                    </div>
                  </div>
                  <p className="text-xs text-surface-muted leading-relaxed">
                    Videos are analyzed and prepared into a browser-friendly playback format (H.264 / AAC) when necessary. When compatible codecs are already present, Cineva uses ultra-fast stream remuxing instead of heavy re-encoding.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  <span className="px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-xs font-mono font-medium text-slate-200">
                    MP4
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-xs font-mono font-medium text-slate-200">
                    WebM
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-xs font-mono font-medium text-slate-200">
                    MKV
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-xs font-mono font-medium text-slate-200">
                    MOV
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* 8 & 9. SYNCHRONIZATION SECTION                                          */}
        {/* ======================================================================= */}
        <section id="sync-tech" className="py-24 border-t border-white/[0.07] bg-white/[0.015] relative">
          <div className="max-w-4xl mx-auto px-5 sm:px-8">
            <div className="text-center max-w-xl mx-auto mb-14">
              <span className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-2 block">
                EVERYONE. SAME MOMENT.
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                Cineva keeps every viewer aligned while you watch together
              </h2>
              <p className="text-xs sm:text-sm text-surface-muted mt-3">
                No manual "3, 2, 1, play" counting. Server-authoritative timing keeps all room participants locked to the same second.
              </p>
            </div>

            {/* Live Synchronized Timeline Demonstration */}
            <div className="glass-card rounded-3xl p-6 sm:p-8 shadow-glass-elevated relative overflow-hidden text-left border border-white/[0.12]">
              {/* Demo UI Header */}
              <div className="flex flex-wrap items-center justify-between pb-4 border-b border-white/[0.08] mb-6 gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                  </span>
                  <span className="text-xs font-mono font-medium text-slate-200">Watch Room A7K9PX</span>
                  <span className="text-white/20">•</span>
                  <span className="text-[11px] text-surface-muted">Active Playback Demonstration</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-emerald-400 font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-xs">
                    ● SYNCED (Δ &lt; 15ms)
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">DEMO UI</span>
                </div>
              </div>

              {/* Synchronized Timeline Bars */}
              <div className="space-y-4">
                {/* Host */}
                <div className="flex items-center gap-3 sm:gap-4 text-xs font-mono">
                  <span className="w-24 sm:w-28 text-slate-200 font-medium truncate flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] uppercase font-bold text-brand-300 bg-brand-500/20 border border-brand-500/30 px-1.5 py-0.2 rounded-full">
                      Host
                    </span>
                    Host
                  </span>
                  <div className="flex-1 bg-white/[0.06] h-2.5 rounded-full overflow-hidden border border-white/[0.06] p-0.5 relative">
                    <div
                      className="bg-gradient-to-r from-brand-500 to-indigo-400 h-full rounded-full shadow-[0_0_8px_rgba(99,102,241,0.6)] transition-all duration-100 ease-linear"
                      style={{ width: `${timelineProgress}%` }}
                    />
                  </div>
                  <span className="text-slate-200 font-bold w-16 text-right shrink-0">00:42:17</span>
                </div>

                {/* Friend 1 */}
                <div className="flex items-center gap-3 sm:gap-4 text-xs font-mono">
                  <span className="w-24 sm:w-28 text-slate-400 truncate pl-1 shrink-0">Friend 1</span>
                  <div className="flex-1 bg-white/[0.06] h-2.5 rounded-full overflow-hidden border border-white/[0.06] p-0.5 relative">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)] transition-all duration-100 ease-linear"
                      style={{ width: `${timelineProgress}%` }}
                    />
                  </div>
                  <span className="text-slate-400 w-16 text-right shrink-0">00:42:17</span>
                </div>

                {/* Friend 2 */}
                <div className="flex items-center gap-3 sm:gap-4 text-xs font-mono">
                  <span className="w-24 sm:w-28 text-slate-400 truncate pl-1 shrink-0">Friend 2</span>
                  <div className="flex-1 bg-white/[0.06] h-2.5 rounded-full overflow-hidden border border-white/[0.06] p-0.5 relative">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)] transition-all duration-100 ease-linear"
                      style={{ width: `${timelineProgress}%` }}
                    />
                  </div>
                  <span className="text-slate-400 w-16 text-right shrink-0">00:42:17</span>
                </div>
              </div>

              {/* Bottom explanatory note */}
              <div className="mt-6 pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] text-surface-muted gap-2">
                <span>Network latency is continuously accounted for via clock offset estimation.</span>
                <span className="text-slate-400 font-mono">Server-Authoritative Sync</span>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* 10 & 11. WATCH TOGETHER EXPERIENCE & CHAT                              */}
        {/* ======================================================================= */}
        <section id="experience" className="py-24 border-t border-white/[0.07] bg-[#05060a]/60 relative">
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-2 block">
                MOVIE NIGHT, TOGETHER
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                You're watching the same scene. They're watching it too.
              </h2>
              <p className="text-xs sm:text-sm text-surface-muted mt-3">
                Experience authorized films with friends as if you're in the same living room.
              </p>
            </div>

            {/* Stylized Mock Watch Room Stage */}
            <div className="relative glass-card rounded-3xl border border-white/[0.12] p-4 sm:p-8 shadow-glass-elevated overflow-hidden">
              {/* Outer cinema ambient backdrop glow */}
              <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-brand-500/10 rounded-full blur-[100px] pointer-events-none" />

              {/* Mock Video Canvas */}
              <div className="relative rounded-2xl overflow-hidden bg-black/80 border border-white/[0.1] shadow-2xl aspect-video max-w-4xl mx-auto flex flex-col justify-between p-4 sm:p-6">
                {/* Cinema Screen Header Bar */}
                <div className="flex items-center justify-between text-xs relative z-10">
                  <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/[0.1]">
                    <Film className="w-3.5 h-3.5 text-brand-400" />
                    <span className="font-semibold text-white truncate max-w-[140px] sm:max-w-xs">
                      Interstellar Journey (Authorized Screening)
                    </span>
                  </div>

                  {/* Connected Viewers */}
                  <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/[0.1]">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[11px] text-slate-300 font-mono">4 Viewers in Sync</span>
                  </div>
                </div>

                {/* Simulated Movie Graphic in Player */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                  <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-brand-600/30 to-indigo-400/20 blur-2xl" />
                </div>

                {/* Floating Mock Chat Bubbles Overlay */}
                <div className="relative z-10 space-y-2 max-w-xs ml-auto text-xs">
                  <div className="bg-black/75 backdrop-blur-md p-2.5 rounded-2xl border border-white/[0.12] shadow-lg flex items-start gap-2 transform translate-y-1">
                    <div className="w-5 h-5 rounded-full bg-brand-500/30 border border-brand-500/50 flex items-center justify-center text-[10px] font-bold text-brand-300 shrink-0">
                      A
                    </div>
                    <div>
                      <span className="text-[10px] text-brand-300 font-semibold block">Alex</span>
                      <p className="text-slate-200 text-[11px]">That scene 😭</p>
                    </div>
                  </div>

                  <div className="bg-black/75 backdrop-blur-md p-2.5 rounded-2xl border border-white/[0.12] shadow-lg flex items-start gap-2 transform -translate-x-2">
                    <div className="w-5 h-5 rounded-full bg-indigo-500/30 border border-indigo-500/50 flex items-center justify-center text-[10px] font-bold text-indigo-300 shrink-0">
                      J
                    </div>
                    <div>
                      <span className="text-[10px] text-indigo-300 font-semibold block">Jordan</span>
                      <p className="text-slate-200 text-[11px]">Wait for it...</p>
                    </div>
                  </div>

                  <div className="bg-black/75 backdrop-blur-md p-2.5 rounded-2xl border border-white/[0.12] shadow-lg flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/30 border border-emerald-500/50 flex items-center justify-center text-[10px] font-bold text-emerald-300 shrink-0">
                      S
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-300 font-semibold block">Sam</span>
                      <p className="text-slate-200 text-[11px]">NO WAY 😂</p>
                    </div>
                  </div>
                </div>

                {/* Video Control Bar Simulation */}
                <div className="relative z-10 bg-black/70 backdrop-blur-md p-3 rounded-xl border border-white/[0.1] flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center text-white shrink-0">
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  </div>
                  <div className="flex-1 bg-white/[0.1] h-1.5 rounded-full overflow-hidden">
                    <div className="bg-brand-500 h-full w-[65%] rounded-full" />
                  </div>
                  <span className="text-[11px] font-mono text-slate-300 shrink-0">01:04:19 / 02:18:40</span>
                </div>
              </div>
            </div>

            {/* Chat Experience Highlight Block */}
            <div className="mt-12 text-center max-w-xl mx-auto">
              <h3 className="text-base font-bold text-white mb-2">
                TALK WITHOUT LEAVING THE SCREEN
              </h3>
              <p className="text-xs text-surface-muted leading-relaxed">
                Chat with your friends while the movie keeps rolling. Express reactions in real time without pausing or switching apps.
              </p>
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* 12. MEDIA COMPATIBILITY & PREPARATION                                   */}
        {/* ======================================================================= */}
        <section id="media" className="py-24 border-t border-white/[0.07] bg-white/[0.015] relative">
          <div className="max-w-5xl mx-auto px-5 sm:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-2 block">
                BRING YOUR OWN SCREENING
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                Upload authorized video media and let Cineva prepare it for browser playback
              </h2>
              <p className="text-xs sm:text-sm text-surface-muted mt-3">
                High-capacity video sharing up to 5 GB with automatic stream compatibility analysis.
              </p>
            </div>

            {/* Supported Formats Chips */}
            <div className="flex flex-wrap items-center justify-center gap-3 mb-14">
              <div className="px-5 py-2.5 rounded-2xl glass-card border border-white/[0.1] flex items-center gap-2 shadow-xs">
                <FileVideo className="w-4 h-4 text-brand-400" />
                <span className="text-xs font-bold text-white font-mono">MP4</span>
                <span className="text-[10px] text-surface-muted">Native Playback</span>
              </div>

              <div className="px-5 py-2.5 rounded-2xl glass-card border border-white/[0.1] flex items-center gap-2 shadow-xs">
                <FileVideo className="w-4 h-4 text-brand-400" />
                <span className="text-xs font-bold text-white font-mono">WebM</span>
                <span className="text-[10px] text-surface-muted">VP8 / VP9</span>
              </div>

              <div className="px-5 py-2.5 rounded-2xl glass-card border border-white/[0.1] flex items-center gap-2 shadow-xs">
                <FileVideo className="w-4 h-4 text-brand-400" />
                <span className="text-xs font-bold text-white font-mono">MKV</span>
                <span className="text-[10px] text-surface-muted">Fast Remux</span>
              </div>

              <div className="px-5 py-2.5 rounded-2xl glass-card border border-white/[0.1] flex items-center gap-2 shadow-xs">
                <FileVideo className="w-4 h-4 text-brand-400" />
                <span className="text-xs font-bold text-white font-mono">MOV</span>
                <span className="text-[10px] text-surface-muted">QuickTime Stream</span>
              </div>

              <div className="px-5 py-2.5 rounded-2xl bg-brand-500/10 border border-brand-500/25 flex items-center gap-2 shadow-xs">
                <UploadCloud className="w-4 h-4 text-brand-300" />
                <span className="text-xs font-bold text-brand-300 font-mono">Up to 5 GB</span>
              </div>
            </div>

            {/* Pipeline Visual: FILE -> ANALYZE -> PREPARE -> READY -> WATCH */}
            <div className="glass-card rounded-3xl p-6 sm:p-8 border border-white/[0.08] shadow-glass-sm">
              <span className="text-[10px] font-mono text-brand-400 font-bold uppercase tracking-wider block text-center mb-6">
                INTELLIGENT MEDIA PIPELINE
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-center relative">
                {/* Step 1 */}
                <div
                  onClick={() => setActivePipelineStep(0)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    activePipelineStep === 0
                      ? 'bg-brand-500/20 border-brand-500/40 text-white'
                      : 'bg-white/[0.02] border-white/[0.06] text-slate-300 hover:border-white/[0.15]'
                  }`}
                >
                  <div className="w-8 h-8 mx-auto rounded-xl bg-white/[0.06] flex items-center justify-center text-brand-400 mb-2">
                    <UploadCloud className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold font-mono">1. FILE</h4>
                  <p className="text-[10px] text-surface-muted mt-1">Chunked upload up to 5 GB</p>
                </div>

                {/* Step 2 */}
                <div
                  onClick={() => setActivePipelineStep(1)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    activePipelineStep === 1
                      ? 'bg-brand-500/20 border-brand-500/40 text-white'
                      : 'bg-white/[0.02] border-white/[0.06] text-slate-300 hover:border-white/[0.15]'
                  }`}
                >
                  <div className="w-8 h-8 mx-auto rounded-xl bg-white/[0.06] flex items-center justify-center text-brand-400 mb-2">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold font-mono">2. ANALYZE</h4>
                  <p className="text-[10px] text-surface-muted mt-1">Probe video & audio streams</p>
                </div>

                {/* Step 3 */}
                <div
                  onClick={() => setActivePipelineStep(2)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    activePipelineStep === 2
                      ? 'bg-brand-500/20 border-brand-500/40 text-white'
                      : 'bg-white/[0.02] border-white/[0.06] text-slate-300 hover:border-white/[0.15]'
                  }`}
                >
                  <div className="w-8 h-8 mx-auto rounded-xl bg-white/[0.06] flex items-center justify-center text-brand-400 mb-2">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold font-mono">3. PREPARE</h4>
                  <p className="text-[10px] text-surface-muted mt-1">Fast remux or audio conversion</p>
                </div>

                {/* Step 4 */}
                <div
                  onClick={() => setActivePipelineStep(3)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    activePipelineStep === 3
                      ? 'bg-brand-500/20 border-brand-500/40 text-white'
                      : 'bg-white/[0.02] border-white/[0.06] text-slate-300 hover:border-white/[0.15]'
                  }`}
                >
                  <div className="w-8 h-8 mx-auto rounded-xl bg-white/[0.06] flex items-center justify-center text-brand-400 mb-2">
                    <Server className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold font-mono">4. READY</h4>
                  <p className="text-[10px] text-surface-muted mt-1">HTTP range streaming ready</p>
                </div>

                {/* Step 5 */}
                <div
                  onClick={() => setActivePipelineStep(4)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    activePipelineStep === 4
                      ? 'bg-brand-500/20 border-brand-500/40 text-white'
                      : 'bg-white/[0.02] border-white/[0.06] text-slate-300 hover:border-white/[0.15]'
                  }`}
                >
                  <div className="w-8 h-8 mx-auto rounded-xl bg-white/[0.06] flex items-center justify-center text-brand-400 mb-2">
                    <Play className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold font-mono">5. WATCH</h4>
                  <p className="text-[10px] text-surface-muted mt-1">Synchronized room playback</p>
                </div>
              </div>
            </div>

            {/* Subtle Responsible Use Statement */}
            <div className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-surface-muted">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Upload and share only media you have the right to use and share.</span>
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* 13 & 14. PRIVACY / SECURITY SECTION                                     */}
        {/* ======================================================================= */}
        <section id="privacy" className="py-24 border-t border-white/[0.07] bg-[#05060a]/40 relative">
          <div className="max-w-5xl mx-auto px-5 sm:px-8">
            <div className="text-center max-w-xl mx-auto mb-16">
              <span className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-2 block">
                YOUR ROOM. YOUR PEOPLE.
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                Watch rooms are designed for private sessions with people you invite
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Feature 1 */}
              <div className="p-6 rounded-3xl glass-card border border-white/[0.08]">
                <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-4">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white mb-2">Private room codes</h3>
                <p className="text-xs text-surface-muted leading-relaxed">
                  Ephemeral 6-character room codes prevent indexing or unauthorized discovery.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="p-6 rounded-3xl glass-card border border-white/[0.08]">
                <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-4">
                  <Sliders className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white mb-2">Host-controlled playback</h3>
                <p className="text-xs text-surface-muted leading-relaxed">
                  Only the designated host can play, pause, seek, or replace active media.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="p-6 rounded-3xl glass-card border border-white/[0.08]">
                <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-4">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white mb-2">Authorized media only</h3>
                <p className="text-xs text-surface-muted leading-relaxed">
                  Media is strictly scoped to room participants for private viewing sessions.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="p-6 rounded-3xl glass-card border border-white/[0.08]">
                <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-4">
                  <Wifi className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white mb-2">Secure communication</h3>
                <p className="text-xs text-surface-muted leading-relaxed">
                  Direct WebSocket channels with message sanitization and spam rate limiting.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* 15 & 16. PRODUCT TECHNOLOGY & ARCHITECTURE DIAGRAM                      */}
        {/* ======================================================================= */}
        <section id="technology" className="py-24 border-t border-white/[0.07] bg-white/[0.015] relative">
          <div className="max-w-5xl mx-auto px-5 sm:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-2 block">
                BUILT FOR REAL-TIME WATCHING
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                Engineered for sub-second precision and low-latency synchronization
              </h2>
              <p className="text-xs sm:text-sm text-surface-muted mt-3">
                A robust, server-authoritative architecture built on top of WebSockets and modern media pipelines.
              </p>
            </div>

            {/* 4 Tech Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-14">
              <div className="p-6 rounded-3xl glass-card border border-white/[0.08] flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0">
                  <Wifi className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">Real-time communication</h3>
                  <p className="text-xs text-surface-muted leading-relaxed">
                    Socket-based room updates keep participants seamlessly connected with immediate state propagation.
                  </p>
                </div>
              </div>

              <div className="p-6 rounded-3xl glass-card border border-white/[0.08] flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">Server-authoritative playback</h3>
                  <p className="text-xs text-surface-muted leading-relaxed">
                    Playback actions are coordinated and validated through the room host to prevent desynchronization.
                  </p>
                </div>
              </div>

              <div className="p-6 rounded-3xl glass-card border border-white/[0.08] flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">Clock synchronization</h3>
                  <p className="text-xs text-surface-muted leading-relaxed">
                    Clients continuously calculate latency offsets to eliminate timing differences across varying connections.
                  </p>
                </div>
              </div>

              <div className="p-6 rounded-3xl glass-card border border-white/[0.08] flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0">
                  <FileVideo className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">Browser-ready media</h3>
                  <p className="text-xs text-surface-muted leading-relaxed">
                    Uploaded media is verified and converted into browser-compatible H.264/AAC formats when necessary.
                  </p>
                </div>
              </div>
            </div>

            {/* Architecture Flow Diagram */}
            <div className="glass-card rounded-3xl p-6 sm:p-8 border border-white/[0.08] text-center shadow-glass-elevated">
              <span className="text-[10px] font-mono text-brand-400 font-bold uppercase tracking-wider block mb-8">
                TOPOLOGY & EVENT FLOW
              </span>

              <div className="flex flex-col md:flex-row items-center justify-between gap-6 max-w-3xl mx-auto">
                {/* Host node */}
                <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.12] w-full md:w-48 text-center">
                  <div className="text-[10px] font-mono text-brand-300 font-bold uppercase mb-1">Origin</div>
                  <div className="font-bold text-sm text-white">HOST CLIENT</div>
                  <div className="text-[10px] text-surface-muted mt-1 font-mono">Playback Events</div>
                </div>

                {/* Arrow to server */}
                <div className="text-brand-400 flex flex-col items-center">
                  <ArrowRight className="w-5 h-5 hidden md:block" />
                  <span className="text-[10px] font-mono text-slate-400 hidden md:block">WebSocket</span>
                </div>

                {/* Central Server Engine */}
                <div className="p-5 rounded-2xl bg-brand-500/10 border border-brand-500/30 w-full md:w-56 text-center shadow-lg shadow-brand-500/10">
                  <div className="text-[10px] font-mono text-emerald-400 font-bold uppercase mb-1">Core Engine</div>
                  <div className="font-bold text-sm text-white">CINEVA ROOM</div>
                  <div className="text-[10px] text-brand-300 mt-1 font-mono">Authoritative Clock</div>
                </div>

                {/* Arrow to viewers */}
                <div className="text-brand-400 flex flex-col items-center">
                  <ArrowRight className="w-5 h-5 hidden md:block" />
                  <span className="text-[10px] font-mono text-slate-400 hidden md:block">Sub-frame Sync</span>
                </div>

                {/* Viewers node */}
                <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.12] w-full md:w-48 text-center">
                  <div className="text-[10px] font-mono text-slate-400 font-bold uppercase mb-1">Audience</div>
                  <div className="font-bold text-sm text-white">ROOM VIEWERS</div>
                  <div className="text-[10px] text-emerald-400 mt-1 font-mono">Locked Playback</div>
                </div>
              </div>

              {/* Badges strip under diagram */}
              <div className="mt-8 pt-6 border-t border-white/[0.06] flex flex-wrap items-center justify-center gap-4 text-xs font-mono text-slate-300">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08]">
                  <Activity className="w-3.5 h-3.5 text-brand-400" />
                  Playback State
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08]">
                  <Users className="w-3.5 h-3.5 text-brand-400" />
                  Presence
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08]">
                  <MessageSquare className="w-3.5 h-3.5 text-brand-400" />
                  Chat
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08]">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  Timing
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* 17. WHY CINEVA (Bold & Minimal Statement)                            */}
        {/* ======================================================================= */}
        <section className="py-24 border-t border-white/[0.07] bg-[#05060a]/60 relative text-center">
          <div className="max-w-4xl mx-auto px-5 sm:px-8">
            <span className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-3 block">
              ONE ROOM. ONE TIMELINE. EVERYONE TOGETHER.
            </span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
              <div className="p-6">
                <h3 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">Create once.</h3>
                <p className="text-xs text-surface-muted leading-relaxed">
                  Spin up a private watch room instantly with zero sign-ups or software downloads.
                </p>
              </div>

              <div className="p-6">
                <h3 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">Invite instantly.</h3>
                <p className="text-xs text-surface-muted leading-relaxed">
                  Send a 6-character room code or link and have your friends joined in seconds.
                </p>
              </div>

              <div className="p-6">
                <h3 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">Watch together.</h3>
                <p className="text-xs text-surface-muted leading-relaxed">
                  Experience movies in lockstep without countdowns, desyncs, or spoiler lag.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================================================= */}
        {/* 18. FINAL CTA                                                           */}
        {/* ======================================================================= */}
        <section className="py-28 border-t border-white/[0.07] text-center relative overflow-hidden bg-gradient-to-b from-[#05060a]/50 to-[#070912]">
          {/* Subtle radial glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-brand-500/[0.12] rounded-full blur-[140px] pointer-events-none" />

          <div className="max-w-xl mx-auto px-5 sm:px-8 relative z-10">
            <span className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-3 block">
              READY FOR MOVIE NIGHT?
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white mb-4 tracking-tight">
              Create a room, invite your friends, and press play.
            </h2>
            <p className="text-sm text-surface-muted mb-10 leading-relaxed max-w-md mx-auto">
              No account required. Start a private watch room in seconds and stream together.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 mb-8">
              <button
                onClick={() => navigate('/create')}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl glass-btn-primary text-white font-semibold text-sm shadow-xl active:scale-98 transition-all cursor-pointer"
              >
                <span>Create a Watch Room</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('/join')}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl glass-btn-secondary text-slate-200 font-semibold text-sm shadow-md active:scale-98 transition-all cursor-pointer"
              >
                <span>Join a Room</span>
              </button>
            </div>

            {/* Instant Demo Option */}
            <button
              onClick={handleDemoRoom}
              disabled={isCreatingDemo}
              className="inline-flex items-center gap-2 text-xs text-brand-300 hover:text-brand-200 font-medium transition-colors p-1.5 rounded-xl hover:bg-white/[0.04] cursor-pointer"
            >
              <Tv className="w-3.5 h-3.5 text-brand-400" />
              <span>{isCreatingDemo ? 'Launching Demo Room...' : 'Or start an instant demo room with sample media →'}</span>
            </button>
          </div>
        </section>
      </main>

      {/* ========================================================================= */}
      {/* 19. FOOTER                                                                */}
      {/* ========================================================================= */}
      <footer className="border-t border-white/[0.08] py-14 px-5 sm:px-8 text-xs text-surface-muted bg-[#040508]/90 backdrop-blur-xl relative z-20">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-8 mb-12">
          {/* Left Column: Brand */}
          <div className="md:col-span-5 space-y-3">
            <a href="/" className="flex items-center gap-2.5 group">
              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md shadow-brand-500/25 border border-white/20">
                <Film className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-extrabold text-sm tracking-wide text-white">
                <span className="text-white">CINE</span>
                <span className="text-brand-400 font-light ml-0.5">VA</span>
              </span>
            </a>
            <p className="text-xs text-surface-muted leading-relaxed max-w-sm">
              Watch together. Stay in sync. Synchronized private watch-room experience for authorized video playback.
            </p>
          </div>

          {/* Middle Column: Product */}
          <div className="md:col-span-4 space-y-2.5">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">PRODUCT</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => scrollToSection('how-it-works')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  How it works
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('features')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Features
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('/create')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Create Room
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('/join')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Join Room
                </button>
              </li>
            </ul>
          </div>

          {/* Right Column: Info & Privacy */}
          <div className="md:col-span-3 space-y-2.5">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">ABOUT & COMPLIANCE</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => scrollToSection('privacy')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Privacy
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('media')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Responsible use
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('technology')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Technology
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright & Responsible Use Notice */}
        <div className="max-w-6xl mx-auto pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <span>© {new Date().getFullYear()} Cineva. All rights reserved.</span>
          <span>Designed for authorized shared media viewing.</span>
        </div>
      </footer>
    </div>
  );
};
