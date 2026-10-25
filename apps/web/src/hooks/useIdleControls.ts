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

    const handlePointerMove = () => {
      wakeControls();
    };

    const handlePointerDown = (e: PointerEvent) => {
      // Check if click was on control bar, button, slider, menu, or modal
      const interactive = isTargetInteractive(e.target);
      if (interactive) {
        // Clicks on controls NEVER toggle or hide controls; wake controls with fresh 5s countdown
        wakeControls();
        return;
      }

      // Gesture tap on video surface
      const isTouch =
        e.pointerType === 'touch' ||
        (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches);
      if (isTouch) {
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
          if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = setTimeout(() => {
            // Touch single tap on video surface toggles controls
            setIsIdle((prev) => {
              const next = !prev;
              if (!next) {
                scheduleIdleTimer();
              }
              return next;
            });
            singleTapTimerRef.current = null;
          }, 300);
        }
      } else {
        wakeControls();
      }
    };

    const handleClick = (e: MouseEvent) => {
      wakeControls();
      const interactive = isTargetInteractive(e.target);
      if (interactive) return;

      const isTouch =
        (e as any).pointerType === 'touch' ||
        (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches);
      if (!isTouch) {
        // Desktop click on video background toggles play/pause
        onVideoClickDesktopRef.current?.();
      }
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
