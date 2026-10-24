import React, { useEffect } from 'react';
import { SubtitleSettings, clampSize, clampPosition, clampDelay, DEFAULT_SUBTITLE_SETTINGS } from '../utils/subtitleUtils.js';

interface SubtitleSettingsPanelProps {
  settings: SubtitleSettings;
  onChange: (updated: SubtitleSettings) => void;
  onBack: () => void;
  onClose: () => void;
}

export const SubtitleSettingsPanel: React.FC<SubtitleSettingsPanelProps> = ({
  settings,
  onChange,
  onBack,
  onClose,
}) => {
  const updateSetting = <K extends keyof SubtitleSettings>(key: K, value: SubtitleSettings[K]) => {
    onChange({
      ...settings,
      [key]: value,
    });
  };

  const handleReset = () => {
    onChange({
      ...DEFAULT_SUBTITLE_SETTINGS,
      delaySeconds: 0,
    });
  };

  // Keyboard Escape listener to close panel and return focus
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        const trigger = document.getElementById('sub-btn');
        trigger?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Track fill percentage calculations
  const sizePct = Math.max(0, Math.min(100, ((settings.sizePercent - 60) / (220 - 60)) * 100));
  const posPct = Math.max(0, Math.min(100, (settings.positionOffsetPercent / 70) * 100));

  const trackStyle = (pct: number): React.CSSProperties => ({
    flex: 1,
    height: '4px',
    background: `linear-gradient(to right, #ffffff 0%, #ffffff ${pct}%, rgba(255, 255, 255, 0.25) ${pct}%, rgba(255, 255, 255, 0.25) 100%)`,
    borderRadius: '2px',
    cursor: 'pointer',
    accentColor: '#ffffff',
  });

  return (
    <div
      className="sub-settings-panel"
      role="region"
      aria-label="Subtitle settings"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        width: '100%',
        padding: '12px 14px 16px',
        color: '#fff',
        fontSize: '13px',
      }}
    >
      {/* 1. Header: Back on left, title centered on ONE line, ✕ on right, all on one baseline */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          paddingBottom: '10px',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Subtitles menu"
          className="panel-nav-btn"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--tx, #fff)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '13px',
            padding: '4px 6px',
            borderRadius: '6px',
            lineHeight: 1,
          }}
        >
          <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>
        <h3 style={{ margin: 0, fontWeight: 600, fontSize: '13.5px', whiteSpace: 'nowrap', textAlign: 'center', flex: 1, padding: '0 8px' }}>
          Subtitle Settings
        </h3>
        <button
          type="button"
          onClick={() => {
            onClose();
            document.getElementById('sub-btn')?.focus();
          }}
          aria-label="Close subtitle settings"
          className="panel-nav-btn"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--tx, #fff)',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '6px',
            fontSize: '16px',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </header>

      {/* 2. Size Slider & A- / A+ buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label htmlFor="sub-size-slider" style={{ fontWeight: 500 }}>
            Size
          </label>
          <span style={{ color: 'var(--t2, #aaa)', fontSize: '12px' }}>{settings.sizePercent}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '36px' }}>
          <button
            type="button"
            id="sub-size-dec"
            aria-label="Decrease subtitle size by 10%"
            onClick={() => updateSetting('sizePercent', clampSize(settings.sizePercent - 10))}
            style={{
              height: '36px',
              padding: '0 10px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '36px',
            }}
          >
            A−
          </button>
          <input
            type="range"
            id="sub-size-slider"
            aria-label="Subtitle size percentage"
            min={60}
            max={220}
            step={1}
            value={settings.sizePercent}
            onChange={(e) => updateSetting('sizePercent', clampSize(Number(e.target.value)))}
            style={trackStyle(sizePct)}
          />
          <button
            type="button"
            id="sub-size-inc"
            aria-label="Increase subtitle size by 10%"
            onClick={() => updateSetting('sizePercent', clampSize(settings.sizePercent + 10))}
            style={{
              height: '36px',
              padding: '0 10px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '36px',
            }}
          >
            A+
          </button>
        </div>
      </div>

      {/* 3. Position Offset (0% - 70%) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label htmlFor="sub-pos-slider" style={{ fontWeight: 500 }}>
            Vertical Position
          </label>
          <span style={{ color: 'var(--t2, #aaa)', fontSize: '12px' }}>{Math.round(settings.positionOffsetPercent)}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '36px' }}>
          <button
            type="button"
            id="sub-pos-down"
            aria-label="Move subtitle position down"
            onClick={() => updateSetting('positionOffsetPercent', clampPosition(settings.positionOffsetPercent - 2))}
            style={{
              height: '36px',
              padding: '0 10px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '36px',
            }}
          >
            ↓
          </button>
          <input
            type="range"
            id="sub-pos-slider"
            aria-label="Subtitle vertical position offset"
            min={0}
            max={70}
            step={1}
            value={Math.round(settings.positionOffsetPercent)}
            onChange={(e) => updateSetting('positionOffsetPercent', clampPosition(Number(e.target.value)))}
            style={trackStyle(posPct)}
          />
          <button
            type="button"
            id="sub-pos-up"
            aria-label="Move subtitle position up"
            onClick={() => updateSetting('positionOffsetPercent', clampPosition(settings.positionOffsetPercent + 2))}
            style={{
              height: '36px',
              padding: '0 10px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '36px',
            }}
          >
            ↑
          </button>
        </div>
        <small style={{ color: 'var(--t3, #888)', fontSize: '11px', marginTop: '-2px' }}>
          Tip: You can also drag the subtitle line on the video directly.
        </small>
      </div>

      {/* 4. Background: None / Soft / Solid (Default: None) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontWeight: 500 }}>Background</span>
        <div role="radiogroup" aria-label="Subtitle background style" style={{ display: 'flex', gap: '6px' }}>
          {(['none', 'soft', 'solid'] as const).map((bg) => (
            <button
              key={bg}
              type="button"
              role="radio"
              aria-checked={settings.background === bg}
              id={`sub-bg-${bg}`}
              onClick={() => updateSetting('background', bg)}
              style={{
                flex: 1,
                padding: '7px 8px',
                borderRadius: '8px',
                border: settings.background === bg ? '1.5px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.15)',
                background: settings.background === bg ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.06)',
                color: '#fff',
                fontSize: '12px',
                fontWeight: settings.background === bg ? 600 : 400,
                textTransform: 'capitalize',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s',
              }}
            >
              {bg}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Text Colour: White / Yellow / Cyan (Default: White) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontWeight: 500 }}>Text Colour</span>
        <div role="radiogroup" aria-label="Subtitle text color" style={{ display: 'flex', gap: '6px' }}>
          {[
            { id: 'white', label: 'White', color: '#ffffff' },
            { id: 'yellow', label: 'Yellow', color: '#ffd700' },
            { id: 'cyan', label: 'Cyan', color: '#00f0ff' },
          ].map((col) => (
            <button
              key={col.id}
              type="button"
              role="radio"
              aria-checked={settings.textColor === col.id}
              id={`sub-color-${col.id}`}
              onClick={() => updateSetting('textColor', col.id as any)}
              style={{
                flex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '7px 8px',
                borderRadius: '8px',
                border: settings.textColor === col.id ? '1.5px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.15)',
                background: settings.textColor === col.id ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.06)',
                color: '#fff',
                fontSize: '12px',
                fontWeight: settings.textColor === col.id ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: col.color,
                  display: 'inline-block',
                  border: '1px solid rgba(0,0,0,0.4)',
                }}
              />
              {col.label}
            </button>
          ))}
        </div>
      </div>

      {/* 6. Edge Style: Outline / Shadow / None (Default: Outline) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontWeight: 500 }}>Edge Style</span>
        <div role="radiogroup" aria-label="Subtitle edge style" style={{ display: 'flex', gap: '6px' }}>
          {(['outline', 'shadow', 'none'] as const).map((edge) => (
            <button
              key={edge}
              type="button"
              role="radio"
              aria-checked={settings.edge === edge}
              id={`sub-edge-${edge}`}
              onClick={() => updateSetting('edge', edge)}
              style={{
                flex: 1,
                padding: '7px 8px',
                borderRadius: '8px',
                border: settings.edge === edge ? '1.5px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.15)',
                background: settings.edge === edge ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.06)',
                color: '#fff',
                fontSize: '12px',
                fontWeight: settings.edge === edge ? 600 : 400,
                textTransform: 'capitalize',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s',
              }}
            >
              {edge}
            </button>
          ))}
        </div>
      </div>

      {/* 7. Subtitle Delay (-5s to +5s, 0.1s steps) in one aligned row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label htmlFor="sub-delay-input" style={{ fontWeight: 500 }}>
            Subtitle Delay (IINA-style)
          </label>
          <span style={{ color: 'var(--t2, #aaa)', fontSize: '12px' }}>
            {settings.delaySeconds > 0 ? `+${settings.delaySeconds.toFixed(1)}s` : `${settings.delaySeconds.toFixed(1)}s`}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}>
          <button
            type="button"
            id="sub-delay-dec"
            aria-label="Decrease subtitle delay by 0.1s"
            onClick={() => updateSetting('delaySeconds', clampDelay(settings.delaySeconds - 0.1))}
            style={{
              height: '36px',
              padding: '0 10px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            −0.1s
          </button>
          <input
            type="number"
            id="sub-delay-input"
            aria-label="Subtitle delay in seconds"
            min={-5.0}
            max={5.0}
            step={0.1}
            value={settings.delaySeconds}
            onChange={(e) => updateSetting('delaySeconds', clampDelay(parseFloat(e.target.value) || 0))}
            style={{
              flex: 1,
              height: '36px',
              textAlign: 'center',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              color: '#fff',
              padding: '0 4px',
              fontSize: '13px',
              fontWeight: 500,
            }}
          />
          <button
            type="button"
            id="sub-delay-inc"
            aria-label="Increase subtitle delay by 0.1s"
            onClick={() => updateSetting('delaySeconds', clampDelay(settings.delaySeconds + 0.1))}
            style={{
              height: '36px',
              padding: '0 10px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            +0.1s
          </button>
          <button
            type="button"
            id="sub-delay-reset"
            aria-label="Reset subtitle delay to 0"
            onClick={() => updateSetting('delaySeconds', 0)}
            style={{
              height: '36px',
              padding: '0 10px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: 'var(--t2, #aaa)',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* 8. Reset to Defaults Button (Always fully visible at the bottom) */}
      <div style={{ marginTop: '2px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <button
          type="button"
          id="sub-reset-defaults-btn"
          aria-label="Reset all subtitle settings to defaults"
          onClick={handleReset}
          style={{
            width: '100%',
            height: '38px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'center',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s',
          }}
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
};
