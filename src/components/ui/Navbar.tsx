import React, { useLayoutEffect, useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import OfflineBadge from '../OfflineBadge'
import { currentTheme, toggleTheme } from '../../utils/app/theme'
import { Sun, Moon } from '../Icons'

export default function Navbar(){
  const [, setBump] = React.useState(0)
  const isDark = (currentTheme() === 'dark')
  const { pathname, hash } = useLocation()
  const path = (hash && hash.replace('#','')) || pathname
  const isActive = (p: string) => path === p
  const navRef = useRef<HTMLDivElement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const firstLinkRef = useRef<HTMLAnchorElement | null>(null)
  const drawerRef = useRef<HTMLDivElement | null>(null)
  const [portalNode, setPortalNode] = useState<HTMLDivElement | null>(null)
  const [open, setOpen] = React.useState(false)

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

  useEffect(() => {
    const host = document.createElement('div')
    host.className = 'gc-drawer-host'
    document.body.appendChild(host)
    setPortalNode(host)
    return () => {
      if (host.parentNode) host.parentNode.removeChild(host)
      lockBodyScroll(false)
    }
  }, [])

  // Drawer helpers
  function lockBodyScroll(lock: boolean){
    try { document.body.style.overflow = lock ? 'hidden' as any : '' } catch {}
  }
  function openDrawer(){
    setOpen(true)
    lockBodyScroll(true)
    setTimeout(() => firstLinkRef.current?.focus(), 0)
  }
  function closeDrawer(){
    setOpen(false)
    lockBodyScroll(false)
    setTimeout(() => btnRef.current?.focus(), 0)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent){
      if (!open) return
      if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); return }
      if (e.key === 'Tab'){
        const host = drawerRef.current
        if (!host) return
        const focusables = host.querySelectorAll<HTMLElement>('a,button,[tabindex]:not([tabindex="-1"])')
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement as HTMLElement | null
        if (e.shiftKey){
          if (active === first || !host.contains(active)) { e.preventDefault(); (last as HTMLElement).focus() }
        } else {
          if (active === last) { e.preventDefault(); (first as HTMLElement).focus() }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      <nav className="gc-navbar" ref={navRef as any}>
        <div className="gc-navbar__inner">
        <Link to="/" className="gc-brand" aria-label="GraceChords home">
          {/* Wide logo for tablet/desktop */}
          <img
            src={isDark ? '/gc-brand-wide-dark.svg' : '/gc-brand-wide-light.svg'}
            alt="GraceChords"
            className="gc-brand__logo gc-brand__logo--wide"
            width={240}
            height={42}
          />
          {/* Square logo for mobile */}
          <img
            src={isDark ? '/gc-brand-square-dark.svg' : '/gc-brand-square-light.svg'}
            alt="GraceChords"
            className="gc-brand__logo gc-brand__logo--square"
            width={60}
            height={42}
          />
        </Link>
        {/* Hamburger on mobile/tablet */}
        <button
          ref={btnRef as any}
          className="gc-hamburger"
          aria-label="Open main menu"
          aria-controls="gc-mobile-nav"
          aria-expanded={open}
          onClick={(e)=> { e.preventDefault(); open ? closeDrawer() : openDrawer() }}
        >
          {/* simple hamburger icon */}
          <span aria-hidden="true" style={{display:'inline-block', width:18, height:2, background:'currentColor', boxShadow:'0 6px 0 currentColor, 0 -6px 0 currentColor'}} />
        </button>
        <div className="gc-navlinks">
          <Link to="/" className={`gc-navlink ${isActive('/') ? 'active':''}`} style={isActive('/') ? ({ color:'#ffffff', WebkitTextFillColor:'#ffffff' } as any) : undefined}>Home</Link>
          <Link to="/songs" className={`gc-navlink ${isActive('/songs') ? 'active':''}`} style={isActive('/songs') ? ({ color:'#ffffff', WebkitTextFillColor:'#ffffff' } as any) : undefined}>Songs</Link>
          <Link to="/setlist" className={`gc-navlink ${isActive('/setlist') ? 'active':''}`} onMouseEnter={() => import('../../pages/SetlistPage')} style={isActive('/setlist') ? ({ color:'#ffffff', WebkitTextFillColor:'#ffffff' } as any) : undefined}>Setlist</Link>
          <Link to="/songbook" className={`gc-navlink ${isActive('/songbook') ? 'active':''}`} onMouseEnter={() => import('../../pages/SongbookPage')} style={isActive('/songbook') ? ({ color:'#ffffff', WebkitTextFillColor:'#ffffff' } as any) : undefined}>Songbook</Link>
          <Link to="/reading" className={`gc-navlink ${isActive('/reading') ? 'active':''}`} onMouseEnter={() => import('../../pages/ReadingsPage')} style={isActive('/reading') ? ({ color:'#ffffff', WebkitTextFillColor:'#ffffff' } as any) : undefined}>Daily Word</Link>
          <Link to="/resources" className={`gc-navlink ${isActive('/resources') ? 'active':''}`} style={isActive('/resources') ? ({ color:'#ffffff', WebkitTextFillColor:'#ffffff' } as any) : undefined}>Blog</Link>
          <a href="https://github.com/rwm6857/GraceChords/wiki" className="gc-navlink" target="_blank" rel="noopener noreferrer">Wiki</a>
          <OfflineBadge />
          {/* Theme toggle stays in topbar on desktop; hidden with .gc-navlinks at ≤820px */}
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
      {portalNode ? createPortal(
        <div
          id="gc-mobile-nav"
          ref={drawerRef as any}
          className={['gc-drawer', open ? 'open' : ''].filter(Boolean).join(' ')}
          data-open={open ? 'true' : 'false'}
          aria-hidden={!open}
        >
          <button type="button" className="gc-drawer__overlay" onClick={()=> closeDrawer()} aria-hidden="true" tabIndex={-1} />
          <nav className="gc-drawer__panel" role="navigation" aria-label="Mobile menu">
            <div className="gc-drawer__links">
              <Link ref={firstLinkRef as any} to="/" onClick={closeDrawer} className={`gc-navlink ${isActive('/') ? 'active':''}`}>Home</Link>
              <Link to="/songs" onClick={closeDrawer} className={`gc-navlink ${isActive('/songs') ? 'active':''}`}>Songs</Link>
              <Link to="/setlist" onClick={closeDrawer} className={`gc-navlink ${isActive('/setlist') ? 'active':''}`}>Setlist</Link>
              <Link to="/songbook" onClick={closeDrawer} className={`gc-navlink ${isActive('/songbook') ? 'active':''}`}>Songbook</Link>
              <Link to="/reading" onClick={closeDrawer} className={`gc-navlink ${isActive('/reading') ? 'active':''}`}>Daily Word</Link>
              <Link to="/resources" onClick={closeDrawer} className={`gc-navlink ${isActive('/resources') ? 'active':''}`}>Blog</Link>
              <a href="https://github.com/rwm6857/GraceChords/wiki" target="_blank" rel="noopener noreferrer" className="gc-navlink" onClick={closeDrawer}>Wiki</a>
            </div>
            <div className="gc-drawer__footer">
              <OfflineBadge forceText />
              <button
                className="gc-btn gc-btn--secondary"
                aria-label="Toggle dark mode"
                aria-pressed={isDark}
                onClick={onToggleClick}
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                style={{ width:'100%', justifyContent:'center', marginTop:8 }}
              >
                {isDark ? <Sun /> : <Moon />} <span style={{ marginLeft:8 }}>{isDark ? 'Light mode' : 'Dark mode'}</span>
              </button>
            </div>
          </nav>
        </div>,
        portalNode
      ) : null}
    </>
  )
}
