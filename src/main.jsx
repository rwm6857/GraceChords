import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import App from './App'
import { initTheme } from './utils/theme'

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

bootstrapRouteFromQuery()
initTheme()

// Global styles
import './styles.css'
import './styles/fonts.css'
import './styles/cards.css'
import './components/ui/ui.css'

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
