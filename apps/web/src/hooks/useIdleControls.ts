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
  const isPointerOverControlsRef = useRef(false);
  const pointerOverRegionsCountRef = useRef(0);
  const isFocusInsideControlsRef = useRef(false);

  isPlayingRef.current = isPlaying;
  isMediaReadyRef.current = isMediaReady;
  isPausedOrEndedOrLoadingRef.current = isPausedOrEndedOrLoading;
  hasActiveMenuOrModalRef.current = hasActiveMenuOrModal;
  isDraggingSliderRef.current = isDraggingSlider;

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

  // Determine if controls MUST remain visible
  const shouldControlsBeVisible = useCallback((): boolean => {
    if (!isMediaReadyRef.current) return true;
    if (!isPlayingRef.current) return true;
    if (isPausedOrEndedOrLoadingRef.current) return true;
    if (hasActiveMenuOrModalRef.current) return true;
    if (isDraggingSliderRef.current) return true;
    if (isPointerOverControlsRef.current || pointerOverRegionsCountRef.current > 0) return true;
    if (isFocusInsideControlsRef.current) return true;
    return false;
  }, []);

  // Clear running timers
  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  // Evaluates idle state and starts 3000ms timer if applicable
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
    }, 3000);
  }, [clearTimers, shouldControlsBeVisible]);

  // Wake controls immediately on any user interaction
  const wakeControls = useCallback(() => {
    setIsIdle(false);
    scheduleIdleTimer();
  }, [scheduleIdleTimer]);

  // Register interactive elements (menus, controls, dialogs)
  const registerInteractiveRegion = useCallback((el: HTMLElement | null) => {
    if (!el) return () => {};
    el.setAttribute('data-controls', 'true');

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      pointerOverRegionsCountRef.current++;
      isPointerOverControlsRef.current = true;
      setIsIdle(false);
      clearTimers();
    };

    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      pointerOverRegionsCountRef.current = Math.max(0, pointerOverRegionsCountRef.current - 1);
      if (pointerOverRegionsCountRef.current === 0) {
        isPointerOverControlsRef.current = false;
      }
      scheduleIdleTimer();
    };

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);

    return () => {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [clearTimers, scheduleIdleTimer]);

  // Synchronize state when external inputs change (e.g. paused, menu opened, slider drag)
  useEffect(() => {
    if (shouldControlsBeVisible()) {
      setIsIdle(false);
      clearTimers();
    } else {
      scheduleIdleTimer();
    }
  }, [isPlaying, isMediaReady, isPausedOrEndedOrLoading, hasActiveMenuOrModal, isDraggingSlider, shouldControlsBeVisible, clearTimers, scheduleIdleTimer]);

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
      if (e.pointerType !== 'touch') {
        const interactive = isTargetInteractive(e.target);
        if (interactive) {
          isPointerOverControlsRef.current = true;
        }
      }
      wakeControls();
    };

    const handlePointerDown = (e: PointerEvent) => {
      wakeControls();

      // Check if click was on control bar, button, slider, menu, or modal
      const interactive = isTargetInteractive(e.target);
      if (interactive) {
        // Clicks on controls NEVER toggle or hide controls!
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
            onDoubleTapSeek?.('left');
          } else if (relX > (width * 2) / 3) {
            onDoubleTapSeek?.('right');
          } else {
            onVideoClickDesktop?.();
          }
        } else {
          lastTapTimeRef.current = now;
          if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = setTimeout(() => {
            // Touch single tap on video surface toggles controls
            setIsIdle((prev) => !prev);
            singleTapTimerRef.current = null;
          }, 300);
        }
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
        onVideoClickDesktop?.();
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (isTargetInteractive(e.target)) {
        isFocusInsideControlsRef.current = true;
        setIsIdle(false);
        clearTimers();
      }
    };

    const handleFocusOut = () => {
      setTimeout(() => {
        const active = document.activeElement;
        if (active && isTargetInteractive(active)) {
          isFocusInsideControlsRef.current = true;
        } else {
          isFocusInsideControlsRef.current = false;
          scheduleIdleTimer();
        }
      }, 10);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [stageRef, ctlRef, isTargetInteractive, wakeControls, scheduleIdleTimer, clearTimers, registerInteractiveRegion, onVideoClickDesktop, onDoubleTapSeek]);

  return {
    isIdle,
    controlsVisible: !isIdle,
    wakeControls,
    registerInteractiveRegion,
  };
}
