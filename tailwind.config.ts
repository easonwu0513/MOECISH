import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Primary — clinical blue with M3 tonal structure */
        primary: {
          50:  '#eef4fb',
          100: '#d7e6f5',
          200: '#b0ccea',
          300: '#83aedc',
          400: '#5a90ca',
          500: '#4278b3',
          600: '#335f95',
          700: '#274b77',
          800: '#1d395a',
          900: '#132845',
          950: '#0a1b2f',
        },
        /* M3 primary container (for tonal buttons/chips) */
        'primary-container':    '#d7e6f5',
        'on-primary':           '#ffffff',
        'on-primary-container': '#0f2a45',

        /* Secondary / sage */
        sage: {
          50:  '#f2f6f3',
          100: '#dfead1'.replace('d1', 'e1'),
          200: '#c2d4c4',
          300: '#a1b9a3',
          400: '#809e83',
          500: '#668567',
          600: '#526c54',
          700: '#405542',
          800: '#2e3d30',
          900: '#1e2820',
        },
        'secondary-container':    '#dfe6e0',
        'on-secondary-container': '#1e2820',

        /* Semantic */
        success: {
          50: '#f0f7f2', 100: '#dae9de',
          200: '#b8d6bf', 300: '#8bbb97', 400: '#65a376',
          500: '#4d8f60', 600: '#3a7349', 700: '#2d5d3a',
        },
        warning: {
          50: '#fbf5e8', 100: '#f4e4bd',
          200: '#edcd85', 300: '#e2b455', 400: '#d69c3b',
          500: '#ca8831', 600: '#a56d25', 700: '#7e5320',
        },
        danger: {
          50: '#fbefef', 100: '#f3d6d6',
          200: '#e3aeae', 300: '#d38181', 400: '#c35f5f',
          500: '#b54848', 600: '#963838', 700: '#742b2b',
        },
        'error-container':    '#f9dddc',
        'on-error-container': '#410e0b',

        /* Neutrals — cool with faint blue undertone (M3 Neutral palette feel) */
        neutral: {
          0:   '#ffffff',
          10:  '#fefbff',
          20:  '#f3f0f5',
          50:  '#ebeaed',
          100: '#e1e0e4',
          150: '#d4d3d8',
          200: '#c6c6ca',
          300: '#adadb1',
          400: '#8e8e93',
          500: '#6b6b70',
          600: '#56565b',
          700: '#3f3f44',
          800: '#28282c',
          900: '#141418',
        },
        /* M3 Surface system */
        surface: {
          DEFAULT: '#fefbff',                    /* app bg */
          dim:     '#deddeb',
          bright:  '#fefbff',
          'container-lowest': '#ffffff',
          'container-low':    '#f8f6fb',
          container:          '#f2eff6',
          'container-high':   '#edeaf1',
          'container-highest':'#e6e3ea',
        },
        outline:          '#77767a',
        'outline-variant':'#c7c6ca',

        /* Back-compat */
        brand: {
          50:  '#eef4fb',
          500: '#4278b3',
          600: '#335f95',
          700: '#274b77',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        /* M3 type scale (slightly adapted; all title/label use medium 500) */
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
        /* Material 3 elevation levels */
        'elev-0': 'none',
        'elev-1': '0 1px 2px 0 rgba(15, 20, 30, 0.18), 0 1px 3px 1px rgba(15, 20, 30, 0.08)',
        'elev-2': '0 1px 2px 0 rgba(15, 20, 30, 0.20), 0 2px 6px 2px rgba(15, 20, 30, 0.10)',
        'elev-3': '0 1px 3px 0 rgba(15, 20, 30, 0.20), 0 4px 8px 3px rgba(15, 20, 30, 0.10)',
        'elev-4': '0 2px 3px 0 rgba(15, 20, 30, 0.20), 0 6px 10px 4px rgba(15, 20, 30, 0.10)',
        'elev-5': '0 4px 4px 0 rgba(15, 20, 30, 0.20), 0 8px 12px 6px rgba(15, 20, 30, 0.10)',
        /* Back-compat */
        'xs':    '0 1px 2px 0 rgba(15, 20, 30, 0.18), 0 1px 3px 1px rgba(15, 20, 30, 0.08)',
        'sm':    '0 1px 2px 0 rgba(15, 20, 30, 0.20), 0 2px 6px 2px rgba(15, 20, 30, 0.10)',
        DEFAULT: '0 1px 3px 0 rgba(15, 20, 30, 0.20), 0 4px 8px 3px rgba(15, 20, 30, 0.10)',
        'md':    '0 2px 3px 0 rgba(15, 20, 30, 0.20), 0 6px 10px 4px rgba(15, 20, 30, 0.10)',
        'lg':    '0 4px 4px 0 rgba(15, 20, 30, 0.20), 0 8px 12px 6px rgba(15, 20, 30, 0.10)',
        'xl':    '0 8px 10px -4px rgba(15, 20, 30, 0.25), 0 16px 24px 2px rgba(15, 20, 30, 0.12)',
        'focus':         '0 0 0 3px rgba(66, 120, 179, 0.22)',
        'focus-danger':  '0 0 0 3px rgba(181, 72, 72, 0.22)',
      },
      transitionTimingFunction: {
        /* Material emphasized curves */
        'standard':     'cubic-bezier(0.2, 0, 0, 1)',
        'emphasized':   'cubic-bezier(0.2, 0, 0, 1)',
        'emphasized-decel': 'cubic-bezier(0.05, 0.7, 0.1, 1)',
        'emphasized-accel': 'cubic-bezier(0.3, 0, 0.8, 0.15)',
        'smooth':       'cubic-bezier(0.4, 0, 0.2, 1)',
        'out-expo':     'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        '100': '100ms',
        '200': '200ms',
        '300': '300ms',
        '400': '400ms',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'soft-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
        'ripple': {
          '0%':   { transform: 'scale(0)', opacity: '0.35' },
          '100%': { transform: 'scale(4)', opacity: '0' },
        },
      },
      animation: {
        'fade-in':        'fade-in 200ms cubic-bezier(0.2, 0, 0, 1)',
        'slide-up':       'slide-up 260ms cubic-bezier(0.05, 0.7, 0.1, 1)',
        'slide-in-right': 'slide-in-right 300ms cubic-bezier(0.05, 0.7, 0.1, 1)',
        'soft-pulse':     'soft-pulse 2s ease-in-out infinite',
        'ripple':         'ripple 600ms cubic-bezier(0.2, 0, 0, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
