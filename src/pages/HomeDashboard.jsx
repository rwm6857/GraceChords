import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import indexData from '../data/index.json'
import heroDark from '../assets/dashboard-hero-worship-angled.png'
import heroLight from '../assets/dashboard-hero-worship-angled-light.png'
import { currentTheme } from '../utils/theme'

const SITE_URL = 'https://gracechords.com'
const OG_IMAGE_URL = `${SITE_URL}/favicon.ico`
const MAX_SUGGESTIONS = 5

export default function HomeDashboard(){
  const navigate = useNavigate()
  const items = useMemo(() => indexData?.items || [], [])
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef(null)
  const blurTimer = useRef(null)
  const [theme, setTheme] = useState(() => currentTheme())

  const trimmed = query.trim()
  const suggestions = useMemo(() => {
    if (!trimmed) return []
    const q = trimmed.toLowerCase()
    const scored = []
    for (const s of items) {
      const title = (s.title || '').toLowerCase()
      const tags = (s.tags || []).map(t => String(t).toLowerCase())
      const authors = (s.authors || []).map(a => String(a).toLowerCase())
      const haystack = [title, ...tags, ...authors].join(' ')
      if (title.includes(q) || haystack.includes(q)) {
        const starts = title.startsWith(q) ? 1 : 0
        scored.push({ s, starts })
      }
    }
    scored.sort((a, b) => b.starts - a.starts || a.s.title.localeCompare(b.s.title))
    return scored.slice(0, MAX_SUGGESTIONS).map(x => x.s)
  }, [items, trimmed])

  useEffect(() => {
    if (!showSuggestions) setActiveIndex(-1)
  }, [showSuggestions, trimmed])

  // Watch for theme changes via data-theme on <html>
  useEffect(() => {
    const el = document.documentElement
    const observer = new MutationObserver(() => {
      setTheme(currentTheme())
    })
    observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  function clearBlurTimer(){
    if (blurTimer.current) {
      clearTimeout(blurTimer.current)
      blurTimer.current = null
    }
  }

  function handleNavigateToSong(songId){
    if (!songId) return
    navigate(`/song/${songId}`)
    setShowSuggestions(false)
  }

  function handleRandomSong(){
    const arr = items || []
    if (!arr.length) return
    const choice = arr[Math.floor(Math.random() * arr.length)]
    if (!choice) return
    const slug = choice.id || (choice.filename ? choice.filename.replace(/\.chordpro$/i, '') : '')
    if (!slug) return
    navigate(`/song/${slug}`)
  }

  function handleIcpSet(){
    navigate('/setlist?icp=1')
  }

  function handleThrowbackSongbook(){
    navigate('/songbook?tags=oldie,hymn')
  }

  function handleContribute(){
    try { window.open('https://github.com/rwm6857/GraceChords', '_blank') } catch {}
  }

  function findExactMatch(term){
    const q = term.trim().toLowerCase()
    if (!q) return null
    return items.find(s => String(s.title || '').toLowerCase() === q) || null
  }

  function handleSubmit(){
    const val = trimmed
    if (!val) {
      navigate('/songs')
      setShowSuggestions(false)
      return
    }
    const exact = findExactMatch(val)
    if (exact) {
      handleNavigateToSong(exact.id)
      return
    }
    navigate(`/songs?q=${encodeURIComponent(val)}`)
    setShowSuggestions(false)
  }

  function handleKeyDown(e){
    if (!showSuggestions || !suggestions.length) {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        handleNavigateToSong(suggestions[activeIndex].id)
      } else {
        handleSubmit()
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  function onBlur(){
    clearBlurTimer()
    blurTimer.current = setTimeout(() => setShowSuggestions(false), 120)
  }

  return (
    <div className="HomeDashboard">
      <Helmet>
        <title>GraceChords — Welcome</title>
        <meta name="description" content="Free, open-source worship tools for churches and worshippers. Browse songs, setlists, songbooks, and resources." />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="GraceChords — Welcome" />
        <meta property="og:description" content="Free, open-source worship tools for churches and worshippers." />
        <meta property="og:url" content={`${SITE_URL}/`} />
        <meta property="og:site_name" content="GraceChords" />
        <meta property="og:image" content={OG_IMAGE_URL} />
        <link rel="canonical" href={`${SITE_URL}/`} />
      </Helmet>

      <section
        className="home-hero"
        style={{
          minHeight: 270,
          maxHeight: 320,
          width: '100vw',
          maxWidth: '100vw',
          borderRadius: 0,
          margin: '0 calc(50% - 50vw)',
          padding: '24px 20px',
          backgroundImage: `url(${theme === 'light' ? heroLight : heroDark})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 78%'
        }}
      >
        <div
          aria-hidden="true"
          className="home-hero__overlay"
        />
          <div
            className="home-hero__content"
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 1040,
              margin: '0 auto'
            }}
          >
            <div style={{ maxWidth: 720, padding: '0 6px' }}>
              <h1 style={{ marginBottom: 4, fontSize: 'clamp(30px, 4.5vw, 44px)' }}>Welcome to GraceChords</h1>
              <p className="home-hero__subtitle" style={{ fontSize: '1.2rem', fontStyle: 'italic' }}>
                Free, open-source worship tools for churches and worshippers.
              </p>
            </div>
          <div className="home-hero__search-wrapper" style={{ maxWidth: 720, position: 'relative' }} ref={containerRef}>
            <div className="home-hero__input-wrap">
              <label
                htmlFor="home-search"
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: 'hidden',
                  clip: 'rect(0,0,0,0)',
                  whiteSpace: 'nowrap',
                  border: 0
                }}
              >
                Search worship songs
              </label>
              <input
                id="home-search"
                type="search"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={onBlur}
                onKeyDown={handleKeyDown}
                placeholder="Search songs by title, tag, or author…"
                aria-autocomplete="list"
                aria-expanded={showSuggestions && suggestions.length > 0}
                aria-controls="home-search-suggestions"
                aria-activedescendant={activeIndex >= 0 ? `home-sugg-${activeIndex}` : undefined}
                style={{
                  width: '100%',
                  padding: '14px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(148,163,184,0.5)',
                  background: 'rgba(17,24,39,0.85)',
                  color: '#f8fafc',
                  fontSize: '1rem',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.25)'
                }}
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul
                  id="home-search-suggestions"
                  role="listbox"
                  className="home-hero__suggestions"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'rgba(17,24,39,0.95)',
                    border: '1px solid rgba(148,163,184,0.5)',
                    borderRadius: '0 0 10px 10px',
                    boxShadow: '0 14px 32px rgba(0,0,0,0.32)',
                    overflow: 'hidden',
                    zIndex: 6
                  }}
                >
                  {suggestions.map((s, i) => (
                    <li
                      key={s.id}
                      id={`home-sugg-${i}`}
                      role="option"
                      aria-selected={i === activeIndex}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleNavigateToSong(s.id)}
                      onMouseEnter={() => setActiveIndex(i)}
                      style={{
                        padding: '10px 12px',
                        cursor: 'pointer',
                        background: i === activeIndex ? 'rgba(59,130,246,0.16)' : 'transparent',
                        color: '#e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      <span>{s.title}</span>
                      <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{s.originalKey || ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="home-hero__helper" style={{ marginTop: 10, fontSize: '0.95rem' }}>
              Search songs by title, tag, or author. Press Enter to browse or jump directly into a song.
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 24, marginBottom: 40 }}>
        <div className="container" style={{ padding: '0 12px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>Worship tools</h2>
          </div>
          <div
            style={{
              display: 'grid',
              gap: 16,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'
            }}
          >
            <QuickCard to="/songs" title="Song Library" desc="Browse our library for worship charts." />
            <QuickCard to="/setlist" title="Setlist Builder" desc="Create sets for service." />
            <QuickCard to="/songbook" title="Songbook Tool" desc="Build custom, printable songbooks." />
            <QuickCard to="/resources" title="Resources" desc="Guides and tips for worshippers." />
          </div>
        </div>
      </section>

      <section className="home-quick-actions" style={{ marginTop: 8, marginBottom: 40 }}>
        <div className="container" style={{ padding: '0 12px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>Quick actions</h2>
          </div>
          <div
            style={{
              display: 'grid',
              gap: 16,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'
            }}
          >
            <QuickCard title="Random Song" desc="Learn a new song today." onClick={handleRandomSong} />
            <QuickCard title="Create an InterCP Set" desc="For Camps, World Mission, and Vision School." onClick={handleIcpSet} />
            <QuickCard title="Make a Throwback Songbook" desc="Bring back the youth group nostalgia." onClick={handleThrowbackSongbook} />
            <QuickCard title="Contribute" desc="Download source code, suggest a feature, or report a bug." onClick={handleContribute} />
          </div>
        </div>
      </section>
    </div>
  )
}

function QuickCard({ to, title, desc, onClick }){
  const isLink = !!to
  const props = {
    className: 'card tool-card',
    onClick: onClick ? (e) => { e.preventDefault(); onClick() } : undefined
  }
  if (isLink) return (
    <Link to={to} {...props}>
      <div className="tool-card__head">
        <h3 className="tool-card__title">{title}</h3>
        <span aria-hidden="true" className="tool-card__chevron">→</span>
      </div>
      <p className="tool-card__desc">{desc}</p>
    </Link>
  )
  return (
    <button type="button" {...props} style={{ textAlign:'left' }}>
      <div className="tool-card__head">
        <h3 className="tool-card__title">{title}</h3>
        <span aria-hidden="true" className="tool-card__chevron">→</span>
      </div>
      <p className="tool-card__desc">{desc}</p>
    </button>
  )
}
