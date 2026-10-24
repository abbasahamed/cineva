import React, { useEffect, useRef, useState, useCallback } from "react";

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  maxHeight?: string;
  triggerRef?: React.RefObject<HTMLElement | null> | HTMLElement | null;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  maxHeight = "70dvh",
  triggerRef,
  children,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const currentTranslateY = useRef<number>(0);
  const [dragOffset, setDragOffset] = useState<number>(0);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Focus management & Escape key listener
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      // Focus sheet or first focusable element
      setTimeout(() => {
        const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable && focusable.length > 0) {
          focusable[0].focus();
        } else {
          sheetRef.current?.focus();
        }
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        } else if (e.key === "Tab" && sheetRef.current) {
          const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    } else {
      // Return focus
      if (triggerRef) {
        if ("current" in triggerRef && triggerRef.current) {
          triggerRef.current.focus();
        } else if (triggerRef instanceof HTMLElement) {
          triggerRef.focus();
        }
      } else if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    }
  }, [isOpen, onClose, triggerRef]);

  // Swipe-down touch handlers
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStartY.current = clientY;
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (dragStartY.current === null) return;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const delta = clientY - dragStartY.current;
    if (delta > 0) {
      currentTranslateY.current = delta;
      setDragOffset(delta);
    }
  };

  const handleTouchEnd = () => {
    if (dragStartY.current !== null) {
      if (currentTranslateY.current > 75) {
        onClose();
      }
      dragStartY.current = null;
      currentTranslateY.current = 0;
      setDragOffset(0);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="bottom-sheet-root"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      {/* Backdrop */}
      <div
        className="bottom-sheet-backdrop"
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0, 0, 0, 0.65)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          animation: "bsFadeIn 200ms ease forwards",
        }}
      />

      {/* Sheet Container */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Menu sheet"}
        tabIndex={-1}
        className="bottom-sheet-content gl"
        style={{
          position: "relative",
          width: "100%",
          maxHeight: maxHeight,
          display: "flex",
          flexDirection: "column",
          borderRadius: "20px 20px 0 0",
          background: "rgba(18, 20, 29, 0.96)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(255, 255, 255, 0.16)",
          boxShadow: "0 -12px 40px rgba(0, 0, 0, 0.8)",
          transform: `translateY(${dragOffset}px)`,
          transition: dragOffset === 0 ? "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)" : "none",
          animation: "bsSlideUp 220ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grabber Area for Dragging */}
        <div
          className="bottom-sheet-grabber-zone"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart}
          onMouseMove={handleTouchMove}
          onMouseUp={handleTouchEnd}
          style={{
            width: "100%",
            padding: "10px 0 6px",
            display: "flex",
            justifyContent: "center",
            cursor: "grab",
            touchAction: "none",
            flexShrink: 0,
          }}
        >
          <div
            className="bottom-sheet-grabber"
            style={{
              width: "40px",
              height: "4px",
              borderRadius: "99px",
              background: "rgba(255, 255, 255, 0.35)",
            }}
          />
        </div>

        {/* Optional Header */}
        {title && (
          <div
            className="bottom-sheet-header"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 16px 10px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              flexShrink: 0,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: 600,
                color: "#ffffff",
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                width: "44px",
                height: "44px",
                display: "grid",
                placeItems: "center",
                borderRadius: "10px",
                background: "transparent",
                border: "none",
                color: "rgba(255, 255, 255, 0.6)",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Scrollable Body */}
        <div
          className="bottom-sheet-body"
          style={{
            flex: 1,
            overflowY: "auto",
            overscrollBehavior: "contain",
            padding: "12px 16px",
            WebkitOverflowScrolling: "touch",
            minHeight: 0,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
