import React, { useRef, useState, useCallback, useEffect } from 'react';
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
  const dragStartYRef = useRef<number>(0);
  const dragStartOffsetRef = useRef<number>(0);

  // If settings panel is open and no active cue text, show the live preview text
  const displayText = cueText || (isSettingsOpen ? 'The quick brown fox' : null);

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
  // Base offset: when controls are visible, controlBarHeight + 24px; when hidden, 28px.
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

  // Background
  const backgroundColor =
    settings.background === 'none'
      ? 'transparent'
      : settings.background === 'solid'
      ? 'rgba(0, 0, 0, 0.95)'
      : 'rgba(0, 0, 0, 0.65)';

  const backdropFilter = settings.background === 'soft' ? 'blur(4px)' : undefined;
  const padding = settings.background === 'none' ? '2px 6px' : '4px 14px';

  // Text shadow / Edge
  const textShadow =
    settings.edge === 'outline'
      ? '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 3px #000, 0 2px 4px rgba(0, 0, 0, 0.85)'
      : settings.edge === 'shadow'
      ? '0 2px 8px rgba(0, 0, 0, 0.95), 0 4px 14px rgba(0, 0, 0, 0.85)'
      : 'none';

  return (
    <div
      id="custom-subtitle-overlay"
      data-testid="custom-subtitle-overlay"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: `${totalBottom}px`,
        transform: 'translateX(-50%)',
        maxWidth: '80%',
        textAlign: 'center',
        lineHeight: 1.35,
        textWrap: 'balance' as any,
        fontSize: `calc(clamp(16px, 2.2vw, 34px) * ${settings.sizePercent / 100})`,
        fontFamily:
          'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Devanagari", "Noto Sans Telugu", sans-serif',
        color: textColor,
        backgroundColor,
        backdropFilter,
        WebkitBackdropFilter: backdropFilter,
        padding,
        borderRadius: '8px',
        textShadow,
        whiteSpace: 'pre-line',
        pointerEvents: isSettingsOpen ? 'auto' : 'none',
        cursor: isSettingsOpen ? (isDragging ? 'grabbing' : 'grab') : 'default',
        userSelect: isSettingsOpen ? 'none' : 'auto',
        transition: isDragging ? 'none' : 'bottom 200ms cubic-bezier(0.16, 1, 0.3, 1), font-size 150ms ease',
        zIndex: 6, // Above video and above floating control bar (z-index 5)
        boxShadow:
          isSettingsOpen
            ? '0 0 0 1.5px rgba(255, 255, 255, 0.4), 0 8px 24px rgba(0, 0, 0, 0.6)'
            : undefined,
      }}
      title={isSettingsOpen ? 'Drag vertically to reposition subtitles' : undefined}
    >
      {parseCueFormatting(displayText)}
      {isSettingsOpen && (
        <span
          style={{
            display: 'block',
            fontSize: '11px',
            opacity: 0.75,
            marginTop: '3px',
            fontWeight: 400,
            textShadow: '0 1px 2px #000',
          }}
        >
          ↕ Drag to move ({Math.round(settings.positionOffsetPercent)}%)
        </span>
      )}
    </div>
  );
};
