import { useEffect, useRef, useState, useCallback } from 'react';
import { SubtitleSettings, clampSize } from '../utils/subtitleUtils.js';

interface UseRoomShortcutsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canControl: boolean;
  curTime: number;
  totalDuration: number;
  isActuallyPlaying: boolean;
  volume: number;
  isVideoMuted: boolean;
  setVolume: (v: number | ((prev: number) => number)) => void;
  setIsVideoMuted: (m: boolean | ((prev: boolean) => boolean)) => void;
  handlePlay: () => void;
  handlePause: () => void;
  handleSeek: (time: number) => void;
  handleToggleFullscreen: () => void;
  onToggleSubtitles: () => void;
  subSettings: SubtitleSettings;
  setSubSettings: React.Dispatch<React.SetStateAction<SubtitleSettings>>;
  saveSubtitleSettings: (s: SubtitleSettings) => void;
  showToast: (msg: string) => void;
  wakeControls: () => void;
  activeMenu: string | null;
  setActiveMenu: (menu: any) => void;
  showShortcutsHelp?: boolean;
  setShowShortcutsHelp?: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface ShortcutIndicator {
  text: string;
  id: number;
}

export function useRoomShortcuts({
  videoRef,
  canControl,
  curTime,
  totalDuration,
  isActuallyPlaying,
  volume,
  isVideoMuted,
  setVolume,
  setIsVideoMuted,
  handlePlay,
  handlePause,
  handleSeek,
  handleToggleFullscreen,
  onToggleSubtitles,
  subSettings,
  setSubSettings,
  saveSubtitleSettings,
  showToast,
  wakeControls,
  activeMenu,
  setActiveMenu,
  showShortcutsHelp: externalShowHelp,
  setShowShortcutsHelp: externalSetShowHelp,
}: UseRoomShortcutsProps) {
  const [indicator, setIndicator] = useState<ShortcutIndicator | null>(null);
  const [internalHelp, setInternalHelp] = useState(false);
  const showShortcutsHelp = externalShowHelp !== undefined ? externalShowHelp : internalHelp;
  const setShowShortcutsHelp = externalSetShowHelp || setInternalHelp;
  const indicatorTimeoutRef = useRef<any>(null);

  // Latest refs to avoid stale closures in event listener
  const stateRef = useRef({
    canControl,
    curTime,
    totalDuration,
    isActuallyPlaying,
    volume,
    isVideoMuted,
    subSettings,
    activeMenu,
    showShortcutsHelp,
  });

  useEffect(() => {
    stateRef.current = {
      canControl,
      curTime,
      totalDuration,
      isActuallyPlaying,
      volume,
      isVideoMuted,
      subSettings,
      activeMenu,
      showShortcutsHelp,
    };
  });

  const showIndicator = useCallback((text: string) => {
    if (indicatorTimeoutRef.current) {
      clearTimeout(indicatorTimeoutRef.current);
    }
    setIndicator({ text, id: Date.now() });
    indicatorTimeoutRef.current = setTimeout(() => {
      setIndicator(null);
    }, 700);
  }, []);

  // Repeat throttling and socket batching refs
  const lastLocalSeekTimeRef = useRef<number>(0);
  const pendingSeekTargetRef = useRef<number | null>(null);
  const batchSocketTimerRef = useRef<any>(null);

  const dispatchThrottledSeek = useCallback(
    (newTime: number, label: string) => {
      const now = Date.now();
      const st = stateRef.current;
      const duration = st.totalDuration > 0 ? st.totalDuration : (videoRef.current?.duration || 0);
      const clamped = Math.max(0, Math.min(duration > 0 ? duration : newTime, newTime));

      if (!st.canControl) {
        showToast('The host controls playback');
        return;
      }

      showIndicator(label);
      wakeControls();

      // Update local video element immediately
      if (videoRef.current) {
        videoRef.current.currentTime = clamped;
      }
      pendingSeekTargetRef.current = clamped;

      // Throttle local state update to 100ms
      if (now - lastLocalSeekTimeRef.current > 100) {
        lastLocalSeekTimeRef.current = now;
      }

      // Batch socket seek broadcast: every 250ms or when key released
      if (!batchSocketTimerRef.current) {
        batchSocketTimerRef.current = setTimeout(() => {
          batchSocketTimerRef.current = null;
          if (pendingSeekTargetRef.current !== null) {
            handleSeek(pendingSeekTargetRef.current);
            pendingSeekTargetRef.current = null;
          }
        }, 250);
      }
    },
    [handleSeek, showIndicator, wakeControls, showToast, videoRef]
  );

  const flushPendingSeek = useCallback(() => {
    if (batchSocketTimerRef.current) {
      clearTimeout(batchSocketTimerRef.current);
      batchSocketTimerRef.current = null;
    }
    if (pendingSeekTargetRef.current !== null) {
      handleSeek(pendingSeekTargetRef.current);
      pendingSeekTargetRef.current = null;
    }
  }, [handleSeek]);

  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'j' || e.key === 'l' || e.key === 'J' || e.key === 'L') {
        flushPendingSeek();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. If key is already defaultPrevented (e.g. seekbar or slider handled it), do nothing
      if (e.defaultPrevented) return;

      // 2. Ignore when target is a text entry input or contenteditable
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName ? target.tagName.toUpperCase() : '';
        const isContentEditable = target.isContentEditable || target.getAttribute('contenteditable') === 'true';
        if (tag === 'INPUT') {
          const type = (target as HTMLInputElement).type?.toLowerCase();
          // Allow range slider to keep its own focus, but ignore text/search inputs
          if (type !== 'range') return;
        } else if (tag === 'TEXTAREA' || tag === 'SELECT' || isContentEditable) {
          return;
        }
      }

      // 3. Modifiers check: Ignore if Cmd (metaKey), Ctrl, or Alt is pressed
      // (so Cmd+Left/Right = browser back/forward, Option+keys work normally)
      // Shift is explicitly ALLOWED as a modifier
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      const st = stateRef.current;
      const v = videoRef.current;
      const effectiveCurTime = v ? v.currentTime : st.curTime;
      const effectiveDuration = st.totalDuration > 0 ? st.totalDuration : (v?.duration || 0);

      // Handle Escape
      if (e.key === 'Escape') {
        if (st.showShortcutsHelp) {
          e.preventDefault();
          setShowShortcutsHelp(false);
          return;
        }
        if (st.activeMenu) {
          e.preventDefault();
          setActiveMenu(null);
          // Return focus to trigger button if applicable
          const trigger = document.getElementById('sub-btn') || document.getElementById('audio-btn');
          trigger?.focus();
          return;
        }
        return;
      }

      // 4. If a modal or menu needing arrows is open, let it handle arrows
      if (st.activeMenu && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        return;
      }

      // 5. Shortcut mappings:
      switch (e.key) {
        // Seek Left: ArrowLeft or j / J
        case 'ArrowLeft':
        case 'j':
        case 'J': {
          e.preventDefault();
          const step = e.shiftKey ? 30 : 10;
          const targetTime = Math.max(0, effectiveCurTime - step);
          dispatchThrottledSeek(targetTime, `−${step} s`);
          break;
        }

        // Seek Right: ArrowRight or l / L
        case 'ArrowRight':
        case 'l':
        case 'L': {
          e.preventDefault();
          const step = e.shiftKey ? 30 : 10;
          const targetTime = Math.min(effectiveDuration > 0 ? effectiveDuration : effectiveCurTime + step, effectiveCurTime + step);
          dispatchThrottledSeek(targetTime, `+${step} s`);
          break;
        }

        // Space or k / K: Play / Pause
        case ' ':
        case 'k':
        case 'K': {
          e.preventDefault();
          // Blur active button if user clicked one, so Space doesn't re-trigger it
          if (document.activeElement && document.activeElement instanceof HTMLElement) {
            if (document.activeElement.tagName === 'BUTTON') {
              document.activeElement.blur();
            }
          }
          if (st.isActuallyPlaying) {
            handlePause();
            showIndicator('Pause');
          } else {
            handlePlay();
            showIndicator('Play');
          }
          wakeControls();
          break;
        }

        // Volume Up: ArrowUp
        case 'ArrowUp': {
          e.preventDefault();
          wakeControls();
          const newVol = Math.min(100, Math.round(st.volume + 5));
          setVolume(newVol);
          setIsVideoMuted(false);
          if (v) {
            v.volume = newVol / 100;
            v.muted = false;
          }
          showIndicator(`Volume ${newVol}%`);
          break;
        }

        // Volume Down: ArrowDown
        case 'ArrowDown': {
          e.preventDefault();
          wakeControls();
          const newVol = Math.max(0, Math.round(st.volume - 5));
          setVolume(newVol);
          if (v) {
            v.volume = newVol / 100;
          }
          showIndicator(`Volume ${newVol}%`);
          break;
        }

        // Fullscreen: f / F
        case 'f':
        case 'F': {
          e.preventDefault();
          handleToggleFullscreen();
          break;
        }

        // Mute: m / M
        case 'm':
        case 'M': {
          e.preventDefault();
          const nextMute = !st.isVideoMuted;
          setIsVideoMuted(nextMute);
          if (v) v.muted = nextMute;
          showIndicator(nextMute ? 'Mute' : `Volume ${st.volume}%`);
          wakeControls();
          break;
        }

        // Subtitles toggle: c / C
        case 'c':
        case 'C': {
          e.preventDefault();
          onToggleSubtitles();
          wakeControls();
          break;
        }

        // Subtitle font size smaller: [
        case '[': {
          e.preventDefault();
          setSubSettings((prev: SubtitleSettings) => {
            const newSize = clampSize(prev.sizePercent - 10);
            const updated = { ...prev, sizePercent: newSize };
            saveSubtitleSettings(updated);
            showIndicator(`Subtitle Size ${newSize}%`);
            return updated;
          });
          break;
        }

        // Subtitle font size larger: ]
        case ']': {
          e.preventDefault();
          setSubSettings((prev: SubtitleSettings) => {
            const newSize = clampSize(prev.sizePercent + 10);
            const updated = { ...prev, sizePercent: newSize };
            saveSubtitleSettings(updated);
            showIndicator(`Subtitle Size ${newSize}%`);
            return updated;
          });
          break;
        }

        // Home: Jump to start
        case 'Home': {
          e.preventDefault();
          dispatchThrottledSeek(0, 'Start');
          break;
        }

        // End: Jump to end
        case 'End': {
          e.preventDefault();
          if (effectiveDuration > 0) {
            dispatchThrottledSeek(effectiveDuration, 'End');
          }
          break;
        }

        // Keyboard shortcuts dialog: ?
        case '?': {
          e.preventDefault();
          setShowShortcutsHelp((prev) => !prev);
          break;
        }

        // 0-9: Jump to 0% - 90%
        default: {
          if (e.key >= '0' && e.key <= '9' && effectiveDuration > 0) {
            e.preventDefault();
            const pct = parseInt(e.key, 10) * 10;
            const targetTime = (pct / 100) * effectiveDuration;
            dispatchThrottledSeek(targetTime, `${pct}%`);
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      if (batchSocketTimerRef.current) {
        clearTimeout(batchSocketTimerRef.current);
      }
      if (indicatorTimeoutRef.current) {
        clearTimeout(indicatorTimeoutRef.current);
      }
    };
  }, [
    dispatchThrottledSeek,
    flushPendingSeek,
    handlePause,
    handlePlay,
    handleToggleFullscreen,
    onToggleSubtitles,
    saveSubtitleSettings,
    setIsVideoMuted,
    setSubSettings,
    setVolume,
    showIndicator,
    videoRef,
    wakeControls,
    setActiveMenu,
  ]);

  return {
    indicator,
    showShortcutsHelp,
    setShowShortcutsHelp,
  };
}
