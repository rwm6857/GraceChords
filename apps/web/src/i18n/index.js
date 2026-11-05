import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import {
  DEFAULT_LOCALE,
  I18N_NAMESPACES,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
} from './config'

import enCommon from './locales/en/common.json'
import enNav from './locales/en/nav.json'
import enHome from './locales/en/home.json'
import enAuth from './locales/en/auth.json'
import enSong from './locales/en/song.json'
import enSetlist from './locales/en/setlist.json'
import enProfile from './locales/en/profile.json'
import enAdmin from './locales/en/admin.json'
import enEditor from './locales/en/editor.json'
import enErrors from './locales/en/errors.json'
import enPages from './locales/en/pages.json'




// Only English (the fallback) is bundled. Every other locale is split into its
// own chunk (see manualChunks in vite.config.js) and fetched when it is
// detected or selected. main.jsx waits for `i18nReady` before the first render
// so a non-English visitor never sees raw keys.
const lazyLocales = import.meta.glob(['./locales/*/*.json', '!./locales/en/*.json'], { import: 'default' })

const lazyLocaleBackend = {
  type: 'backend',
  init() {},
  read(lng, ns, callback) {
    const load = lazyLocales[`./locales/${lng}/${ns}.json`]
    if (!load) return callback(null, {})
    load().then(data => callback(null, data), err => callback(err, null))
  },
}

const resources = {
  en: {
    common: enCommon,
    nav: enNav,
    home: enHome,
    auth: enAuth,
    song: enSong,
    setlist: enSetlist,
    profile: enProfile,
    admin: enAdmin,
    editor: enEditor,
    errors: enErrors,
    pages: enPages,
  },
}

const alreadyInitialized = i18n.isInitialized

export const i18nReady = alreadyInitialized ? Promise.resolve() : i18n
  .use(lazyLocaleBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    partialBundledLanguages: true,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES.map(l => l.code),
    ns: I18N_NAMESPACES,
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    react: { useSuspense: false },
  })

if (!alreadyInitialized && typeof document !== 'undefined') {
  const apply = (lng) => {
    try { document.documentElement.lang = lng || DEFAULT_LOCALE } catch {}
  }
  apply(i18n.language)
  i18n.on('languageChanged', apply)
}

export default i18n
