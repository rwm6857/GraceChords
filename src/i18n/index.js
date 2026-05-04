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

import esCommon from './locales/es/common.json'
import esNav from './locales/es/nav.json'
import esHome from './locales/es/home.json'
import esAuth from './locales/es/auth.json'
import esSong from './locales/es/song.json'
import esSetlist from './locales/es/setlist.json'
import esProfile from './locales/es/profile.json'
import esAdmin from './locales/es/admin.json'
import esEditor from './locales/es/editor.json'
import esErrors from './locales/es/errors.json'
import esPages from './locales/es/pages.json'

import koCommon from './locales/ko/common.json'
import koNav from './locales/ko/nav.json'
import koHome from './locales/ko/home.json'
import koAuth from './locales/ko/auth.json'
import koSong from './locales/ko/song.json'
import koSetlist from './locales/ko/setlist.json'
import koProfile from './locales/ko/profile.json'
import koAdmin from './locales/ko/admin.json'
import koEditor from './locales/ko/editor.json'
import koErrors from './locales/ko/errors.json'
import koPages from './locales/ko/pages.json'

import trCommon from './locales/tr/common.json'
import trNav from './locales/tr/nav.json'
import trHome from './locales/tr/home.json'
import trAuth from './locales/tr/auth.json'
import trSong from './locales/tr/song.json'
import trSetlist from './locales/tr/setlist.json'
import trProfile from './locales/tr/profile.json'
import trAdmin from './locales/tr/admin.json'
import trEditor from './locales/tr/editor.json'
import trErrors from './locales/tr/errors.json'
import trPages from './locales/tr/pages.json'

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
  es: {
    common: esCommon,
    nav: esNav,
    home: esHome,
    auth: esAuth,
    song: esSong,
    setlist: esSetlist,
    profile: esProfile,
    admin: esAdmin,
    editor: esEditor,
    errors: esErrors,
    pages: esPages,
  },
  ko: {
    common: koCommon,
    nav: koNav,
    home: koHome,
    auth: koAuth,
    song: koSong,
    setlist: koSetlist,
    profile: koProfile,
    admin: koAdmin,
    editor: koEditor,
    errors: koErrors,
    pages: koPages,
  },
  tr: {
    common: trCommon,
    nav: trNav,
    home: trHome,
    auth: trAuth,
    song: trSong,
    setlist: trSetlist,
    profile: trProfile,
    admin: trAdmin,
    editor: trEditor,
    errors: trErrors,
    pages: trPages,
  },
}

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
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

  if (typeof document !== 'undefined') {
    const apply = (lng) => {
      try { document.documentElement.lang = lng || DEFAULT_LOCALE } catch {}
    }
    apply(i18n.language)
    i18n.on('languageChanged', apply)
  }
}

export default i18n
