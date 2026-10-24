import React from 'react';
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

  return (
    <div
      className="sub-settings-panel"
      role="region"
      aria-label="Subtitle settings"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '310px',
        maxWidth: 'calc(100vw - 32px)',
        padding: '8px 10px 12px',
        color: '#fff',
        fontSize: '13px',
      }}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
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
            fontSize: '12.5px',
            padding: '4px 6px',
            borderRadius: '6px',
          }}
        >
          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>
        <span style={{ fontWeight: 600, fontSize: '13.5px' }}>Subtitle Settings</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close subtitle settings"
          className="panel-nav-btn"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--tx, #fff)',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '6px',
            fontSize: '14px',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* 1. Size Slider & A- / A+ buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label htmlFor="sub-size-slider" style={{ fontWeight: 500 }}>
            Size
          </label>
          <span style={{ color: 'var(--t2, #aaa)', fontSize: '12px' }}>{settings.sizePercent}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            id="sub-size-dec"
            aria-label="Decrease subtitle size by 10%"
            onClick={() => updateSetting('sizePercent', clampSize(settings.sizePercent - 10))}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              fontSize: '12px',
              cursor: 'pointer',
              minWidth: '32px',
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
            style={{ flex: 1, accentColor: 'var(--accent, #6366f1)', cursor: 'pointer' }}
          />
          <button
            type="button"
            id="sub-size-inc"
            aria-label="Increase subtitle size by 10%"
            onClick={() => updateSetting('sizePercent', clampSize(settings.sizePercent + 10))}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              fontSize: '12px',
              cursor: 'pointer',
              minWidth: '32px',
            }}
          >
            A+
          </button>
        </div>
      </div>

      {/* 2. Position Offset (0% - 70%) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label htmlFor="sub-pos-slider" style={{ fontWeight: 500 }}>
            Vertical Position
          </label>
          <span style={{ color: 'var(--t2, #aaa)', fontSize: '12px' }}>{Math.round(settings.positionOffsetPercent)}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            id="sub-pos-down"
            aria-label="Move subtitle position down"
            onClick={() => updateSetting('positionOffsetPercent', clampPosition(settings.positionOffsetPercent - 2))}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              fontSize: '12px',
              cursor: 'pointer',
              minWidth: '32px',
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
            style={{ flex: 1, accentColor: 'var(--accent, #6366f1)', cursor: 'pointer' }}
          />
          <button
            type="button"
            id="sub-pos-up"
            aria-label="Move subtitle position up"
            onClick={() => updateSetting('positionOffsetPercent', clampPosition(settings.positionOffsetPercent + 2))}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              fontSize: '12px',
              cursor: 'pointer',
              minWidth: '32px',
            }}
          >
            ↑
          </button>
        </div>
        <small style={{ color: 'var(--t3, #888)', fontSize: '11px', marginTop: '-2px' }}>
          Tip: You can also drag the subtitle line on the video directly.
        </small>
      </div>

      {/* 3. Background: None / Soft / Solid */}
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
                padding: '6px 8px',
                borderRadius: '8px',
                border: settings.background === bg ? '1.5px solid var(--accent, #6366f1)' : '1px solid rgba(255, 255, 255, 0.15)',
                background: settings.background === bg ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                color: '#fff',
                fontSize: '12px',
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

      {/* 4. Text Colour: White / Yellow / Cyan */}
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
                padding: '6px 8px',
                borderRadius: '8px',
                border: settings.textColor === col.id ? '1.5px solid var(--accent, #6366f1)' : '1px solid rgba(255, 255, 255, 0.15)',
                background: settings.textColor === col.id ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                color: '#fff',
                fontSize: '12px',
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
                }}
              />
              {col.label}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Edge: Outline / Shadow / None */}
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
                padding: '6px 8px',
                borderRadius: '8px',
                border: settings.edge === edge ? '1.5px solid var(--accent, #6366f1)' : '1px solid rgba(255, 255, 255, 0.15)',
                background: settings.edge === edge ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                color: '#fff',
                fontSize: '12px',
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

      {/* 6. Subtitle Delay (-5s to +5s, 0.1s steps) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label htmlFor="sub-delay-input" style={{ fontWeight: 500 }}>
            Subtitle Delay (IINA-style)
          </label>
          <span style={{ color: 'var(--t2, #aaa)', fontSize: '12px' }}>
            {settings.delaySeconds > 0 ? `+${settings.delaySeconds.toFixed(1)}s` : `${settings.delaySeconds.toFixed(1)}s`}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            id="sub-delay-dec"
            aria-label="Decrease subtitle delay by 0.1s"
            onClick={() => updateSetting('delaySeconds', clampDelay(settings.delaySeconds - 0.1))}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              fontSize: '13px',
              cursor: 'pointer',
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
              width: '65px',
              textAlign: 'center',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              color: '#fff',
              padding: '4px 6px',
              fontSize: '13px',
            }}
          />
          <button
            type="button"
            id="sub-delay-inc"
            aria-label="Increase subtitle delay by 0.1s"
            onClick={() => updateSetting('delaySeconds', clampDelay(settings.delaySeconds + 0.1))}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              fontSize: '13px',
              cursor: 'pointer',
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
              padding: '5px 8px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: 'var(--t2, #aaa)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* 7. Reset to Defaults Button */}
      <div style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <button
          type="button"
          id="sub-reset-defaults-btn"
          aria-label="Reset all subtitle settings to defaults"
          onClick={handleReset}
          style={{
            width: '100%',
            padding: '7px 12px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#fff',
            fontSize: '12px',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'background 0.15s',
          }}
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
};
