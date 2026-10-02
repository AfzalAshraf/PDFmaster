/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Acrobat-inspired neutral ramp + Adobe red accent.
        ink: {
          950: '#0f1013',
          900: '#16171a',
          850: '#1b1c20',
          800: '#202124',
          750: '#26272b',
          700: '#2c2d32',
          600: '#393a40',
          500: '#4a4b52',
          400: '#63646c',
          300: '#8b8c94',
          200: '#b6b7bd',
          100: '#dcdde1',
          50: '#f4f4f6',
        },
        accent: {
          DEFAULT: '#ff4a3d',
          hover: '#ff6155',
          active: '#e63a2d',
          soft: 'rgba(255, 74, 61, 0.16)',
          ring: 'rgba(255, 74, 61, 0.45)',
        },
        brandblue: {
          DEFAULT: '#2f89ff',
          soft: 'rgba(47, 137, 255, 0.18)',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['SFMono-Regular', 'Menlo', 'Consolas', 'Liberation Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['11px', '16px'],
        sm: ['12px', '17px'],
        base: ['13px', '19px'],
        md: ['14px', '20px'],
        lg: ['16px', '22px'],
        xl: ['19px', '26px'],
      },
      boxShadow: {
        panel: '0 8px 28px rgba(0,0,0,.45)',
        menu: '0 10px 34px rgba(0,0,0,.55)',
        page: '0 2px 10px rgba(0,0,0,.45), 0 0 0 1px rgba(0,0,0,.35)',
        inset: 'inset 0 1px 0 rgba(255,255,255,.04)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(4px) scale(.985)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in .12s ease-out',
        'pop-in': 'pop-in .12s ease-out',
        'slide-up': 'slide-up .18s ease-out',
        shimmer: 'shimmer 1.4s linear infinite',
      },
    },
  },
  plugins: [],
};
