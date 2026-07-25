import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Domner brand — Temple Night / Angkor Gold (see design_handoff_domer_brand)
        primary: '#14263F', // Temple Night
        'primary-deep': '#0E1B30',
        secondary: '#1C3355', // Navy tint
        'secondary-high': '#23406A',
        accent: '#C69749', // Angkor Gold
        gold: {
          light: '#E6CB8B',
          bright: '#F7EAC0',
          dark: '#7A5A1E',
        },
        jade: '#1F7A66', // Mekong Jade
        clay: '#B14A34', // Silk Clay
        sandstone: '#F6F1E7',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
        surface: {
          1: '#FFFFFF',
          2: '#F8FAFC',
          3: '#F1F5F9',
        },
        line: '#E2E8F0',
        ink: {
          DEFAULT: '#0F172A',
          secondary: '#475569',
          muted: '#94A3B8',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
        // No separate monospace face — flight/order data uses the body font
        // with tabular numerals (see .font-mono in globals.css) to keep the
        // site to 3 font families instead of 4.
        mono: ['var(--font-body)', 'sans-serif'],
        khmer: ['var(--font-khmer)', 'sans-serif'],
      },
      borderRadius: {
        card: '18px',
        btn: '12px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.10), 0 16px 40px rgba(0,0,0,0.08)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        'gradient-drift': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(4%, -3%) scale(1.05)' },
          '66%': { transform: 'translate(-3%, 3%) scale(0.98)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        twinkle: {
          '0%, 100%': { opacity: '0.9' },
          '50%': { opacity: '0.25' },
        },
        'float-y': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        'dash-flow': {
          to: { strokeDashoffset: '-64' },
        },
        'orb-pulse': {
          '0%, 100%': { boxShadow: '0 0 24px 6px rgba(96,165,250,0.45), 0 0 80px 20px rgba(59,130,246,0.25)' },
          '50%': { boxShadow: '0 0 36px 12px rgba(96,165,250,0.65), 0 0 110px 32px rgba(59,130,246,0.35)' },
        },
        'globe-glow': {
          '0%, 100%': { opacity: '0.7' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'gradient-drift': 'gradient-drift 24s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        'fade-up': 'fade-up 0.5s cubic-bezier(0.4, 0, 0.2, 1) both',
        twinkle: 'twinkle 4s ease-in-out infinite',
        'float-y': 'float-y 7s ease-in-out infinite',
        'dash-flow': 'dash-flow 3.2s linear infinite',
        'orb-pulse': 'orb-pulse 3s ease-in-out infinite',
        'globe-glow': 'globe-glow 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
