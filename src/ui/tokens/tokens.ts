/**
 * 1.0 Foundation — UI design tokens.
 *
 * Why this exists: the light-glass palette is currently spelled as hex
 * literals in ~100 places (`bg-[#d0c6ba]`, `text-[#4a2108]/68`, ...). That
 * makes a visual change a mechanical find-and-replace, and it makes
 * "consistent radii / spacing" impossible to check. These tokens are a
 * faithful transcription of what the UI uses today — they are not a redesign.
 *
 * Not consumed by components yet. Phase 1A publishes the vocabulary; Phase 4
 * (UI 1.0) is where components start reading from it.
 */

export const palette = {
  /** App shell background — warm paper. */
  shell: "#d0c6ba",
  /** Primary foreground (titles, controls). */
  ink: "#4a2108",
  /** Secondary accent used for status dots and warnings. */
  ember: "#7a2d1c",
  /** Floating panel surface (settings, notices). */
  panel: "#dfd1c4",
  /** Deep scrim behind modal overlays. */
  scrim: "#120b08",
  /** Dark settings surface. */
  settingsPanel: "#1b1410",
} as const;

export const textOpacity = {
  primary: 0.92,
  secondary: 0.68,
  muted: 0.38,
  faint: 0.13,
} as const;

/** Radii observed across the glass surfaces. */
export const radius = {
  control: 12,
  card: 24,
  surface: 28,
} as const;

/** The shared horizontal baseline for the player stage and dock. */
export const layout = {
  playerSidePadding: "var(--player-side-padding)",
  compactBreakpoint: 900,
} as const;

/**
 * Motion budget. The 1.0 performance work needs a number to hold the line at,
 * and today that number lives in scattered `duration-*`/`backdrop-blur-*`
 * classes with no ceiling.
 */
export const motion = {
  transition: "app-transition",
  /** Longest acceptable UI transition, in ms. */
  maxDurationMs: 500,
} as const;
