/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1', // Primary brand accent (Indigo)
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          accent: '#6366f1',
        },
        surface: {
          deep: '#05060a',
          bg: '#08090d',
          card: '#0f1118',
          cardHover: '#151823',
          border: '#1b1f2e',
          borderHover: '#2a3148',
          muted: '#8e95a5',
        },
        glass: {
          thin: 'rgba(255, 255, 255, 0.035)',
          medium: 'rgba(255, 255, 255, 0.065)',
          strong: 'rgba(255, 255, 255, 0.11)',
          floating: 'rgba(12, 14, 21, 0.75)',
          border: 'rgba(255, 255, 255, 0.085)',
          borderHover: 'rgba(255, 255, 255, 0.16)',
          highlight: 'rgba(255, 255, 255, 0.12)',
        },
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.4)',
        'glass-sm': '0 4px 16px 0 rgba(0, 0, 0, 0.3)',
        'glass-elevated': '0 24px 48px -8px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        'glass-glow': '0 0 30px -5px rgba(99, 102, 241, 0.25)',
      },
      backdropBlur: {
        xs: '2px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      animation: {
        fadeIn: 'fadeIn 0.2s ease-out',
        scaleUp: 'scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        slideUp: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        pulseSubtle: 'pulseSubtle 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleUp: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
}
