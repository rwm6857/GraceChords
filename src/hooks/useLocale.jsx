import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import i18n from '../i18n'
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  isSupportedLocale,
} from '../i18n/config'
import { useAuth } from './useAuth'
import { supabase } from '../lib/supabase'

const LocaleContext = createContext(null)

function normalize(code) {
  if (!code) return null
  const lower = String(code).toLowerCase()
  if (isSupportedLocale(lower)) return lower
  // Accept regional variants like "ko-KR" or "tr-TR" by matching the base tag.
  const base = lower.split('-')[0]
  return isSupportedLocale(base) ? base : null
}

export function LocaleProvider({ children }) {
  const { session, profile } = useAuth()
  const [language, setLanguageState] = useState(
    () => normalize(i18n.language) || DEFAULT_LOCALE
  )

  // Keep React state in sync with i18next's own language changes (e.g. detector).
  useEffect(() => {
    function onChange(lng) {
      const next = normalize(lng) || DEFAULT_LOCALE
      setLanguageState(next)
    }
    i18n.on('languageChanged', onChange)
    return () => i18n.off('languageChanged', onChange)
  }, [])

  // When a profile loads with a saved ui_language, adopt it.
  useEffect(() => {
    const pref = normalize(profile?.preferences?.ui_language)
    if (pref && pref !== i18n.language) {
      i18n.changeLanguage(pref)
      try { localStorage.setItem(LOCALE_STORAGE_KEY, pref) } catch {}
    }
  }, [profile])

  const setLanguage = useCallback(async (code) => {
    const next = normalize(code) || DEFAULT_LOCALE
    await i18n.changeLanguage(next)
    try { localStorage.setItem(LOCALE_STORAGE_KEY, next) } catch {}

    if (session?.user?.id) {
      const existing = profile?.preferences && typeof profile.preferences === 'object'
        ? profile.preferences
        : {}
      const merged = { ...existing, ui_language: next }
      const { error } = await supabase
        .from('users')
        .update({ preferences: merged })
        .eq('id', session.user.id)
      if (error) {
        // Non-fatal: localStorage still holds the value, so the next visit honors it.
        // eslint-disable-next-line no-console
        console.warn('Failed to persist ui_language preference', error)
      }
    }
  }, [session, profile])

  const value = useMemo(() => ({
    language,
    setLanguage,
    supportedLocales: SUPPORTED_LOCALES,
  }), [language, setLanguage])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    return {
      language: normalize(i18n.language) || DEFAULT_LOCALE,
      setLanguage: async (code) => {
        const next = normalize(code) || DEFAULT_LOCALE
        await i18n.changeLanguage(next)
        try { localStorage.setItem(LOCALE_STORAGE_KEY, next) } catch {}
      },
      supportedLocales: SUPPORTED_LOCALES,
    }
  }
  return ctx
}
