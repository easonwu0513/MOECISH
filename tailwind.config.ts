import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Primary — refined clinical blue with depth */
        primary: {
          50:  '#f3f7fb',
          100: '#e3edf6',
          200: '#c2d7e9',
          300: '#98bad6',
          400: '#6d9bc1',
          500: '#4a7db5',
          600: '#3a6ba0',
          700: '#305584',
          800: '#27436a',
          900: '#1d324f',
          950: '#12203a',
        },
        /* Sage — herbal, calm, gently alive */
        sage: {
          50:  '#f4f7f4',
          100: '#e3ebe3',
          200: '#c9d8c9',
          300: '#a7bfa8',
          400: '#84a387',
          500: '#6b8b6e',
          600: '#537158',
          700: '#3f5945',
          800: '#2e4233',
          900: '#1f2d22',
        },
        success: {
          50:  '#eff7f0',
          100: '#d7ecdb',
          500: '#4f9f6a',
          600: '#3e8458',
          700: '#2e6743',
        },
        warning: {
          50:  '#fdf7eb',
          100: '#f8e7c4',
          500: '#d68f3e',
          600: '#b8762e',
          700: '#935b23',
        },
        danger: {
          50:  '#fbefef',
          100: '#f2d7d7',
          500: '#bf5050',
          600: '#a03d3d',
          700: '#7d2f2f',
        },
        /* Warm-leaning neutrals */
        neutral: {
          0:   '#ffffff',
          25:  '#fbfbf9',
          50:  '#f7f7f4',
          100: '#f1f1ec',
          150: '#e9e9e3',
          200: '#dddcd6',
          300: '#c9c9c2',
          400: '#a3a39c',
          500: '#6d6d68',
          600: '#545450',
          700: '#3b3b38',
          800: '#26262554',
          900: '#131312',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted:   '#f7f7f4',
          sunken:  '#f1f1ec',
          raised:  '#ffffff',
        },
        /* Back-compat aliases */
        brand: {
          50:  '#f3f7fb',
          500: '#4a7db5',
          600: '#3a6ba0',
          700: '#305584',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        /* Carefully tuned scale with leading & tracking */
        'caption':    ['0.75rem',  { lineHeight: '1.125rem', letterSpacing: '0' }],
        'label':      ['0.8125rem', { lineHeight: '1.125rem', letterSpacing: '0', fontWeight: '500' }],
        'body-sm':    ['0.875rem',  { lineHeight: '1.375rem', letterSpacing: '0' }],
        'body':       ['0.9375rem', { lineHeight: '1.55',     letterSpacing: '-0.003em' }],
        'title':      ['1.0625rem', { lineHeight: '1.45',     letterSpacing: '-0.01em',  fontWeight: '600' }],
        'title-lg':   ['1.1875rem', { lineHeight: '1.4',      letterSpacing: '-0.015em', fontWeight: '600' }],
        'headline':   ['1.5rem',    { lineHeight: '1.2',      letterSpacing: '-0.022em', fontWeight: '600' }],
        'display-sm': ['2rem',      { lineHeight: '1.15',     letterSpacing: '-0.025em', fontWeight: '600' }],
        'display':    ['2.5rem',    { lineHeight: '1.1',      letterSpacing: '-0.03em',  fontWeight: '600' }],
        'display-lg': ['3rem',      { lineHeight: '1.05',     letterSpacing: '-0.035em', fontWeight: '700' }],
      },
      borderRadius: {
        'xs':   '4px',
        'sm':   '6px',
        DEFAULT:'8px',
        'md':   '10px',
        'lg':   '12px',
        'xl':   '16px',
        '2xl':  '20px',
        '3xl':  '28px',
      },
      boxShadow: {
        /* Softer, subtly colored shadows — paper-like */
        'xs':    '0 1px 1px 0 rgba(30, 35, 45, 0.04)',
        'sm':    '0 1px 2px -1px rgba(30, 35, 45, 0.06), 0 1px 3px 0 rgba(30, 35, 45, 0.04)',
        DEFAULT: '0 2px 4px -2px rgba(30, 35, 45, 0.06), 0 4px 8px -4px rgba(30, 35, 45, 0.04)',
        'md':    '0 4px 8px -4px rgba(30, 35, 45, 0.08), 0 8px 16px -8px rgba(30, 35, 45, 0.06)',
        'lg':    '0 8px 16px -8px rgba(30, 35, 45, 0.10), 0 16px 32px -16px rgba(30, 35, 45, 0.08)',
        'xl':    '0 16px 32px -16px rgba(30, 35, 45, 0.14), 0 24px 48px -24px rgba(30, 35, 45, 0.08)',
        'inner-sm':'inset 0 1px 2px rgba(30, 35, 45, 0.04)',
        'focus': '0 0 0 3px rgba(74, 125, 181, 0.22)',
        'focus-danger': '0 0 0 3px rgba(191, 80, 80, 0.22)',
      },
      transitionTimingFunction: {
        'out-expo':   'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-back':   'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth':     'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        '80':  '80ms',
        '180': '180ms',
        '250': '250ms',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(2px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.985)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0.8' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'soft-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in':        'fade-in 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up':       'slide-up 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        'soft-pulse':     'soft-pulse 2.2s ease-in-out infinite',
        'shimmer':        'shimmer 1.8s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
