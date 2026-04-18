import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          500: '#3b5bdb',
          600: '#2f4bc4',
          700: '#253da3',
        },
      },
    },
  },
  plugins: [],
};

export default config;
