import React from 'react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const SHORTCUTS = [
    { key: '← / →', desc: 'Seek backward / forward 10s' },
    { key: 'Shift + ← / →', desc: 'Seek backward / forward 30s' },
    { key: 'J / L', desc: 'Seek backward / forward 10s' },
    { key: 'Space or K', desc: 'Play / Pause' },
    { key: '↑ / ↓', desc: 'Volume up / down 5%' },
    { key: 'M', desc: 'Mute / Unmute' },
    { key: 'F', desc: 'Toggle Fullscreen' },
    { key: 'C', desc: 'Toggle Subtitles' },
    { key: '[ / ]', desc: 'Subtitle Size −10% / +10%' },
    { key: '0 – 9', desc: 'Jump to 0% – 90% of duration' },
    { key: 'Home / End', desc: 'Jump to beginning / end' },
    { key: '?', desc: 'Toggle this cheat sheet' },
    { key: 'Esc', desc: 'Close dialogs / menus' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '420px',
          maxWidth: 'calc(100vw - 32px)',
          background: 'rgba(18, 20, 29, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '16px',
          padding: '20px 24px',
          color: '#fff',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.8)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Keyboard Shortcuts</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--tx, #fff)',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '4px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', maxHeight: '60vh', overflowY: 'auto' }}>
          {SHORTCUTS.map((s) => (
            <React.Fragment key={s.key}>
              <kbd
                style={{
                  padding: '3px 8px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  display: 'inline-block',
                }}
              >
                {s.key}
              </kbd>
              <span style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.85)', alignSelf: 'center' }}>{s.desc}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
