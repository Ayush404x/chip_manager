/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        charcoal: {
          950: '#070a09',
          900: '#0b100f',
          850: '#0f1514',
          800: '#131b19',
          750: '#18221f',
          700: '#1e2a27',
          600: '#2a3935',
        },
        felt: {
          900: '#07241c',
          800: '#0a3026',
          700: '#0d3d31',
          600: '#12513f',
        },
        chip: {
          gold: '#e7bf6a',
          red: '#e0625d',
          blue: '#5c9fe0',
          emerald: '#4ade80',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 20px 60px -30px rgba(0,0,0,0.9)',
        seat: '0 8px 30px -12px rgba(0,0,0,0.8)',
        'glow-emerald': '0 0 0 1px rgba(74,222,128,0.35), 0 0 36px -8px rgba(74,222,128,0.45)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-ring': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(74,222,128,0.35)' },
          '50%': { boxShadow: '0 0 0 6px rgba(74,222,128,0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 220ms ease-out both',
        'fade-up': 'fade-up 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scale-in 180ms ease-out both',
        'pulse-ring': 'pulse-ring 2.4s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
