import React, { useRef, useState, useCallback } from 'react';
import { SubtitleSettings, parseCueFormatting } from '../utils/subtitleUtils.js';

interface SubtitleOverlayProps {
  cueText: string | null;
  settings: SubtitleSettings;
  controlsVisible: boolean;
  controlBarHeight: number;
  isSettingsOpen: boolean;
  onUpdatePositionOffset: (offsetPercent: number) => void;
  stageElement: HTMLElement | null;
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  cueText,
  settings,
  controlsVisible,
  controlBarHeight,
  isSettingsOpen,
  onUpdatePositionOffset,
  stageElement,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragStartYRef = useRef<number>(0);
  const dragStartOffsetRef = useRef<number>(0);

  // If settings panel is open and no active cue text, show the live preview text
  const displayText = cueText || (isSettingsOpen ? 'The quick brown fox jumps over the lazy dog' : null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isSettingsOpen || !stageElement) return;
      e.stopPropagation();
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      setIsDragging(true);
      dragStartYRef.current = e.clientY;
      dragStartOffsetRef.current = settings.positionOffsetPercent;
    },
    [isSettingsOpen, stageElement, settings.positionOffsetPercent]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging || !stageElement) return;
      e.stopPropagation();
      e.preventDefault();

      const stageHeight = stageElement.clientHeight || 1;
      // Moving UP (negative delta Y) increases bottom offset percentage
      const deltaY = dragStartYRef.current - e.clientY;
      const deltaPercent = (deltaY / stageHeight) * 100;
      const newOffset = Math.max(0, Math.min(70, Math.round((dragStartOffsetRef.current + deltaPercent) * 10) / 10));

      onUpdatePositionOffset(newOffset);
    },
    [isDragging, stageElement, onUpdatePositionOffset]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      e.stopPropagation();
      e.preventDefault();
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setIsDragging(false);
    },
    [isDragging]
  );

  if (!displayText) {
    return null;
  }

  // Calculate bottom offset:
  const stageHeight = stageElement?.clientHeight || 600;
  const isControlsActuallyVisible = controlsVisible && (!stageElement || !stageElement.classList.contains('idle'));
  const baseBottom = isControlsActuallyVisible ? controlBarHeight + 24 : 28;
  const userOffsetPixels = (settings.positionOffsetPercent / 100) * stageHeight;
  const totalBottom = baseBottom + userOffsetPixels;

  // Colors
  const textColor =
    settings.textColor === 'yellow'
      ? '#ffd700'
      : settings.textColor === 'cyan'
      ? '#00f0ff'
      : '#ffffff';

  // Text stroke & shadow for crisp readability
  let textShadow: string | undefined;
  let strokeStyle: React.CSSProperties = {};

  if (settings.edge === 'outline') {
    strokeStyle = {
      paintOrder: 'stroke fill',
      WebkitTextStroke: '1.5px #000',
    };
    textShadow =
      '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 1px 3px rgba(0, 0, 0, 0.9)';
  } else if (settings.edge === 'shadow') {
    textShadow = '0 2px 6px rgba(0, 0, 0, 0.95), 0 4px 12px rgba(0, 0, 0, 0.85)';
  } else {
    textShadow = 'none';
  }

  const hasBackground = settings.background === 'soft' || settings.background === 'solid';
  const spanBgColor =
    settings.background === 'solid'
      ? 'rgba(0, 0, 0, 0.95)'
      : settings.background === 'soft'
      ? 'rgba(0, 0, 0, 0.72)'
      : 'transparent';

  const showDashedOutline = isSettingsOpen && (isHovered || isDragging);

  const isNarrowScreen = typeof window !== 'undefined' && window.innerWidth < 700;
  const calculatedBottom = isSettingsOpen && isNarrowScreen ? 'calc(55% + 16px)' : `${totalBottom}px`;
  const calculatedLeft = isSettingsOpen && !isNarrowScreen ? 'calc((100% - 340px) / 2)' : '50%';
  const calculatedMaxWidth = isSettingsOpen && !isNarrowScreen ? 'calc(100% - 360px)' : '85%';

  return (
    <div
      id="custom-subtitle-overlay"
      data-testid="custom-subtitle-overlay"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerEnter={() => isSettingsOpen && setIsHovered(true)}
      onPointerLeave={() => isSettingsOpen && setIsHovered(false)}
      style={{
        position: 'absolute',
        left: calculatedLeft,
        bottom: calculatedBottom,
        transform: 'translateX(-50%)',
        maxWidth: calculatedMaxWidth,
        textAlign: 'center',
        lineHeight: 1.35,
        textWrap: 'balance' as any,
        fontSize: `calc(clamp(16px, 2.2vw, 34px) * ${settings.sizePercent / 100})`,
        fontFamily:
          'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Devanagari", "Noto Sans Telugu", sans-serif',
        color: textColor,
        background: 'transparent',
        border: 'none',
        boxShadow: 'none',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        padding: '0',
        whiteSpace: 'pre-line',
        pointerEvents: isSettingsOpen ? 'auto' : 'none',
        cursor: isSettingsOpen ? (isDragging ? 'grabbing' : 'grab') : 'default',
        userSelect: isSettingsOpen ? 'none' : 'auto',
        transition: isDragging ? 'none' : 'bottom 200ms cubic-bezier(0.16, 1, 0.3, 1), font-size 150ms ease',
        zIndex: 6, // Above video and above floating control bar (z-index 5)
        outline: showDashedOutline ? '1px dashed rgba(255, 255, 255, 0.4)' : 'none',
        outlineOffset: '4px',
        borderRadius: '2px',
        ...strokeStyle,
        textShadow,
      }}
      title={isSettingsOpen ? 'Drag vertically to reposition subtitles' : undefined}
    >
      {/* Tiny hint label strictly ABOVE the dashed outline when settings panel is open */}
      {isSettingsOpen && (
        <span
          id="sub-drag-hint"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            fontSize: '11px',
            lineHeight: 1,
            fontWeight: 500,
            color: 'rgba(255, 255, 255, 0.9)',
            background: 'rgba(15, 17, 23, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            padding: '3px 8px',
            borderRadius: '4px',
            pointerEvents: 'none',
            backdropFilter: 'blur(4px)',
            textShadow: '0 1px 2px #000',
            opacity: showDashedOutline ? 1 : 0.75,
            transition: 'opacity 150ms ease',
          }}
        >
          ↕ Drag to move ({Math.round(settings.positionOffsetPercent)}%)
        </span>
      )}

      {hasBackground ? (
        <span
          style={{
            background: spanBgColor,
            boxDecorationBreak: 'clone',
            WebkitBoxDecorationBreak: 'clone',
            padding: '2px 10px',
            borderRadius: '6px',
            backdropFilter: settings.background === 'soft' ? 'blur(4px)' : undefined,
            WebkitBackdropFilter: settings.background === 'soft' ? 'blur(4px)' : undefined,
            display: 'inline',
          }}
        >
          {parseCueFormatting(displayText)}
        </span>
      ) : (
        parseCueFormatting(displayText)
      )}
    </div>
  );
};
