import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#00A7E1',
        'brand-dark': '#0077b6',
      },
    },
  },
  plugins: [],
};

export default config;
