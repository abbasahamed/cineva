import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeColor = 'blue' | 'red' | 'purple' | 'emerald' | 'amber' | 'rose';

export interface ThemeOption {
  id: ThemeColor;
  name: string;
  badgeBg: string;
  previewGradient: string;
  hex: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'blue',
    name: 'Electric Blue',
    badgeBg: 'bg-indigo-500',
    previewGradient: 'from-indigo-500 to-blue-600',
    hex: '#6366f1',
  },
  {
    id: 'red',
    name: 'Crimson Red',
    badgeBg: 'bg-red-500',
    previewGradient: 'from-red-500 to-rose-600',
    hex: '#ef4444',
  },
  {
    id: 'purple',
    name: 'Cyber Purple',
    badgeBg: 'bg-purple-500',
    previewGradient: 'from-purple-500 to-violet-600',
    hex: '#a855f7',
  },
  {
    id: 'emerald',
    name: 'Neon Emerald',
    badgeBg: 'bg-emerald-500',
    previewGradient: 'from-emerald-500 to-teal-600',
    hex: '#10b981',
  },
  {
    id: 'amber',
    name: 'Solar Amber',
    badgeBg: 'bg-amber-500',
    previewGradient: 'from-amber-500 to-orange-600',
    hex: '#f59e0b',
  },
  {
    id: 'rose',
    name: 'Vibrant Rose',
    badgeBg: 'bg-pink-500',
    previewGradient: 'from-pink-500 to-rose-500',
    hex: '#ec4899',
  },
];

interface ThemeContextType {
  theme: ThemeColor;
  setTheme: (theme: ThemeColor) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'cineva_theme_color';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeColor>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY) as ThemeColor;
    if (saved && THEME_OPTIONS.some((t) => t.id === saved)) {
      return saved;
    }
    return 'blue';
  });

  const setTheme = (newTheme: ThemeColor) => {
    setThemeState(newTheme);
    localStorage.setItem(LOCAL_STORAGE_KEY, newTheme);
  };

  useEffect(() => {
    // Set theme class on document element root
    const root = document.documentElement;
    THEME_OPTIONS.forEach((t) => root.classList.remove(`theme-${t.id}`));
    root.classList.add(`theme-${theme}`);
    root.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
