// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useRef, useState } from 'react';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { useIdleControls } from '../hooks/useIdleControls.js';

interface TestHarnessProps {
  initialPlaying?: boolean;
  initialMediaReady?: boolean;
  initialPausedOrEndedOrLoading?: boolean;
  initialActiveMenu?: boolean;
  initialDragging?: boolean;
  isFullscreen?: boolean;
}

const TestPlayerHarness: React.FC<TestHarnessProps> = ({
  initialPlaying = true,
  initialMediaReady = true,
  initialPausedOrEndedOrLoading = false,
  initialActiveMenu = false,
  initialDragging = false,
  isFullscreen = false,
}) => {
  const stageRef = useRef<HTMLElement>(null);
  const ctlRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(initialPlaying);
  const [isMediaReady, setIsMediaReady] = useState(initialMediaReady);
  const [isPausedOrEndedOrLoading, setIsPausedOrEndedOrLoading] = useState(initialPausedOrEndedOrLoading);
  const [hasActiveMenu, setHasActiveMenu] = useState(initialActiveMenu);
  const [isDraggingSlider, setIsDraggingSlider] = useState(initialDragging);
  const [desktopClickCount, setDesktopClickCount] = useState(0);
  const [subBtnClickCount, setSubBtnClickCount] = useState(0);

  const { isIdle, controlsVisible } = useIdleControls({
    stageRef,
    ctlRef,
    isPlaying,
    isMediaReady,
    isPausedOrEndedOrLoading,
    hasActiveMenuOrModal: hasActiveMenu,
    isDraggingSlider,
    onVideoClickDesktop: () => setDesktopClickCount((c) => c + 1),
  });

  const controlBarHeight = 76;
  const subtitleBottom = controlsVisible ? controlBarHeight + 16 : 28;

  return (
    <div>
      <section
        ref={stageRef}
        id="stage"
        className={`stage ${isIdle ? 'idle' : ''} ${isFullscreen ? 'fullscreen' : ''}`}
        style={{ position: 'relative', width: 800, height: 450 }}
      >
        <div id="video-surface" style={{ width: '100%', height: '100%' }}>
          Video Content
        </div>

        {/* Subtitle element positioned dynamically based on controlsVisible */}
        <div id="subtitles" style={{ position: 'absolute', bottom: `${subtitleBottom}px` }}>
          Subtitle Text
        </div>

        {/* Control Bar */}
        <div
          ref={ctlRef}
          id="ctl"
          className="ctl gl"
          data-controls="true"
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            right: 16,
            opacity: isIdle ? 0 : 1,
            pointerEvents: isIdle ? 'none' : 'auto',
          }}
        >
          <button
            id="sub-btn"
            type="button"
            onClick={() => {
              setSubBtnClickCount((c) => c + 1);
              setHasActiveMenu((m) => !m);
            }}
          >
            Subtitles
          </button>
          <button id="play-btn" type="button" onClick={() => setIsPlaying((p) => !p)}>
            PlayPause
          </button>
          <div
            id="seek-slider"
            role="slider"
            tabIndex={0}
            data-controls="true"
            onPointerDown={() => setIsDraggingSlider(true)}
            onPointerUp={() => setIsDraggingSlider(false)}
          >
            Seekbar
          </div>
        </div>

        {/* Popover Menu */}
        {hasActiveMenu && (
          <div id="mn" role="menu" data-controls="true" style={{ position: 'absolute', bottom: 100 }}>
            <button id="menu-item-1">English</button>
          </div>
        )}
      </section>

      {/* External test controls */}
      <div id="state-readout" data-testid="is-idle">
        {String(isIdle)}
      </div>
      <div id="desktop-clicks-count">{desktopClickCount}</div>
      <div id="sub-clicks-count">{subBtnClickCount}</div>
      <button id="btn-set-paused" onClick={() => setIsPlaying(false)}>
        Pause
      </button>
      <button id="btn-set-playing" onClick={() => setIsPlaying(true)}>
        Play
      </button>
      <button id="btn-close-menu" onClick={() => setHasActiveMenu(false)}>
        CloseMenu
      </button>
      <button id="btn-open-menu" onClick={() => setHasActiveMenu(true)}>
        OpenMenu
      </button>
      <button id="btn-start-drag" onClick={() => setIsDraggingSlider(true)}>
        StartDrag
      </button>
      <button id="btn-stop-drag" onClick={() => setIsDraggingSlider(false)}>
        StopDrag
      </button>
    </div>
  );
};

