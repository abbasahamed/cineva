import React, { useRef } from 'react';

export interface SliderProps {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

export const Slider: React.FC<SliderProps> = ({
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
  ariaLabel = 'Slider',
  className = '',
  disabled = false,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const updateVal = (clientX: number) => {
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + pos * (max - min);
      const stepped = Math.round(raw / step) * step;
      onChange(Math.max(min, Math.min(max, stepped)));
    };

    updateVal(e.clientX);

    const onPointerMove = (moveEvent: PointerEvent) => {
      updateVal(moveEvent.clientX);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    let nextVal = value;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      nextVal = Math.min(max, value + step);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      nextVal = Math.max(min, value - step);
      e.preventDefault();
    } else if (e.key === 'Home') {
      nextVal = min;
      e.preventDefault();
    } else if (e.key === 'End') {
      nextVal = max;
      e.preventDefault();
    }
    if (nextVal !== value) {
      onChange(nextVal);
    }
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      className={`relative h-6 flex items-center cursor-pointer select-none touch-none outline-none group ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      } ${className}`.trim()}
    >
      {/* Background track (4px) */}
      <div className="w-full h-1 rounded-full bg-white/[0.14] overflow-hidden">
        {/* Filled part */}
        <div
          className="h-full bg-white/90 rounded-full transition-all duration-75"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Thumb */}
      <div
        className="absolute w-3.5 h-3.5 bg-white rounded-full shadow-md -translate-x-1/2 transition-transform duration-75 group-hover:scale-125 group-focus-visible:ring-2 group-focus-visible:ring-white/50"
        style={{ left: `${percentage}%` }}
      />
    </div>
  );
};
