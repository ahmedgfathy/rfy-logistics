/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}-rgb) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: token('navy-800'),
          950: token('navy-950'),
          900: token('navy-900'),
          800: token('navy-800'),
          700: token('navy-700'),
          600: token('navy-600'),
          500: token('navy-500'),
        },
        brand: {
          50: token('brand-50'),
          100: token('brand-100'),
          200: token('brand-200'),
          300: token('brand-300'),
          400: token('brand-400'),
          500: token('brand-500'),
          600: token('brand-600'),
          700: token('brand-700'),
          800: token('brand-800'),
          900: token('brand-900'),
        },
        ocean: {
          300: token('ocean-300'),
          400: token('ocean-400'),
          500: token('ocean-500'),
          600: token('ocean-600'),
        },
        amber: {
          300: token('amber-300'),
          400: token('amber-400'),
          500: token('amber-500'),
          600: token('amber-600'),
        },
        steel: {
          50: token('steel-50'),
          100: token('steel-100'),
          200: token('steel-200'),
          300: token('steel-300'),
          400: token('steel-400'),
          500: token('steel-500'),
          600: token('steel-600'),
          700: token('steel-700'),
        },
        mist: token('mist'),
      },
      fontFamily: {
        sans: ['Cairo', 'IBM Plex Sans Arabic', 'Manrope', 'system-ui', 'sans-serif'],
        arabic: ['Cairo', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-sm': ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        'display-md': ['3.25rem', { lineHeight: '1.05', letterSpacing: '-0.01em' }],
        'display-lg': ['4rem', { lineHeight: '1.02', letterSpacing: '-0.015em' }],
        'display-xl': ['4.75rem', { lineHeight: '1', letterSpacing: '-0.02em' }],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(17,17,17,0.04), 0 10px 28px -14px rgba(17,17,17,0.18)',
        lift: '0 2px 4px rgba(17,17,17,0.05), 0 24px 48px -20px rgba(17,17,17,0.25)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      borderRadius: {
        xl: '0.5rem',
        '2xl': '0.75rem',
        '3xl': '1rem',
      },
      maxWidth: {
        container: '75rem',
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
        dash: {
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
