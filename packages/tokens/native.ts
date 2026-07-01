// Canonical GraceChords design tokens for React Native (the iOS "Signal blue"
// palette). This is the single source of truth for the native app's tokens —
// apps/mobile imports from here and never hardcodes color values.
//
// NOTE: these values are intentionally DIFFERENT from the web's tokens.css
// (a warm-brown palette). The iOS rebuild uses Signal blue per the design
// reference; the two platforms do not share token values, only this package as
// their common home. Values below come from the design reference
// ("[DOC + SPEC] App Shell & Design Tokens" / "[CONTENT] Song Library Content").

export type ThemeMode = 'light' | 'dark'

export type ThemeColors = {
  /** Page background (the surface the list scrolls on). */
  bg: string
  /** Raised surfaces: cards, tab bar, sheets. */
  surface: string
  /** Recessed surfaces: search field, icon buttons. */
  surfaceAlt: string
  /** Primary text. */
  ink: string
  /** Secondary text (e.g. artist line). */
  sec: string
  /** Muted text (e.g. time signature, section letters). */
  muted: string
  /** The one accent — Signal blue. */
  accent: string
  /** Soft accent fill (e.g. add-button background). */
  accentSoft: string
  /** Accent tuned for text/legibility on the page background. */
  textAccent: string
  /** Hairline borders / separators. */
  border: string
  /** Text/icon color on top of the accent. */
  onAccent: string
  /** Dimmed color for inactive scrubber letters. */
  off: string
}

export const lightColors: ThemeColors = {
  bg: '#F5F7F9',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1F4',
  ink: '#1E2227',
  sec: '#5C656F',
  muted: '#8A929B',
  accent: '#1F84C9',
  accentSoft: '#D9EAF6',
  textAccent: '#15619A',
  border: '#E3E8EC',
  onAccent: '#FFFFFF',
  off: 'rgba(138,146,155,0.45)',
}

export const darkColors: ThemeColors = {
  bg: '#14171A',
  surface: '#1E2227',
  surfaceAlt: '#242A30',
  ink: '#E8ECF0',
  sec: '#AEB6BE',
  muted: '#7C858E',
  accent: '#4EA6E6',
  accentSoft: '#243340',
  textAccent: '#6FB6EA',
  border: '#2A3036',
  onAccent: '#14171A',
  off: 'rgba(124,133,142,0.5)',
}

/** 4-pt spacing scale (shared across modes). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

/** Corner radii (shared across modes). */
export const radii = {
  sm: 10,
  md: 12,
  card: 14,
  sheet: 20,
  pill: 999,
} as const

/**
 * Type ramp used by the app chrome and content. Sizes/weights come straight
 * from the reference rows and headers. Font family is the system font (SF Pro
 * on iOS) — RN uses the system font by default, so no family is set here.
 */
export const typography = {
  /** Large screen title, e.g. "Song Library". */
  largeTitle: { fontSize: 27, fontWeight: '700', letterSpacing: -0.4 },
  /** Section header letter / "Key of X". */
  sectionHeader: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  /** Row title. */
  rowTitle: { fontSize: 16.5, fontWeight: '600', letterSpacing: -0.3 },
  /** Row subtitle (artist). */
  rowSubtitle: { fontSize: 13.5, fontWeight: '400' },
  /** Row key. */
  rowKey: { fontSize: 14, fontWeight: '600' },
  /** Row time signature / small meta. */
  rowMeta: { fontSize: 12.5, fontWeight: '400' },
  /** Body / control text. */
  body: { fontSize: 16, fontWeight: '400' },
  /** Uppercase group label (e.g. "SORT BY"). */
  overline: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6 },
} as const

export type Tokens = {
  mode: ThemeMode
  colors: ThemeColors
  spacing: typeof spacing
  radii: typeof radii
  typography: typeof typography
}

export const lightTokens: Tokens = {
  mode: 'light',
  colors: lightColors,
  spacing,
  radii,
  typography,
}

export const darkTokens: Tokens = {
  mode: 'dark',
  colors: darkColors,
  spacing,
  radii,
  typography,
}

export function getTokens(mode: ThemeMode): Tokens {
  return mode === 'dark' ? darkTokens : lightTokens
}
