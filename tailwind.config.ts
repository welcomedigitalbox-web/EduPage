import type { Config } from 'tailwindcss';
// One light scheme, the same slate the ERP uses, so moving between the two
// apps does not feel like moving between two products.
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#f8fafc',    // page
        panel: '#ffffff',  // cards
        edge: '#e2e8f0',   // borders
        muted: '#64748b',  // secondary text
        brand: '#2563eb',
        good: '#16a34a',
        warn: '#f59e0b',
        bad: '#dc2626',
      },
    },
  },
  plugins: [],
} satisfies Config;
