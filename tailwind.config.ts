import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Primary — confident blue with warm undertone */
        primary: {
          50:  '#eff5fe',
          100: '#dce9fc',
          200: '#bcd2f7',
          300: '#8eb4ef',
          400: '#5c8de3',
          500: '#3e6dd1',
          600: '#2f58b8',
          700: '#254794',
          800: '#1e3875',
          900: '#162a56',
          950: '#0d1a38',
        },
        'primary-container':    '#dce9fc',
        'on-primary':           '#ffffff',
        'on-primary-container': '#0f2555',

        /* Secondary / sage — slightly warmer */
        sage: {
          50:  '#f3f7f2',
          100: '#e1ebdd',
          200: '#c4d6bf',
          300: '#a0bd99',
          400: '#80a478',
          500: '#688a60',
          600: '#52704b',
          700: '#40593a',
          800: '#2e4029',
          900: '#1e2a1a',
        },
        'secondary-container':    '#e1ebdd',
        'on-secondary-container': '#1e2a1a',

        /* Tertiary — warm amber (the "亮眼" pop accent) */
        tertiary: {
          50:  '#fff6e6',
          100: '#ffebc8',
          200: '#ffd791',
          300: '#ffbe56',
          400: '#f5ad3b',
          500: '#e4952a',
          600: '#c67a1c',
          700: '#9d5f18',
          800: '#6f4314',
          900: '#45290d',
        },
        'tertiary-container':    '#ffebc8',
        'on-tertiary-container': '#3d2509',

        /* Semantic — warmer, less clinical */
        success: {
          50:  '#eff7ed',
          100: '#daeed3',
          200: '#b8daa9',
          300: '#8dc17b',
          400: '#67a759',
          500: '#4f8d44',
          600: '#3d7236',
          700: '#2f5a2b',
        },
        warning: {
          50: '#fcf4e4', 100: '#f7e3b5',
          200: '#eccc78', 300: '#deb346', 400: '#ce9a2a',
          500: '#b88321', 600: '#96691b', 700: '#714f16',
        },
        danger: {
          50: '#fbefee', 100: '#f4d5d3',
          200: '#e7adaa', 300: '#d88380', 400: '#c5615d',
          500: '#b14843', 600: '#923732', 700: '#6f2a26',
        },
        'error-container':    '#f4d5d3',
        'on-error-container': '#3a0e0b',

        /* Neutrals — warm (like paper, not cold grey) */
        neutral: {
          0:   '#ffffff',
          10:  '#fdfbf7',
          20:  '#fbf8f2',
          50:  '#f5f1e9',
          100: '#ece7dc',
          150: '#dfd9cc',
          200: '#d0c9b9',
          300: '#b4ac9c',
          400: '#928b7c',
          500: '#706a5e',
          600: '#575349',
          700: '#403d36',
          800: '#2a2823',
          900: '#16140f',
        },
        /* M3 Surface roles (warm paper) */
        surface: {
          DEFAULT: '#faf8f4',                    /* app bg — warm cream */
          dim:     '#e6e2d8',
          bright:  '#fdfbf7',
          'container-lowest': '#ffffff',
          'container-low':    '#f6f3ec',
          container:          '#f1ede4',
          'container-high':   '#ebe7dd',
          'container-highest':'#e4dfd4',
        },
        outline:          '#78756a',
        'outline-variant':'#cac3b4',

        /* Back-compat */
        brand: {
          50:  '#eff5fe',
          500: '#3e6dd1',
          600: '#2f58b8',
          700: '#254794',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        'label-sm':      ['0.6875rem', { lineHeight: '1rem',     letterSpacing: '0.5px',  fontWeight: '500' }],
        'label':         ['0.75rem',   { lineHeight: '1rem',     letterSpacing: '0.5px',  fontWeight: '500' }],
        'label-lg':      ['0.875rem',  { lineHeight: '1.25rem',  letterSpacing: '0.1px',  fontWeight: '500' }],
        'caption':       ['0.75rem',   { lineHeight: '1.125rem', letterSpacing: '0.2px' }],
        'body-sm':       ['0.8125rem', { lineHeight: '1.375rem', letterSpacing: '0.2px' }],
        'body':          ['0.9375rem', { lineHeight: '1.5',      letterSpacing: '0.1px' }],
        'body-lg':       ['1rem',      { lineHeight: '1.5',      letterSpacing: '0.1px' }],
        'title':         ['0.9375rem', { lineHeight: '1.375rem', letterSpacing: '0.1px',  fontWeight: '500' }],
        'title-md':      ['1rem',      { lineHeight: '1.5rem',   letterSpacing: '0.1px',  fontWeight: '500' }],
        'title-lg':      ['1.375rem',  { lineHeight: '1.75rem',  letterSpacing: '0',      fontWeight: '500' }],
        'headline-sm':   ['1.5rem',    { lineHeight: '2rem',     letterSpacing: '0',      fontWeight: '500' }],
        'headline':      ['1.75rem',   { lineHeight: '2.25rem',  letterSpacing: '0',      fontWeight: '500' }],
        'headline-lg':   ['2rem',      { lineHeight: '2.5rem',   letterSpacing: '-0.01em',fontWeight: '500' }],
        'display-sm':    ['2.25rem',   { lineHeight: '2.75rem',  letterSpacing: '-0.01em',fontWeight: '500' }],
        'display':       ['2.75rem',   { lineHeight: '3.25rem',  letterSpacing: '-0.015em',fontWeight: '500' }],
        'display-lg':    ['3.5rem',    { lineHeight: '4rem',     letterSpacing: '-0.02em',fontWeight: '500' }],
      },
      borderRadius: {
        'xs':   '4px',
        'sm':   '8px',
        DEFAULT:'12px',
        'md':   '16px',
        'lg':   '20px',
        'xl':   '24px',
        '2xl':  '28px',
        '3xl':  '32px',
      },
      boxShadow: {
        /* Warm-tinted elevation (not cold blue-black shadow) */
        'elev-0': 'none',
        'elev-1': '0 1px 2px 0 rgba(60, 45, 20, 0.12), 0 1px 3px 1px rgba(60, 45, 20, 0.06)',
        'elev-2': '0 1px 2px 0 rgba(60, 45, 20, 0.14), 0 2px 6px 2px rgba(60, 45, 20, 0.08)',
        'elev-3': '0 1px 3px 0 rgba(60, 45, 20, 0.14), 0 4px 8px 3px rgba(60, 45, 20, 0.08)',
        'elev-4': '0 2px 3px 0 rgba(60, 45, 20, 0.14), 0 6px 10px 4px rgba(60, 45, 20, 0.08)',
        'elev-5': '0 4px 4px 0 rgba(60, 45, 20, 0.14), 0 8px 12px 6px rgba(60, 45, 20, 0.08)',
        'xs':    '0 1px 2px 0 rgba(60, 45, 20, 0.12), 0 1px 3px 1px rgba(60, 45, 20, 0.06)',
        'sm':    '0 1px 2px 0 rgba(60, 45, 20, 0.14), 0 2px 6px 2px rgba(60, 45, 20, 0.08)',
        DEFAULT: '0 1px 3px 0 rgba(60, 45, 20, 0.14), 0 4px 8px 3px rgba(60, 45, 20, 0.08)',
        'md':    '0 2px 3px 0 rgba(60, 45, 20, 0.14), 0 6px 10px 4px rgba(60, 45, 20, 0.08)',
        'lg':    '0 4px 4px 0 rgba(60, 45, 20, 0.14), 0 8px 12px 6px rgba(60, 45, 20, 0.08)',
        'xl':    '0 8px 10px -4px rgba(60, 45, 20, 0.20), 0 16px 24px 2px rgba(60, 45, 20, 0.10)',
        'focus':         '0 0 0 3px rgba(62, 109, 209, 0.25)',
        'focus-danger':  '0 0 0 3px rgba(177, 72, 67, 0.22)',
      },
      transitionTimingFunction: {
        'standard':     'cubic-bezier(0.2, 0, 0, 1)',
        'emphasized':   'cubic-bezier(0.2, 0, 0, 1)',
        'emphasized-decel': 'cubic-bezier(0.05, 0.7, 0.1, 1)',
        'emphasized-accel': 'cubic-bezier(0.3, 0, 0.8, 0.15)',
        'smooth':       'cubic-bezier(0.4, 0, 0.2, 1)',
        'out-expo':     'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        '100': '100ms', '200': '200ms', '300': '300ms', '400': '400ms',
      },
      keyframes: {
        'fade-in':        { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-up':       { '0%': { opacity: '0', transform: 'translateY(12px) scale(0.98)' }, '100%': { opacity: '1', transform: 'translateY(0) scale(1)' } },
        'slide-in-right': { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'translateX(0)' } },
        'soft-pulse':     { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
      },
      animation: {
        'fade-in':        'fade-in 200ms cubic-bezier(0.2, 0, 0, 1)',
        'slide-up':       'slide-up 260ms cubic-bezier(0.05, 0.7, 0.1, 1)',
        'slide-in-right': 'slide-in-right 300ms cubic-bezier(0.05, 0.7, 0.1, 1)',
        'soft-pulse':     'soft-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
