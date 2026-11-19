/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0B1F33',
          950: '#06121F',
          900: '#08192A',
          800: '#0B1F33',
          700: '#12314C',
          600: '#1B4363',
          500: '#2A5A80',
        },
        brand: {
          50: '#EEF4FF',
          100: '#DBE7FF',
          200: '#BFD3FF',
          300: '#93B4FF',
          400: '#5F8CFA',
          500: '#3565EE',
          600: '#155EEF',
          700: '#0F49C4',
          800: '#123E9B',
          900: '#14387C',
        },
        ocean: {
          300: '#7CC1E8',
          400: '#3FA1D6',
          500: '#1677B8',
          600: '#0F5F96',
        },
        amber: {
          300: '#FFD08A',
          400: '#FFBB55',
          500: '#F5A623',
          600: '#D8870F',
        },
        steel: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
        },
        mist: '#F5F7FA',
      },
      fontFamily: {
        sans: ['Manrope', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
        arabic: ['IBM Plex Sans Arabic', 'Manrope', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-sm': ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-md': ['3.25rem', { lineHeight: '1.06', letterSpacing: '-0.025em' }],
        'display-lg': ['4rem', { lineHeight: '1.02', letterSpacing: '-0.03em' }],
        'display-xl': ['4.75rem', { lineHeight: '1', letterSpacing: '-0.035em' }],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(11,31,51,0.04), 0 12px 32px -12px rgba(11,31,51,0.16)',
        lift: '0 2px 4px rgba(11,31,51,0.05), 0 24px 48px -20px rgba(11,31,51,0.28)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      maxWidth: {
        container: '76rem',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.55', transform: 'scale(0.85)' },
        },
        'dash': {
          to: { strokeDashoffset: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both',
        'pulse-dot': 'pulse-dot 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
