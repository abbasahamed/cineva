import React, { useState, useRef, useEffect } from 'react';
import { Palette, Check } from 'lucide-react';
import { useTheme, THEME_OPTIONS, ThemeColor } from '../context/ThemeContext.js';

interface ThemeSelectorProps {
  className?: string;
  align?: 'left' | 'right';
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  className = '',
  align = 'right',
}) => {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeOption = THEME_OPTIONS.find((t) => t.id === theme) || THEME_OPTIONS[0];

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      {/* Color Palette Toggle Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-slate-200 hover:text-white transition-all active:scale-95 cursor-pointer shadow-xs group"
        title="Change Theme Color"
        aria-label="Change Theme Color"
      >
        <Palette className="w-4 h-4 text-brand-400 group-hover:rotate-12 transition-transform duration-300" />
        <span
          className="w-2.5 h-2.5 rounded-full ring-2 ring-white/20 transition-all shrink-0"
          style={{ backgroundColor: activeOption.hex }}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } mt-2 w-52 rounded-2xl glass-panel-subtle border border-white/[0.14] bg-[#090b12]/95 backdrop-blur-2xl shadow-2xl p-2 z-50 animate-scaleUp`}
        >
          <div className="px-2.5 py-1.5 border-b border-white/[0.08] mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Theme Palette
            </span>
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: activeOption.hex }}
            />
          </div>

          <div className="space-y-0.5">
            {THEME_OPTIONS.map((option) => {
              const isSelected = option.id === theme;
              return (
                <button
                  key={option.id}
                  onClick={() => {
                    setTheme(option.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white/[0.12] text-white font-semibold'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full shadow-xs border border-white/20 shrink-0"
                      style={{ backgroundColor: option.hex }}
                    />
                    <span>{option.name}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-brand-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
