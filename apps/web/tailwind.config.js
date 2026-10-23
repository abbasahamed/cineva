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
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)', // Primary brand accent (themeable)
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: '#3730a3',
          900: '#312e81',
          accent: 'rgb(var(--brand-500) / <alpha-value>)',
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
