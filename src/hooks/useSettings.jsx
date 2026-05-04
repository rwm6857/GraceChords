import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { applyTheme, currentTheme } from '../utils/app/theme'

const CHORD_STYLE_KEY = 'gracechords.chordStyle'

const SettingsContext = createContext(null)

function readStoredChordStyle() {
  try {
    const v = localStorage.getItem(CHORD_STYLE_KEY)
    return v === 'solfege' ? 'solfege' : 'letters'
  } catch {
    return 'letters'
  }
}

export function SettingsProvider({ children }) {
  const [theme, setThemeState] = useState(() => currentTheme())
  const [chordStyle, setChordStyleState] = useState(() => readStoredChordStyle())

  // Stay in sync if anything else mutates the html data-theme attribute
  // (e.g. the system-preference watcher set up in main.jsx).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return
    const obs = new MutationObserver(() => {
      const next = currentTheme()
      setThemeState(prev => (prev === next ? prev : next))
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  // Cross-tab sync for chord style
  useEffect(() => {
    if (typeof window === 'undefined') return
    function onStorage(e) {
      if (e.key !== CHORD_STYLE_KEY) return
      setChordStyleState(e.newValue === 'solfege' ? 'solfege' : 'letters')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setTheme = useCallback((next) => {
    const t = next === 'dark' ? 'dark' : 'light'
    applyTheme(t, { persist: true })
    setThemeState(t)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      applyTheme(next, { persist: true })
      return next
    })
  }, [])

  const setChordStyle = useCallback((style) => {
    const s = style === 'solfege' ? 'solfege' : 'letters'
    try { localStorage.setItem(CHORD_STYLE_KEY, s) } catch {}
    setChordStyleState(s)
  }, [])

  const toggleChordStyle = useCallback(() => {
    setChordStyleState(prev => {
      const next = prev === 'solfege' ? 'letters' : 'solfege'
      try { localStorage.setItem(CHORD_STYLE_KEY, next) } catch {}
      return next
    })
  }, [])

  const value = useMemo(() => ({
    theme,
    setTheme,
    toggleTheme,
    chordStyle,
    setChordStyle,
    toggleChordStyle,
  }), [theme, setTheme, toggleTheme, chordStyle, setChordStyle, toggleChordStyle])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    return {
      theme: typeof document !== 'undefined' ? currentTheme() : 'light',
      setTheme: () => {},
      toggleTheme: () => {},
      chordStyle: readStoredChordStyle(),
      setChordStyle: () => {},
      toggleChordStyle: () => {},
    }
  }
  return ctx
}

export function useChordStyle() {
  return useSettings().chordStyle
}
