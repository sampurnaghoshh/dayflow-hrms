// Points Tailwind's token-backed utility classes at the design pair's tokens.css
// (client/src/theme/tokens.css — owned by them, never edited here; see CLAUDE.md §3, §9).
// Utility class names (bg-primary, text-text-muted, rounded-lg, shadow-sm, ...) must stay
// stable across any future re-theme — only the `var(--...)` each one points to should change.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--surface-page)',
        surface: 'var(--surface-card)',
        'surface-alt': 'var(--surface-sunken)',
        border: 'var(--border-hairline)',
        text: {
          DEFAULT: 'var(--ink-body)',
          muted: 'var(--ink-muted)',
          inverse: 'var(--ink-invert)',
        },
        primary: {
          DEFAULT: 'var(--pine-500)',
          hover: 'var(--pine-700)',
          text: 'var(--ink-invert)',
        },
        secondary: {
          DEFAULT: 'var(--ink-muted)',
          hover: 'var(--ink-body)',
        },
        success: { DEFAULT: 'var(--pine-700)', bg: 'var(--pine-100)' },
        warning: { DEFAULT: 'var(--amber-600)', bg: 'var(--amber-100)' },
        danger: { DEFAULT: 'var(--danger-500)', bg: 'var(--danger-100)' },
        info: { DEFAULT: 'var(--info-500)', bg: 'var(--info-100)' },
        focus: 'var(--pine-500)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-md)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        full: 'var(--radius-full)',
      },
      fontFamily: {
        sans: 'var(--font-body)',
        display: 'var(--font-display)',
      },
      fontSize: {
        xs: 'var(--text-xs)',
        sm: 'var(--text-sm)',
        base: 'var(--text-base)',
        lg: 'var(--text-lg)',
        xl: 'var(--text-xl)',
        '2xl': 'var(--text-2xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-card)',
        md: 'var(--shadow-modal)',
      },
    },
  },
  plugins: [],
};
