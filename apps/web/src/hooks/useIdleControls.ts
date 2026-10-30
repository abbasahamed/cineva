import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseIdleControlsOptions {
  stageRef: React.RefObject<HTMLElement | null>;
  ctlRef?: React.RefObject<HTMLElement | null>;
  isPlaying: boolean;
  isMediaReady: boolean;
  isPausedOrEndedOrLoading?: boolean;
  hasActiveMenuOrModal: boolean;
  isDraggingSlider: boolean;
  onVideoClickDesktop?: () => void;
  onDoubleTapSeek?: (side: 'left' | 'right') => void;
}

export interface UseIdleControlsReturn {
  isIdle: boolean;
  controlsVisible: boolean;
  wakeControls: () => void;
  registerInteractiveRegion: (el: HTMLElement | null) => () => void;
}

export function useIdleControls({
  stageRef,
  ctlRef,
  isPlaying,
  isMediaReady,
  isPausedOrEndedOrLoading = false,
  hasActiveMenuOrModal,
  isDraggingSlider,
  onVideoClickDesktop,
  onDoubleTapSeek,
}: UseIdleControlsOptions): UseIdleControlsReturn {
  const [isIdle, setIsIdle] = useState(false);
  const isIdleRef = useRef(isIdle);
  isIdleRef.current = isIdle;

  // Synchronized refs to eliminate stale closure bugs inside timer callbacks
  const isPlayingRef = useRef(isPlaying);
  const isMediaReadyRef = useRef(isMediaReady);
  const isPausedOrEndedOrLoadingRef = useRef(isPausedOrEndedOrLoading);
  const hasActiveMenuOrModalRef = useRef(hasActiveMenuOrModal);
  const isDraggingSliderRef = useRef(isDraggingSlider);
  const onVideoClickDesktopRef = useRef(onVideoClickDesktop);
  const onDoubleTapSeekRef = useRef(onDoubleTapSeek);

  isPlayingRef.current = isPlaying;
  isMediaReadyRef.current = isMediaReady;
  isPausedOrEndedOrLoadingRef.current = isPausedOrEndedOrLoading;
  hasActiveMenuOrModalRef.current = hasActiveMenuOrModal;
  isDraggingSliderRef.current = isDraggingSlider;
  onVideoClickDesktopRef.current = onVideoClickDesktop;
  onDoubleTapSeekRef.current = onDoubleTapSeek;

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const singleTapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const touchActiveRef = useRef<boolean>(false);

  // Helper to test if an element is part of the interactive controls
  const isTargetInteractive = useCallback((target: EventTarget | null): boolean => {
    if (!target || !(target instanceof Element)) return false;
    return !!target.closest(
      '[data-controls], [role="menu"], [role="dialog"], [role="slider"], button, input, select, textarea, a, .ctl, .ovl, .mn, .sub-settings, .seg'
    );
  }, []);

  // Determine if controls MUST remain visible (e.g. while actively dragging seek thumb or before media is ready)
  const shouldControlsBeVisible = useCallback((): boolean => {
    if (!isMediaReadyRef.current) return true;
    if (isDraggingSliderRef.current) return true;
    return false;
  }, []);

  // Clear running timers
  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  // Evaluates idle state and starts 5000ms timer
  const scheduleIdleTimer = useCallback(() => {
    clearTimers();
    if (shouldControlsBeVisible()) {
      setIsIdle(false);
      return;
    }
    idleTimerRef.current = setTimeout(() => {
      if (!shouldControlsBeVisible()) {
        setIsIdle(true);
      }
    }, 5000);
  }, [clearTimers, shouldControlsBeVisible]);

  // Wake controls immediately on any user interaction (fresh 5000ms countdown)
  const wakeControls = useCallback(() => {
    setIsIdle(false);
    scheduleIdleTimer();
  }, [scheduleIdleTimer]);

  // Register interactive elements (menus, controls, dialogs)
  const registerInteractiveRegion = useCallback((el: HTMLElement | null) => {
    if (!el) return () => {};
    el.setAttribute('data-controls', 'true');

    const onInteraction = () => {
      wakeControls();
    };

    el.addEventListener('pointermove', onInteraction, { passive: true });
    el.addEventListener('pointerdown', onInteraction);

    return () => {
      el.removeEventListener('pointermove', onInteraction);
      el.removeEventListener('pointerdown', onInteraction);
    };
  }, [wakeControls]);

  // Synchronize state when dragging or media readiness changes
  useEffect(() => {
    if (shouldControlsBeVisible()) {
      setIsIdle(false);
      clearTimers();
    } else {
      scheduleIdleTimer();
    }
  }, [isPlaying, isMediaReady, isDraggingSlider, shouldControlsBeVisible, clearTimers, scheduleIdleTimer]);

  // Attach stage & global listeners
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    // Attach data-controls registration to ctl if ref is provided
    let unregisterCtl: (() => void) | undefined;
    if (ctlRef?.current) {
      unregisterCtl = registerInteractiveRegion(ctlRef.current);
    }

    const handlePointerMove = (e: PointerEvent) => {
      // Touch moves (scrolling, finger drag, tremors) must not trigger desktop wake or race with touch taps
      if (e.pointerType === 'touch') return;
      wakeControls();
    };

    const handlePointerDown = (e: PointerEvent) => {
      // Check if click was on control bar, button, slider, menu, or modal
      const interactive = isTargetInteractive(e.target);
      if (interactive) {
        touchActiveRef.current = false;
        // Clicks on controls NEVER toggle or hide controls; wake controls with fresh 5s countdown
        wakeControls();
        return;
      }

      // Gesture tap on video surface
      const isTouch =
        e.pointerType === 'touch' ||
        (e.pointerType !== 'mouse' && typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches);
      if (isTouch) {
        touchActiveRef.current = true;
        const now = Date.now();
        const delta = now - lastTapTimeRef.current;
        const rect = stage.getBoundingClientRect();

        if (delta < 300 && rect) {
          // Double-tap
          if (singleTapTimerRef.current) {
            clearTimeout(singleTapTimerRef.current);
            singleTapTimerRef.current = null;
          }
          lastTapTimeRef.current = 0;
          wakeControls();
          const relX = e.clientX - rect.left;
          const width = rect.width;
          if (relX < width / 3) {
            onDoubleTapSeekRef.current?.('left');
          } else if (relX > (width * 2) / 3) {
            onDoubleTapSeekRef.current?.('right');
          } else {
            onVideoClickDesktopRef.current?.();
          }
        } else {
          lastTapTimeRef.current = now;
          const wasIdle = isIdleRef.current;
          if (wasIdle) {
            // Screen was idle (controls hidden): immediately wake controls so they appear with zero lag
            // and remain visible for 5000ms
            wakeControls();
          }

          if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = setTimeout(() => {
            if (!wasIdle) {
              // Tap on video surface while controls were already visible: toggle idle state to hide them
              setIsIdle(true);
              clearTimers();
            }
            singleTapTimerRef.current = null;
          }, 300);
        }
      } else {
        touchActiveRef.current = false;
        wakeControls();
      }
    };

    const handleClick = (e: MouseEvent) => {
      const interactive = isTargetInteractive(e.target);
      if (interactive) {
        wakeControls();
        return;
      }

      // If this click was synthesized by a touch tap, skip desktop play/pause and wake calls
      if (touchActiveRef.current) {
        touchActiveRef.current = false;
        return;
      }

      const isTouch =
        (e as any).pointerType === 'touch' ||
        ((e as any).pointerType !== 'mouse' && typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches);
      if (isTouch) {
        return;
      }

      wakeControls();
      onVideoClickDesktopRef.current?.();
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (isTargetInteractive(e.target)) {
        wakeControls();
      }
    };

    const handleFocusOut = () => {
      scheduleIdleTimer();
    };

    const handleKeyDown = () => {
      // Any key press inside stage or room wakes controls
      wakeControls();
    };

    const handleWheel = () => {
      wakeControls();
    };

    stage.addEventListener('pointermove', handlePointerMove, { passive: true });
    stage.addEventListener('pointerdown', handlePointerDown);
    stage.addEventListener('click', handleClick);
    stage.addEventListener('focusin', handleFocusIn);
    stage.addEventListener('focusout', handleFocusOut);
    stage.addEventListener('keydown', handleKeyDown);
    stage.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      if (unregisterCtl) unregisterCtl();
      clearTimers();
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      stage.removeEventListener('pointermove', handlePointerMove);
      stage.removeEventListener('pointerdown', handlePointerDown);
      stage.removeEventListener('click', handleClick);
      stage.removeEventListener('focusin', handleFocusIn);
      stage.removeEventListener('focusout', handleFocusOut);
      stage.removeEventListener('keydown', handleKeyDown);
      stage.removeEventListener('wheel', handleWheel);
    };
  }, [stageRef, ctlRef, isTargetInteractive, wakeControls, scheduleIdleTimer, clearTimers, registerInteractiveRegion]);

  return {
    isIdle,
    controlsVisible: !isIdle,
    wakeControls,
    registerInteractiveRegion,
  };
}
