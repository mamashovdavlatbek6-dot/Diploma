/**
 * Design tokens. CSS variables in app/globals.css mirror the color values;
 * motion presets are consumed by client components in later phases.
 */
export const theme = {
  colors: {
    background: "#05070d",
    surface: "#0b0f19",
    foreground: "#e6edf7",
    muted: "#8a94a8",
    primary: "#22e4d6", // neon cyan / teal
    secondary: "#8b5cf6", // violet
    severity: {
      critical: "#ff3b5c",
      high: "#ff8a3d",
      medium: "#f5b83d",
      low: "#4c8dff",
      info: "#8a94a8",
    },
  },
  radii: { sm: 8, md: 14, lg: 22, pill: 999 },
  motion: {
    duration: { fast: 0.25, base: 0.45, slow: 0.7 },
    ease: { out: [0.16, 1, 0.3, 1] as const },
    spring: {
      soft: { type: "spring", stiffness: 220, damping: 28 },
      snappy: { type: "spring", stiffness: 420, damping: 34 },
      liquid: { type: "spring", stiffness: 300, damping: 24, mass: 0.9 },
    },
  },
} as const;

export type Severity = keyof typeof theme.colors.severity;
