import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import App from './App'
import { initTheme } from './utils/theme'

function bootstrapHashFromQuery(){
  if (typeof window === 'undefined') return
  const { search, hash } = window.location
  if (hash && hash !== '#' && hash !== '#/') return
  const params = new URLSearchParams(search || '')
  const song = params.get('song')
  const resource = params.get('resource')
  const view = params.get('view') || params.get('page')
  let target = ''
  if (song) target = `#/song/${encodeURIComponent(song)}`
  else if (resource) target = `#/resources/${encodeURIComponent(resource)}`
  else if (view) {
    const v = view.toLowerCase()
    const allowed = new Set(['about','songs','setlist','songbook','resources','bundle'])
    if (allowed.has(v)) target = `#/${v}`
  }
  if (target) {
    window.location.hash = target.replace(/^#/, '')
    // Clean the query from the URL once we've mapped into the hash route
    const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`
    window.history.replaceState(null, '', cleanUrl)
  }
}

bootstrapHashFromQuery()
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
      <HashRouter>
        <App />
      </HashRouter>
    </HelmetProvider>
  </React.StrictMode>
)
