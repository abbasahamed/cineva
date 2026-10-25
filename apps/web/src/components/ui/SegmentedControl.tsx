import React, { useRef, useState, useEffect } from 'react';

export interface SegmentedControlOption {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  className = '',
  ariaLabel = 'Segmented options',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!containerRef.current) return;
    const activeIndex = options.findIndex((opt) => opt.value === value);
    if (activeIndex === -1) return;

    const buttons = containerRef.current.querySelectorAll('button');
    const activeButton = buttons[activeIndex];
    if (activeButton) {
      setIndicatorStyle({
        width: `${activeButton.offsetWidth}px`,
        transform: `translateX(${activeButton.offsetLeft}px)`,
      });
    }
  }, [value, options]);

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className={`relative inline-flex items-center p-1 rounded-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-md ${className}`.trim()}
    >
      <div
        className="absolute top-1 bottom-1 left-0 rounded-full bg-white/[0.12] shadow-sm transition-all duration-200 pointer-events-none ease-out"
        style={indicatorStyle}
      />
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(opt.value)}
            className={`relative z-10 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
              isSelected ? 'text-white' : 'text-white/60 hover:text-white/80'
            }`}
          >
            {opt.icon && <span className="inline-flex items-center">{opt.icon}</span>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
