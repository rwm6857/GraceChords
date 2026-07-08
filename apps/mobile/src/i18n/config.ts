// Pure i18n config + app-language resolution (RN-free, unit-tested headless).
// Mirrors apps/web/src/i18n/config.js. The supported-locale list itself is
// derived from the locale folders in resources.ts — this module only holds the
// pieces that can't come from the filesystem (labels, resolution rules).

export const DEFAULT_LOCALE = 'en'

// code → native display name for the Settings picker. Hermes has no
// Intl.DisplayNames data (same constraint as core's translationMenu.ts), so
// names are explicit; unknown codes fall back to the uppercased code.
const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Español',
  ko: '한국어',
  tr: 'Türkçe',
}

export function localeLabel(code: string): string {
  return LOCALE_LABELS[code] ?? code.toUpperCase()
}

/** 'ko-KR' / 'en_US' → 'ko' / 'en'. Empty input stays empty. */
export function normalizeLanguageTag(tag: unknown): string {
  return String(tag ?? '')
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0]
}

/**
 * Resolve the app UI language, in order: the user's stored explicit pick when
 * it's a supported locale → the first supported device language → English.
 * `stored` null/'' means "follow the device."
 */
export function resolveLanguage(
  stored: string | null | undefined,
  deviceTags: readonly string[],
  supported: readonly string[]
): string {
  const pick = normalizeLanguageTag(stored)
  if (pick && supported.includes(pick)) return pick
  for (const tag of deviceTags) {
    const base = normalizeLanguageTag(tag)
    if (base && supported.includes(base)) return base
  }
  return DEFAULT_LOCALE
}
