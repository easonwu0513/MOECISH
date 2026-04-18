import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Primary — desaturated clinical blue */
        primary: {
          50:  '#f2f6fb',
          100: '#e0ebf5',
          200: '#bfd4e8',
          300: '#95b7d6',
          400: '#6d9bc3',
          500: '#5487bd',
          600: '#3e72a8',
          700: '#2f5b88',
          800: '#254868',
          900: '#1a334a',
          950: '#0f2233',
        },
        /* Sage — softer accent */
        sage: {
          50:  '#f4f7f4',
          100: '#e5ede5',
          200: '#c7d6c7',
          300: '#a3bba5',
          400: '#809f83',
          500: '#678669',
          600: '#526e55',
          700: '#405743',
          800: '#2e4030',
          900: '#1f2c20',
        },
        /* Semantic — de-saturated */
        success: {
          50:  '#f1f7f2',
          100: '#dceadc',
          500: '#5a9e72',
          600: '#468459',
          700: '#366946',
        },
        warning: {
          50:  '#fcf7eb',
          100: '#f6e6c3',
          500: '#d08b3b',
          600: '#b0722c',
          700: '#895923',
        },
        danger: {
          50:  '#fbf0f0',
          100: '#f2d6d6',
          500: '#b8585a',
          600: '#9b4548',
          700: '#7a3537',
        },
        /* Cool neutrals — white-first */
        neutral: {
          0:   '#ffffff',
          25:  '#fcfcfc',
          50:  '#f7f7f7',
          100: '#f0f0f0',
          150: '#e8e8e8',
          200: '#dddddd',
          300: '#c7c7c7',
          400: '#a0a0a0',
          500: '#6b6b6b',
          600: '#515151',
          700: '#3a3a3a',
          800: '#242424',
          900: '#121212',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted:   '#fafafa',
          sunken:  '#f5f5f5',
          raised:  '#ffffff',
        },
        /* Back-compat */
        brand: {
          50:  '#f2f6fb',
          500: '#5487bd',
          600: '#3e72a8',
          700: '#2f5b88',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        'caption':    ['0.75rem',  { lineHeight: '1.125rem', letterSpacing: '0' }],
        'label':      ['0.8125rem', { lineHeight: '1.125rem', letterSpacing: '0', fontWeight: '500' }],
        'body-sm':    ['0.875rem',  { lineHeight: '1.45',     letterSpacing: '-0.003em' }],
        'body':       ['0.9375rem', { lineHeight: '1.6',      letterSpacing: '-0.003em' }],
        'title':      ['1.0625rem', { lineHeight: '1.5',      letterSpacing: '-0.012em', fontWeight: '500' }],
        'title-lg':   ['1.1875rem', { lineHeight: '1.45',     letterSpacing: '-0.018em', fontWeight: '600' }],
        'headline':   ['1.5rem',    { lineHeight: '1.25',     letterSpacing: '-0.024em', fontWeight: '600' }],
        'display-sm': ['2rem',      { lineHeight: '1.18',     letterSpacing: '-0.028em', fontWeight: '600' }],
        'display':    ['2.5rem',    { lineHeight: '1.12',     letterSpacing: '-0.032em', fontWeight: '600' }],
        'display-lg': ['3rem',      { lineHeight: '1.08',     letterSpacing: '-0.038em', fontWeight: '700' }],
      },
      borderRadius: {
        'xs':   '4px',
        'sm':   '6px',
        DEFAULT:'8px',
        'md':   '10px',
        'lg':   '12px',
        'xl':   '14px',
        '2xl':  '18px',
        '3xl':  '24px',
      },
      boxShadow: {
        /* Ultra-subtle, Linear/Notion inspired */
        'xs':    '0 1px 0 0 rgba(15, 20, 30, 0.04)',
        'sm':    '0 1px 2px 0 rgba(15, 20, 30, 0.05)',
        DEFAULT: '0 2px 8px -2px rgba(15, 20, 30, 0.06)',
        'md':    '0 6px 16px -6px rgba(15, 20, 30, 0.08), 0 2px 4px -2px rgba(15, 20, 30, 0.04)',
        'lg':    '0 12px 28px -10px rgba(15, 20, 30, 0.10), 0 4px 10px -4px rgba(15, 20, 30, 0.05)',
        'xl':    '0 24px 48px -16px rgba(15, 20, 30, 0.14)',
        'inner-sm': 'inset 0 1px 2px rgba(15, 20, 30, 0.04)',
        'focus': '0 0 0 3px rgba(62, 114, 168, 0.18)',
        'focus-danger': '0 0 0 3px rgba(184, 88, 90, 0.18)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'smooth':   'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        '80': '80ms', '180': '180ms', '250': '250ms',
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
          '50%':      { opacity: '0.55' },
        },
      },
      animation: {
        'fade-in':        'fade-in 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up':       'slide-up 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        'soft-pulse':     'soft-pulse 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
