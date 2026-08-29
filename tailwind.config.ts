import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f1115',
        panel: '#171a21',
        edge: '#262b35',
        muted: '#8b93a7',
        brand: '#4f7cff',
        good: '#2fbf71',
        warn: '#f2a93b',
        bad: '#e5534b',
      },
    },
  },
  plugins: [],
} satisfies Config;