describe('Controls Visibility & Idle Engine Verification across 12 Scenarios', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('1. Idle fade: start playback, wait 5000 ms without pointer interaction -> controls hidden', () => {
    const { container } = render(<TestPlayerHarness initialPlaying={true} />);
    const stage = container.querySelector('#stage')!;
    const ctl = container.querySelector('#ctl') as HTMLElement;

    expect(stage.classList.contains('idle')).toBe(false);
    expect(ctl.style.opacity).toBe('1');
    expect(ctl.style.pointerEvents).toBe('auto');

    act(() => {
      vi.advanceTimersByTime(4900);
    });
    expect(stage.classList.contains('idle')).toBe(false);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(stage.classList.contains('idle')).toBe(true);
    expect(ctl.style.opacity).toBe('0');
    expect(ctl.style.pointerEvents).toBe('none');
  });

  it('2. Wake on pointer movement: move pointer -> controls visible immediately (< 100 ms) with fresh 5s timer', () => {
    const { container } = render(<TestPlayerHarness initialPlaying={true} />);
    const stage = container.querySelector('#stage')!;

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(stage.classList.contains('idle')).toBe(true);

    act(() => {
      stage.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    });
    expect(stage.classList.contains('idle')).toBe(false);

    // Stays visible for 5s
    act(() => {
      vi.advanceTimersByTime(4800);
    });
    expect(stage.classList.contains('idle')).toBe(false);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(stage.classList.contains('idle')).toBe(true);
  });

  it('3. Click button in bar: visible for 5 seconds then whole bar disappears, moving cursor wakes freshly', () => {
    const { container } = render(<TestPlayerHarness initialPlaying={true} />);
    const stage = container.querySelector('#stage')!;
    const subBtn = container.querySelector('#sub-btn')!;

    expect(stage.classList.contains('idle')).toBe(false);

    act(() => {
      subBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
      fireEvent.click(subBtn);
    });

    // Stays visible throughout the 5 seconds after clicking
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(stage.classList.contains('idle')).toBe(false);

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(stage.classList.contains('idle')).toBe(false);

    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(stage.classList.contains('idle')).toBe(false);

    // After 5s total from click, bar disappears
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(stage.classList.contains('idle')).toBe(true);

    // Move cursor -> visible freshly
    act(() => {
      stage.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    });
    expect(stage.classList.contains('idle')).toBe(false);
  });

  it('4. Stopped cursor on player bar hides after 5 seconds', () => {
    const { container } = render(<TestPlayerHarness initialPlaying={true} />);
    const stage = container.querySelector('#stage')!;
    const ctl = container.querySelector('#ctl')!;

    // Move pointer over ctl
    act(() => {
      ctl.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
    });
    expect(stage.classList.contains('idle')).toBe(false);

    // Stop cursor for 4800ms -> still visible
    act(() => {
      vi.advanceTimersByTime(4800);
    });
    expect(stage.classList.contains('idle')).toBe(false);

    // Reaches 5000ms -> hides even if cursor is over ctl
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(stage.classList.contains('idle')).toBe(true);

    // Move cursor again -> freshly visible
    act(() => {
      ctl.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
    });
    expect(stage.classList.contains('idle')).toBe(false);
  });

  it('5. Drag seek bar: pointerdown on seek thumb -> remains visible during drag; on release, 5000ms timer applies', () => {
    const { container } = render(<TestPlayerHarness initialPlaying={true} />);
    const stage = container.querySelector('#stage')!;
    const startDragBtn = container.querySelector('#btn-start-drag')!;
    const stopDragBtn = container.querySelector('#btn-stop-drag')!;

    act(() => {
      fireEvent.click(startDragBtn);
    });

    // Remains visible past 5s while dragging
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(stage.classList.contains('idle')).toBe(false);

    // Release drag
    act(() => {
      fireEvent.click(stopDragBtn);
    });

    act(() => {
      vi.advanceTimersByTime(4800);
    });
    expect(stage.classList.contains('idle')).toBe(false);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(stage.classList.contains('idle')).toBe(true);
  });

  it('6. Touch vs Desktop distinction', () => {
    const { container } = render(<TestPlayerHarness initialPlaying={true} />);
    const stage = container.querySelector('#stage')!;
    const videoSurface = container.querySelector('#video-surface')!;
    const subBtn = container.querySelector('#sub-btn')!;
    const clicksCount = container.querySelector('#desktop-clicks-count')!;
    const subClicksCount = container.querySelector('#sub-clicks-count')!;

    // 6a. Simulated touch tap on video surface -> toggles control visibility
    act(() => {
      videoSurface.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: 400, clientY: 200 })
      );
    });
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(stage.classList.contains('idle')).toBe(true);

    // Tap again -> toggles back to visible
    act(() => {
      videoSurface.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: 400, clientY: 200 })
      );
    });
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(stage.classList.contains('idle')).toBe(false);

    // 6b. Simulated mouse click on video surface -> does NOT toggle control visibility, calls onVideoClickDesktop
    act(() => {
      videoSurface.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', clientX: 400, clientY: 200 })
      );
      fireEvent.click(videoSurface);
    });
    expect(stage.classList.contains('idle')).toBe(false);
    expect(clicksCount.textContent).toBe('1');

    // 6c. Simulated touch tap on a button -> executes button action, NEVER toggles control visibility
    act(() => {
      subBtn.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: 100, clientY: 400 })
      );
      fireEvent.click(subBtn);
    });
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(stage.classList.contains('idle')).toBe(false);
    expect(subClicksCount.textContent).toBe('1');

    // 6d. Mobile tap to wake: tapping screen when idle wakes controls immediately and keeps them visible for 5s
    // Advance time until stage becomes idle
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(stage.classList.contains('idle')).toBe(true);

    // Tap screen on mobile (pointerdown + touch click)
    act(() => {
      videoSurface.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: 400, clientY: 200 })
      );
      fireEvent.click(videoSurface);
    });
    expect(stage.classList.contains('idle')).toBe(false);

    // After 1 second (1000ms), controls MUST still be visible (not vanish after 1s!)
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(stage.classList.contains('idle')).toBe(false);

    // After 4.5 seconds (4500ms total), still visible
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(stage.classList.contains('idle')).toBe(false);

    // Reaches 5000ms -> fades out
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(stage.classList.contains('idle')).toBe(true);
  });

  it('7. Fullscreen parity: 5000ms idle fade, wakes on move, click button stays 5s then hides', () => {
    const { container } = render(<TestPlayerHarness initialPlaying={true} isFullscreen={true} />);
    const stage = container.querySelector('#stage')!;
    const subBtn = container.querySelector('#sub-btn')!;

    expect(stage.classList.contains('fullscreen')).toBe(true);

    // 5000ms idle fade
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(stage.classList.contains('idle')).toBe(true);

    // Wake up
    act(() => {
      stage.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    });
    expect(stage.classList.contains('idle')).toBe(false);

    // Clicking button stays visible for 5s then hides
    act(() => {
      subBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
      fireEvent.click(subBtn);
    });
    act(() => {
      vi.advanceTimersByTime(4800);
    });
    expect(stage.classList.contains('idle')).toBe(false);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(stage.classList.contains('idle')).toBe(true);
  });

  it('8. Subtitles repositioning: when controls visible, bottom margin is 92px; when idle after 5s, transitions down to 28px', () => {
    const { container } = render(<TestPlayerHarness initialPlaying={true} />);
    const stage = container.querySelector('#stage')!;
    const subs = container.querySelector('#subtitles') as HTMLElement;

    expect(stage.classList.contains('idle')).toBe(false);
    expect(subs.style.bottom).toBe('92px');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(stage.classList.contains('idle')).toBe(true);
    expect(subs.style.bottom).toBe('28px');

    act(() => {
      stage.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    });
    expect(stage.classList.contains('idle')).toBe(false);
    expect(subs.style.bottom).toBe('92px');
  });
});
