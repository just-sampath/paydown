import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        primary: 'var(--primary)',
        citron: 'var(--teal)',
        violet: 'var(--violet)',
        tangerine: 'var(--tangerine)',
        jade: 'var(--jade)',
      },
      fontFamily: {
        display: ['Noto Sans Display', 'Noto Sans', 'sans-serif'],
        body: ['Noto Sans', 'sans-serif'],
        ui: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
      },
    },
  },
} satisfies Config;
