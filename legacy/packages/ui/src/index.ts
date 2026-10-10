// Liquid-Glass design tokens — the single source of truth shared by web (Next.js) and
// mobile (Expo). Ported from the prototype: Any.do-calm, light-first, one blue accent.

export const tokens = {
  color: {
    blue: '#3e7bfa',
    blueSoft: '#7aa6ff',
    ink: '#1a1d21',
    muted: '#6b7280',
    line: '#eceef1',
    bg: '#f6f7f9',
    card: '#ffffff',
    // status
    green: '#34c759',
    amber: '#ff9f0a',
    red: '#ff3b30',
    teal: '#30c0c6',
    violet: '#7c5cff',
  },
  radius: { card: 16, control: 13, pill: 999 },
  font: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
  space: (n: number) => n * 4,
  /** primary mobile design width */
  mobileWidth: 390,
} as const;

export type Tokens = typeof tokens;
