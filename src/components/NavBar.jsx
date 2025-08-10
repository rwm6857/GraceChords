import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SetlistIcon, Sun, Moon } from './Icons'
import { currentTheme, toggleTheme } from '../utils/theme'

export default function NavBar(){
  const [, setBump] = React.useState(0) // local rerender after toggle
  const isDark = (currentTheme() === 'dark')
  const { pathname, hash } = useLocation()
  const path = (hash && hash.replace('#','')) || pathname
  const isActive = (p) => path === p

  return (
    <>
      <a href="#main" style={{position:'absolute', left:-9999, top:-9999}} onFocus={(e)=>{e.target.style.left='8px'; e.target.style.top='8px';}}>Skip to content</a>
      <nav className="topnav">
        <div className="topnav__inner">
          <Link to="/" className="brand">GraceChords</Link>
          <div className="topnav__links">
            <Link to="/" className={`topnav__link ${isActive('/') ? 'active':''}`}>Home</Link>
            <Link to="/setlist" className={`topnav__link ${isActive('/setlist') ? 'active':''}`}>
              <span style={{display:'inline-flex',alignItems:'center',gap:6}}><SetlistIcon /> Setlist</span>
			<button
             className="iconbtn"
             aria-label="Toggle dark mode"
             aria-pressed={isDark}
             title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
             onClick={() => { toggleTheme(); setBump(x => x + 1) }}
             style={{ marginLeft: 8 }}
           >
             {isDark ? <Sun /> : <Moon />}
           </button>
			</Link>
          </div>
        </div>
      </nav>
    </>
  )
}
