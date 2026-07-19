import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getLocales } from 'expo-localization'
import { DEFAULT_LOCALE, resolveLanguage } from './config'
import { I18N_NAMESPACES, RESOURCES, SUPPORTED_LOCALES } from './resources'

// i18next needs Intl.PluralRules for _one/_other key selection; Hermes' Intl
// subset doesn't guarantee it, so load the small polyfill only when missing.
if (typeof Intl === 'undefined' || typeof Intl.PluralRules === 'undefined') {
  require('intl-pluralrules')
}

/** BCP-47 tags of the device's preferred languages, best first. */
export function deviceLanguageTags(): string[] {
  try {
    return getLocales()
      .map((l) => l.languageTag)
      .filter(Boolean)
  } catch {
    return []
  }
}

// Initialized at import with the device-resolved language so first render is
// already localized; the stored Settings pick (hydrated during the splash
// hold) is applied via applyLanguagePreference before the splash lifts, so a
// differing stored choice never flashes. Config mirrors apps/web/src/i18n.
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: RESOURCES,
    lng: resolveLanguage(null, deviceLanguageTags(), SUPPORTED_LOCALES),
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES,
    ns: I18N_NAMESPACES,
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    react: { useSuspense: false },
  })
} else {
  // Dev Fast Refresh re-evaluates this module (rebuilding RESOURCES from the
  // edited locale JSON) without resetting i18next, so `i18n.isInitialized` is
  // already true and the `.init()` branch above — the only place RESOURCES
  // normally lands in the live instance — never runs again. Without this, a
  // key added/changed in a locale file shows as its raw key until a full app
  // restart. addResourceBundle (deep-merge, overwrite) patches every
  // locale/namespace into the running instance so edits take effect on reload.
  for (const locale of Object.keys(RESOURCES)) {
    for (const ns of Object.keys(RESOURCES[locale])) {
      i18n.addResourceBundle(locale, ns, RESOURCES[locale][ns], true, true)
    }
  }
}

/**
 * Re-resolve and switch the UI language for a preference (null = follow the
 * device). Returns the resolved locale code. Callers persist the preference
 * separately (src/lib/defaults.ts) — this only drives i18next.
 */
export function applyLanguagePreference(stored: string | null): string {
  const next = resolveLanguage(stored, deviceLanguageTags(), SUPPORTED_LOCALES)
  if (i18n.language !== next) void i18n.changeLanguage(next)
  return next
}

export { SUPPORTED_LOCALES }
export default i18n
