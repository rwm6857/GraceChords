// src/utils/theme.js
const STORAGE_KEY = 'gracechords.theme'

export function getStoredTheme() {
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'dark' || v === 'light' ? v : null
}

export function systemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light'
}

/** Apply theme to <html data-theme="...">. Optionally persist. */
export function applyTheme(theme, { persist = false } = {}) {
  const t = theme === 'dark' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', t)
  if (persist) localStorage.setItem(STORAGE_KEY, t)
}

/** Initialize theme: use stored value or system preference (without persisting). */
export function initTheme() {
  const stored = getStoredTheme()
  const initial = stored || (systemPrefersDark() ? 'dark' : 'light')
  applyTheme(initial, { persist: false })

  // If user has NOT chosen a theme, live-update when system preference changes
  if (!stored && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => applyTheme(e.matches ? 'dark' : 'light', { persist: false })
    try {
      mq.addEventListener('change', handler)
    } catch {
      // Safari
      mq.addListener(handler)
    }
  }
}

/** Toggle and persist. Returns new theme. */
export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark'
  applyTheme(next, { persist: true })
  return next
}
