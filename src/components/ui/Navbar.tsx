import React, { useLayoutEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import OfflineBadge from '../OfflineBadge'
import { currentTheme, toggleTheme } from '../../utils/theme'
import { Sun, Moon } from '../Icons'

export default function Navbar(){
  const [, setBump] = React.useState(0)
  const isDark = (currentTheme() === 'dark')
  const { pathname, hash } = useLocation()
  const path = (hash && hash.replace('#','')) || pathname
  const isActive = (p: string) => path === p
  const navRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    function update(){
      try {
        const h = (navRef.current?.offsetHeight || 0)
        document.documentElement.style.setProperty('--nav-h', `${h}px`)
      } catch {}
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  function onToggleClick(e: React.MouseEvent){
    e.preventDefault()
    toggleTheme()
    setBump(x => x + 1)
  }

  return (
    <nav className="gc-navbar" ref={navRef as any}>
      <div className="gc-navbar__inner">
        <Link to="/" className="gc-brand">GraceChords</Link>
        <div className="gc-navlinks">
          <Link to="/" className={`gc-navlink ${isActive('/') ? 'active':''}`}>Home</Link>
          <Link to="/about" className={`gc-navlink ${isActive('/about') ? 'active':''}`}>About</Link>
          <Link to="/setlist" className={`gc-navlink ${isActive('/setlist') ? 'active':''}`} onMouseEnter={() => import('../Setlist')}>Setlist</Link>
          <Link to="/songbook" className={`gc-navlink ${isActive('/songbook') ? 'active':''}`} onMouseEnter={() => import('../Songbook')}>Songbook</Link>
          <Link to="/resources" className={`gc-navlink ${isActive('/resources') ? 'active':''}`}>Resources</Link>
          <a href="https://github.com/rwm6857/GraceChords/wiki" className="gc-navlink" target="_blank" rel="noopener noreferrer">Docs</a>
          <OfflineBadge />
          <button
            className="gc-btn gc-btn--ghost"
            aria-label="Toggle dark mode"
            aria-pressed={isDark}
            onClick={onToggleClick}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun /> : <Moon />}
          </button>
        </div>
      </div>
    </nav>
  )
}

