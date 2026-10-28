import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Midnight navy and brass: an old-money ledger, not another neon SaaS
        deep: '#0A1220',
        ink: '#0F1A2B',
        surface: '#16233A',
        raised: '#1D2C47',
        line: '#2A3A57',
        ivory: '#F1ECE2',
        muted: '#97A3BA',
        brass: { DEFAULT: '#CDAE72', strong: '#E2C68E' },
        sage: '#86BFA0',
        coral: '#E7907F',
        sky: '#8DB4E2',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'Times New Roman', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        lift: '0 18px 40px -18px rgba(3, 8, 18, 0.9)',
      },
    },
  },
  plugins: [],
};

export default config;
