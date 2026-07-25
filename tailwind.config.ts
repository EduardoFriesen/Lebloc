import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/renderer/**/*.{tsx,ts}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F172A',
        muted: '#64748B',
        surface: '#FFFFFF',
        bg: '#F1F0ED',
        panel: '#E8E6E1',
        border: '#D4D2CD',
        accent: '#B8654A',
        'accent-hover': '#A35640',
        success: '#16A34A',
        warning: '#D97706',
        danger: '#DC2626',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.25, 1, 0.5, 1)',
        'slide-up': 'slide-up 250ms cubic-bezier(0.25, 1, 0.5, 1)',
        'slide-down': 'slide-down 250ms cubic-bezier(0.25, 1, 0.5, 1)',
        'scale-in': 'scale-in 200ms cubic-bezier(0.25, 1, 0.5, 1)',
        'shimmer': 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
}
export default config
