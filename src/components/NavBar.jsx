import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SetlistIcon } from './Icons'

export default function NavBar(){
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
            </Link>
          </div>
        </div>
      </nav>
    </>
  )
}
