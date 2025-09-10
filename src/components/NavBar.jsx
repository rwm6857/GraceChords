import React, { useLayoutEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Sun, Moon } from './Icons'
import OfflineBadge from './OfflineBadge'
import { currentTheme, toggleTheme } from '../utils/theme'

export default function NavBar(){
  const [, setBump] = React.useState(0)
  const isDark = (currentTheme() === 'dark')
  const { pathname, hash } = useLocation()
  const path = (hash && hash.replace('#','')) || pathname
  const isActive = (p) => path === p
  const navRef = useRef(null)

  useLayoutEffect(() => {
    function updateNavHeight(){
      try {
        const h = navRef.current?.offsetHeight || 0
        document.documentElement.style.setProperty('--nav-h', `${h}px`)
      } catch {}
    }
    updateNavHeight()
    window.addEventListener('resize', updateNavHeight)
    return () => window.removeEventListener('resize', updateNavHeight)
  }, [])

  function onToggleClick(e){
    // In case a refactor ever nests this again, guard against navigation
    e.stopPropagation()
    e.preventDefault()
    toggleTheme()
    setBump(x => x + 1)
  }

  return (
    <>
      <a href="#main" style={{position:'absolute', left:-9999, top:-9999}} onFocus={(e)=>{e.target.style.left='8px'; e.target.style.top='8px';}}>Skip to content</a>
      <nav className="topnav" ref={navRef}>
        <div className="topnav__inner">
          <Link to="/" className="brand">GraceChords</Link>
          <div className="topnav__links">
            <Link to="/" className={`topnav__link ${isActive('/') ? 'active':''}`}>Home</Link>
            <Link
              to="/about"
              className={`topnav__link ${isActive('/about') ? 'active':''}`}
            >
              About
            </Link>
            <Link
              to="/setlist"
              className={`topnav__link ${isActive('/setlist') ? 'active':''}`}
              onMouseEnter={() => import('./Setlist')}
            >
              Setlist
            </Link>
            <Link
              to="/songbook"
              className={`topnav__link ${isActive('/songbook') ? 'active':''}`}
              onMouseEnter={() => import('./Songbook')}
            >
              Songbook
            </Link>
            <Link
              to="/resources"
              className={`topnav__link ${isActive('/resources') ? 'active':''}`}
            >
              Resources
            </Link>
            <a
              href="https://github.com/rwm6857/GraceChords/wiki"
              className="topnav__link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Docs
            </a>
            <OfflineBadge />
            {/* Toggle lives OUTSIDE links */}
            <button
              className="iconbtn"
              aria-label="Toggle dark mode"
              aria-pressed={isDark}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={onToggleClick}
              style={{ marginLeft: 8 }}
            >
              {isDark ? <Sun /> : <Moon />}
            </button>
          </div>
        </div>
      </nav>
    </>
  )
}
