import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import App from './App'
import { initTheme } from './utils/app/theme'

function bootstrapRouteFromQuery(){
  if (typeof window === 'undefined') return
  const { search, pathname } = window.location
  if (!search) return
  const params = new URLSearchParams(search || '')
  const redirect = params.get('redirect') || params.get('r')
  if (redirect) {
    let target = ''
    try { target = decodeURIComponent(redirect) } catch { target = redirect }
    if (/^https?:\/\//i.test(target)) {
      try {
        const url = new URL(target)
        target = `${url.pathname}${url.search}${url.hash}`
      } catch {}
    }
    if (target && !target.startsWith('/')) target = `/${target}`
    if (target) window.history.replaceState(null, '', target)
    return
  }
  if (pathname && pathname !== '/' && pathname !== '/index.html') return
  const song = params.get('song')
  const resource = params.get('resource')
  const view = params.get('view') || params.get('page')
  let target = ''
  if (song) target = `/songs/${encodeURIComponent(song)}`
  else if (resource) target = `/resources/${encodeURIComponent(resource)}`
  else if (view) {
    const v = view.toLowerCase()
    const allowed = new Set(['about','songs','setlist','songbook','resources','bundle'])
    if (allowed.has(v)) target = `/${v}`
  }
  if (target) {
    window.history.replaceState(null, '', target)
  }
}

function registerServiceWorker(){
  if (typeof window === 'undefined') return
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return
  const version = encodeURIComponent(String(__SW_VERSION__ || 'dev'))
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`/sw.js?v=${version}`, { type: 'module' })
      .catch(() => {})
  })
}

function resetServiceWorkerIfRequested(){
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  const url = new URL(window.location.href)
  if (url.searchParams.get('reset_sw') !== '1') return

  ;(async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.filter((key) => key.startsWith('gracechords-')).map((key) => caches.delete(key)))
      }
    } catch {}

    url.searchParams.delete('reset_sw')
    url.searchParams.set('v', String(Date.now()))
    const search = url.searchParams.toString()
    window.location.replace(`${url.pathname}${search ? `?${search}` : ''}${url.hash}`)
  })()
}

function recoverFromMissingStylesheets(){
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const url = new URL(window.location.href)
  const alreadyRetried = url.searchParams.get('css_retry') === '1'
  window.addEventListener('load', () => {
    const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .filter((node) => (node.getAttribute('href') || '').includes('/assets/'))
    if (!stylesheets.length) return
    const missingStylesheet = stylesheets.some((node) => node.sheet == null)
    if (missingStylesheet && !alreadyRetried) {
      url.searchParams.set('css_retry', '1')
      url.searchParams.set('v', String(Date.now()))
      window.location.replace(`${url.pathname}?${url.searchParams.toString()}${url.hash}`)
      return
    }
    if (alreadyRetried && !missingStylesheet) {
      url.searchParams.delete('css_retry')
      url.searchParams.delete('v')
      const search = url.searchParams.toString()
      window.history.replaceState(null, '', `${url.pathname}${search ? `?${search}` : ''}${url.hash}`)
    }
  }, { once: true })
}

bootstrapRouteFromQuery()
initTheme()
resetServiceWorkerIfRequested()
registerServiceWorker()
recoverFromMissingStylesheets()

// Global styles
import './styles/index.css'

// Variable font already covers all weights; nothing extra to load after idle

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
)
