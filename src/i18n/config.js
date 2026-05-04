// Supported UI locales for GraceChords. To add a new language:
//  1. Add an entry below (code = BCP-47 lang tag, label = native name).
//  2. Create src/i18n/locales/<code>/ with the same JSON files as en/.
//  3. Run `npm run i18n:check` to confirm key parity.
export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'ko', label: '한국어' },
  { code: 'tr', label: 'Türkçe' },
]

export const DEFAULT_LOCALE = 'en'

export const LOCALE_STORAGE_KEY = 'gracechords.uiLanguage'

export const I18N_NAMESPACES = [
  'common',
  'nav',
  'home',
  'auth',
  'song',
  'setlist',
  'profile',
  'admin',
  'editor',
  'errors',
  'pages',
]

export function isSupportedLocale(code) {
  return SUPPORTED_LOCALES.some(l => l.code === code)
}
