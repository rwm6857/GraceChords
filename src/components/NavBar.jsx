import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SetlistIcon, Sun, Moon } from './Icons'
import { currentTheme, toggleTheme } from '../utils/theme'

export default function NavBar(){
  const [, setBump] = React.useState(0)
  const isDark = (currentTheme() === 'dark')
  const { pathname, hash } = useLocation()
  const path = (hash && hash.replace('#','')) || pathname
  const isActive = (p) => path === p

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
      <nav className="topnav">
        <div className="topnav__inner">
          <Link to="/" className="brand">GraceChords</Link>
          <div className="topnav__links">
            <Link to="/" className={`topnav__link ${isActive('/') ? 'active':''}`}>Home</Link>
            <Link to="/setlist" className={`topnav__link ${isActive('/setlist') ? 'active':''}`}>
              <span style={{display:'inline-flex',alignItems:'center',gap:6}}>
                <SetlistIcon /> Setlist
              </span>
            </Link>
            <Link to="/songbook" className={`topnav__link ${isActive('/songbook') ? 'active':''}`}>Songbook</Link>
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
