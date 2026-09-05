/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ticket: 'var(--color-ticket)',
        'ticket-edge': 'var(--color-ticket-edge)',
        ink: 'var(--color-ink)',
        'ink-muted': 'var(--color-ink-muted)',
        pulse: 'var(--color-pulse)',
        'pulse-subtle': 'var(--color-pulse-subtle)',
        amber: 'var(--color-amber)',
        tomato: 'var(--color-tomato)',
        surface: 'var(--color-surface)',
        'surface-sunken': 'var(--color-surface-sunken)',
        border: 'var(--color-border)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        key: 'var(--shadow-key)',
        receipt: 'var(--shadow-receipt)',
      },
    },
  },
  plugins: [],
};
