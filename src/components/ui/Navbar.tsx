import React, { useCallback, useLayoutEffect, useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import OfflineBadge from '../OfflineBadge'
import { GearIcon } from '../Icons'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import SpriteAvatar from './SpriteAvatar'
import SettingsCluster from './SettingsCluster'
import { useSettings } from '../../hooks/useSettings'

export default function Navbar(){
  const { t } = useTranslation(['nav', 'common'])
  const { pathname, hash } = useLocation()
  const path = (hash && hash.replace('#','')) || pathname
  const isActive = (p: string) => path === p
  const navRef = useRef<HTMLDivElement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const firstLinkRef = useRef<HTMLAnchorElement | null>(null)
  const drawerRef = useRef<HTMLDivElement | null>(null)
  const [portalNode, setPortalNode] = useState<HTMLDivElement | null>(null)
  const [open, setOpen] = React.useState(false)
  const { isLoggedIn, loading: authLoading, session, profile, hasMinRole, role } = useAuth()
  const { theme } = useSettings()
  const isDark = theme === 'dark'
  const [userMenuOpen, setUserMenuOpen] = React.useState(false)
  const userMenuRef = React.useRef<HTMLDivElement | null>(null)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const settingsRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!userMenuOpen) return
    function handleOutsideClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [userMenuOpen])

  React.useEffect(() => {
    setUserMenuOpen(false)
    setSettingsOpen(false)
  }, [pathname, hash])

  React.useEffect(() => {
    if (!settingsOpen) return
    function handleOutsideClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('click', handleOutsideClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', handleOutsideClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [settingsOpen])

  async function handleSignOut() {
    setUserMenuOpen(false)
    await supabase.auth.signOut()
  }

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
  const closeDrawer = useCallback(() => {
    setOpen(false)
    lockBodyScroll(false)
    setTimeout(() => btnRef.current?.focus(), 0)
  }, [])

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
  }, [open, closeDrawer])

  return (
    <>
      <nav className="gc-navbar" ref={navRef as any}>
        <div className="gc-navbar__inner">
        <Link to="/" className="gc-brand" aria-label={t('graceChordsHome')}>
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
          aria-label={t('openMainMenu')}
          aria-controls="gc-mobile-nav"
          aria-expanded={open}
          onClick={(e)=> { e.preventDefault(); open ? closeDrawer() : openDrawer() }}
        >
          {/* simple hamburger icon */}
          <span aria-hidden="true" style={{display:'inline-block', width:18, height:2, background:'currentColor', boxShadow:'0 6px 0 currentColor, 0 -6px 0 currentColor'}} />
        </button>
        <div className="gc-navlinks">
          <Link to="/" className={`gc-navlink ${isActive('/') ? 'active':''}`} style={isActive('/') ? ({ color:'#ffffff', WebkitTextFillColor:'#ffffff' } as any) : undefined}>{t('home')}</Link>
          <Link to="/songs" className={`gc-navlink ${isActive('/songs') ? 'active':''}`} style={isActive('/songs') ? ({ color:'#ffffff', WebkitTextFillColor:'#ffffff' } as any) : undefined}>{t('songs')}</Link>
          <Link to="/setlist" className={`gc-navlink ${isActive('/setlist') ? 'active':''}`} onMouseEnter={() => import('../../pages/SetlistPage')} style={isActive('/setlist') ? ({ color:'#ffffff', WebkitTextFillColor:'#ffffff' } as any) : undefined}>{t('setlist')}</Link>
          <Link to="/songbook" className={`gc-navlink ${isActive('/songbook') ? 'active':''}`} onMouseEnter={() => import('../../pages/SongbookPage')} style={isActive('/songbook') ? ({ color:'#ffffff', WebkitTextFillColor:'#ffffff' } as any) : undefined}>{t('songbook')}</Link>
          <Link to="/reading" className={`gc-navlink ${isActive('/reading') ? 'active':''}`} onMouseEnter={() => import('../../pages/ReadingsPage')} style={isActive('/reading') ? ({ color:'#ffffff', WebkitTextFillColor:'#ffffff' } as any) : undefined}>{t('dailyWord')}</Link>
          <Link to="/posts" className={`gc-navlink ${isActive('/posts') ? 'active':''}`} style={isActive('/posts') ? ({ color:'#ffffff', WebkitTextFillColor:'#ffffff' } as any) : undefined}>{t('blog')}</Link>
          {isLoggedIn && !hasMinRole('admin') && role === 'editor' && (
            <Link to="/editor" className={`gc-navlink ${isActive('/editor') ? 'active':''}`} style={isActive('/editor') ? ({ color:'#ffffff', WebkitTextFillColor:'#ffffff' } as any) : undefined}>{t('editorPortal')}</Link>
          )}
          {/* Settings tray — gear icon opens a small panel with theme/locale/chord style */}
          <div className="gc-settings-tray-host" ref={settingsRef}>
            <button
              type="button"
              className="gc-settings-tray-btn"
              aria-label={t('common:settings', { defaultValue: 'Settings' })}
              aria-expanded={settingsOpen}
              aria-haspopup="menu"
              onClick={() => setSettingsOpen(o => !o)}
            >
              <GearIcon />
            </button>
            {settingsOpen && (
              <div className="gc-settings-tray" role="menu">
                <p className="gc-settings-tray__title">
                  {t('common:settings', { defaultValue: 'Settings' })}
                </p>
                <SettingsCluster orientation="column" showLabels />
              </div>
            )}
          </div>
          {/* Auth slot — desktop */}
          {!authLoading && (
            isLoggedIn ? (
              <div className="gc-user-menu" ref={userMenuRef}>
                <button
                  className="gc-user-avatar-btn"
                  onClick={() => setUserMenuOpen(o => !o)}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                  aria-label={t('userMenu')}
                >
                  <SpriteAvatar sprite={profile?.preferences?.sprite} size="sm" />
                </button>
                {userMenuOpen && (
                  <div className="gc-user-dropdown" role="menu">
                    <p className="gc-user-dropdown__name">
                      {profile?.display_name || session?.user?.email}
                    </p>
                    <Link
                      to="/profile"
                      className="gc-user-dropdown__item"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      {t('profile')}
                    </Link>
                    {hasMinRole('collaborator') && (
                      <Link
                        to="/portal/editor"
                        className="gc-user-dropdown__item"
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        {t('songEditor')}
                      </Link>
                    )}
                    {hasMinRole('editor') && (
                      <Link
                        to="/portal/posts"
                        className="gc-user-dropdown__item"
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        {t('postEditor')}
                      </Link>
                    )}
                    {(role === 'admin' || role === 'owner') && (
                      <Link
                        to="/admin"
                        className="gc-user-dropdown__item"
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        {t('adminPortal')}
                      </Link>
                    )}
                    <hr className="gc-user-dropdown__divider" />
                    <button
                      className="gc-user-dropdown__item"
                      role="menuitem"
                      onClick={handleSignOut}
                    >
                      {t('signOut')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/login" className="gc-nav-signin">{t('signIn')}</Link>
            )
          )}
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
          <nav className="gc-drawer__panel" role="navigation" aria-label={t('mobileMenu')}>
            <div className="gc-drawer__links">
              <Link ref={firstLinkRef as any} to="/" onClick={closeDrawer} className={`gc-navlink ${isActive('/') ? 'active':''}`}>{t('home')}</Link>
              <Link to="/songs" onClick={closeDrawer} className={`gc-navlink ${isActive('/songs') ? 'active':''}`}>{t('songs')}</Link>
              <Link to="/setlist" onClick={closeDrawer} className={`gc-navlink ${isActive('/setlist') ? 'active':''}`}>{t('setlist')}</Link>
              <Link to="/songbook" onClick={closeDrawer} className={`gc-navlink ${isActive('/songbook') ? 'active':''}`}>{t('songbook')}</Link>
              <Link to="/reading" onClick={closeDrawer} className={`gc-navlink ${isActive('/reading') ? 'active':''}`}>{t('dailyWord')}</Link>
              <Link to="/posts" onClick={closeDrawer} className={`gc-navlink ${isActive('/posts') ? 'active':''}`}>{t('blog')}</Link>

              {isLoggedIn && hasMinRole('collaborator') && (
                <Link to="/portal/editor" onClick={closeDrawer} className={`gc-navlink ${isActive('/portal/editor') ? 'active':''}`}>{t('songEditor')}</Link>
              )}
              {isLoggedIn && hasMinRole('admin') && (
                <Link to="/admin" onClick={closeDrawer} className={`gc-navlink ${isActive('/admin') ? 'active':''}`}>{t('adminPortal')}</Link>
              )}
            </div>
            <div className="gc-drawer__footer">
              <OfflineBadge forceText />
              <div style={{ marginTop: 12 }}>
                <SettingsCluster orientation="column" showLabels />
              </div>
              {/* Auth slot — mobile */}
              {!authLoading && (
                isLoggedIn ? (
                  <div style={{ marginTop: 12 }}>
                    <Link
                      to="/profile"
                      className="gc-btn gc-btn--secondary"
                      onClick={closeDrawer}
                      style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <SpriteAvatar sprite={profile?.preferences?.sprite} size="sm" />
                      <span>{profile?.display_name || t('profile')}</span>
                    </Link>
                    <button
                      type="button"
                      className="gc-signout-link"
                      onClick={async () => { await handleSignOut(); closeDrawer() }}
                    >
                      {t('signOut')}
                    </button>
                  </div>
                ) : (
                  <Link
                    to="/login"
                    className="gc-nav-signin"
                    onClick={closeDrawer}
                    style={{ display: 'block', textAlign: 'center', marginTop: 12 }}
                  >
                    {t('signIn')}
                  </Link>
                )
              )}
            </div>
          </nav>
        </div>,
        portalNode
      ) : null}
    </>
  )
}
