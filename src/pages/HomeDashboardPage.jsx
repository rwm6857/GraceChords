import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import heroDarkPng from '../assets/dashboard-hero-worship-angled.png'
import heroLightPng from '../assets/dashboard-hero-worship-angled-light.png'
import heroDarkWebp from '../assets/dashboard-hero-worship-angled.webp'
import heroDarkWebp1200 from '../assets/dashboard-hero-worship-angled-1200.webp'
import heroDarkWebp960 from '../assets/dashboard-hero-worship-angled-960.webp'
import heroDarkWebp768 from '../assets/dashboard-hero-worship-angled-768.webp'
import heroLightWebp from '../assets/dashboard-hero-worship-angled-light.webp'
import heroLightWebp1200 from '../assets/dashboard-hero-worship-angled-light-1200.webp'
import heroLightWebp960 from '../assets/dashboard-hero-worship-angled-light-960.webp'
import heroLightWebp768 from '../assets/dashboard-hero-worship-angled-light-768.webp'
import heroLightWebp640 from '../assets/dashboard-hero-worship-angled-light-640.webp'
import { currentTheme } from '../utils/app/theme'
import { filterByTag, pickRandom } from '../utils/songs/quickActions'
import { isIncompleteSong } from '../utils/songs/songStatus'
import { buildTagMap, canonicalizeTags } from '../utils/songs/tags'
import {
  buildSongCatalog,
  hasGroupLanguage,
  resolveGroupEntry,
  resolveInitialSongLanguage,
} from '../utils/songs/songCatalog'

const SITE_URL = 'https://gracechords.com'
const OG_IMAGE_URL = `${SITE_URL}/favicon.ico`
const MAX_SUGGESTIONS = 5

export default function HomeDashboard(){
  const navigate = useNavigate()
  const [songLanguage] = useState(() => resolveInitialSongLanguage())
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef(null)
  const blurTimer = useRef(null)
  const [theme, setTheme] = useState(() => currentTheme())
  const [latestSongs, setLatestSongs] = useState([])
  const [latestPosts, setLatestPosts] = useState([])
  const [listsReady, setListsReady] = useState(false)

  const trimmed = query.trim()
  const suggestions = useMemo(() => {
    if (!trimmed) return []
    const q = trimmed.toLowerCase()
    const scored = []
    for (const s of items) {
      const title = (s.title || '').toLowerCase()
      const altTitles = (s.searchTitles || []).map((t) => String(t).toLowerCase())
      const tags = (s.tags || []).map(t => String(t).toLowerCase())
      const authors = (s.authors || []).map(a => String(a).toLowerCase())
      const haystack = [title, ...altTitles, ...tags, ...authors].join(' ')
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

  function sectionCount(song){
    if (Array.isArray(song?.sections)) return song.sections.length
    if (typeof song?.sectionCount === 'number') return song.sectionCount
    return 0
  }

  // Quick action definitions (one picked per load for each type)
  const songViewQuickActions = useMemo(() => ([
    {
      id: 'songOfDay',
      title: 'Song of the Day',
      desc: 'Join others in daily worship.',
      pickSong: (songs) => {
        if (!songs.length) return null
        const seed = Number(new Date().toISOString().slice(0,10).replace(/-/g,'')) || 0
        return songs[seed % songs.length] || null
      }
    },
    {
      id: 'quietTime',
      title: 'Quiet Time',
      desc: 'Start the day with word and worship.',
      pickSong: (songs) => {
        const slow = filterByTag(songs, 'SLOW')
        const shortSlow = slow.filter((s) => sectionCount(s) <= 3)
        const pool = shortSlow.length ? shortSlow : (slow.length ? slow : songs)
        return pickRandom(pool)
      }
    },
    {
      id: 'highEnergy',
      title: 'High Energy Hit',
      desc: 'Lift up a shout of praise!',
      pickSong: (songs) => {
        const fast = filterByTag(songs, 'FAST')
        const pool = fast.length ? fast : songs
        return pickRandom(pool)
      }
    }
  ]), [])

  const setlistQuickActions = useMemo(() => ([
    { id: 'celebrationSet', title: 'Celebration Set', desc: 'End with praise that shakes the earth!' },
    { id: 'threeSongFlow', title: 'Build a 3-Song Flow', desc: 'Let the Spirit lead.' },
    { id: 'randomThemeSet', title: 'Random Theme Set', desc: "Cross? Missions? Commitment? Let's see..." }
  ]), [])

  const songbookQuickActions = useMemo(() => ([
    { id: 'random10SongCollection', title: 'Random 10-Song Collection', desc: 'Surprise me!' },
    { id: 'sendMeSongbook', title: '"Send Me" Songbook', desc: 'Make a missions theme\'d song book.' },
    { id: 'graceChordsSongbook', title: 'GraceChords Songbook', desc: 'Our entire library in one printable book.' }
  ]), [])

  const [songAction] = useState(() => pickRandom(songViewQuickActions))
  const [setlistAction] = useState(() => pickRandom(setlistQuickActions))
  const [songbookAction] = useState(() => pickRandom(songbookQuickActions))
  const heroImgPng = theme === 'light' ? heroLightPng : heroDarkPng
  const heroSrcSet = theme === 'light'
    ? [
        `${heroLightWebp640} 640w`,
        `${heroLightWebp768} 768w`,
        `${heroLightWebp960} 960w`,
        `${heroLightWebp1200} 1200w`,
        `${heroLightWebp} 1318w`,
      ].join(', ')
    : [
        `${heroDarkWebp768} 768w`,
        `${heroDarkWebp960} 960w`,
        `${heroDarkWebp1200} 1200w`,
        `${heroDarkWebp} 1318w`,
      ].join(', ')

  function handleSongAction(){
    if (!songAction) return
    const song = songAction.pickSong(items || [])
    if (!song) return
    const slug = song.id || (song.filename ? song.filename.replace(/\.chordpro$/i, '') : '')
    if (!slug) return
    navigate(`/song/${slug}`)
  }

  function handleSetlistAction(){
    if (!setlistAction) return
    navigate('/setlist', { state: { quickAction: setlistAction.id } })
  }

  function handleSongbookAction(){
    if (!songbookAction) return
    navigate('/songbook', { state: { quickAction: songbookAction.id } })
  }

  function handleContribute(){
    try { window.open('https://github.com/rwm6857/GraceChords', '_blank', 'noopener,noreferrer') } catch {}
  }

  function findExactMatch(term){
    const q = term.trim().toLowerCase()
    if (!q) return null
    return items.find((s) =>
      String(s.title || '').toLowerCase() === q ||
      (s.searchTitles || []).some((t) => String(t || '').toLowerCase() === q)
    ) || null
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

  // Defer heavier work (JSON parsing, sorting, observer) until idle to keep LCP quick
  // Defer heavy data prep and observers so first paint/LCP can happen quickly
  useEffect(() => {
    const idle = window.requestIdleCallback || ((cb) => setTimeout(() => cb(), 1))
    const cancel = window.cancelIdleCallback || clearTimeout
    let observer = null
    const idleId = idle(async () => {
      try {
        const [{ default: indexJson }, { default: resourcesJson }] = await Promise.all([
          import('../data/index.json'),
          import('../data/resources.json'),
        ])
        const indexItems = indexJson?.items || []
        const catalog = buildSongCatalog(indexItems)
        const prefLang = resolveInitialSongLanguage(
          catalog.translationLanguages?.length ? catalog.translationLanguages : catalog.allLanguages,
          songLanguage
        )
        const displayItems = []
        for (const group of catalog.groups || []) {
          let display = resolveGroupEntry(group, prefLang)
          if (!display) continue
          if (isIncompleteSong(display)) {
            const fallback = group.variants.find((v) => !isIncompleteSong(v))
            if (!fallback) continue
            display = fallback
          }
          displayItems.push({
            ...display,
            hasSelectedLanguage: hasGroupLanguage(group, prefLang),
            searchTitles: group.variants.map((v) => v.title || '').filter(Boolean),
            searchAuthors: Array.from(new Set(group.variants.flatMap((v) => v.authors || []))),
            searchTags: Array.from(new Set(group.variants.flatMap((v) => v.tags || []))),
          })
        }

        const tagMap = buildTagMap(displayItems)
        const normalizeSong = (song) => {
          const { keys, labels } = canonicalizeTags(song.tags || [], tagMap)
          return { ...song, tags: labels, tagKeys: keys }
        }
        const normalizedItems = displayItems.map(normalizeSong)

        setItems(normalizedItems)
        const songsSorted = normalizedItems
          .map((s) => {
            const addedRaw = s.addedAt || s.added
            const addedMs = addedRaw ? Date.parse(addedRaw) : 0
            return { ...s, addedMs }
          })
          .filter(s => !isIncompleteSong(s))
          .sort((a, b) => (b.addedMs || 0) - (a.addedMs || 0))
          .slice(0, 6)
        setLatestSongs(songsSorted)
        const postsSorted = (resourcesJson?.items || [])
          .map(p => ({ ...p, dateMs: parseDateMs(p.date) }))
          .sort((a, b) => (b.dateMs || 0) - (a.dateMs || 0))
          .slice(0, 3)
        setLatestPosts(postsSorted)
        setListsReady(true)
      } catch {
        setListsReady(true)
      }
      // Theme observer can wait until after paint
      const el = document.documentElement
      observer = new MutationObserver(() => setTheme(currentTheme()))
      observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
    })
    return () => {
      cancel(idleId)
      if (observer) observer.disconnect()
    }
  }, [songLanguage])

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
          padding: '24px 20px'
        }}
      >
        {/* Inline picture keeps hero discoverable for LCP/PSI and lets webp be chosen without extra PNG fetch */}
        <picture className="home-hero__bg" aria-hidden="true">
          {/* Multiple WebP sizes to avoid "image larger than necessary" and improve mobile LCP */}
          <source
            type="image/webp"
            srcSet={heroSrcSet}
            sizes="100vw"
          />
          <img
            src={heroImgPng}
            alt=""
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        </picture>
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
            <h2 className="home-section-title" style={{ margin: 0 }}>Quick actions</h2>
          </div>
          <div
            className="home-quick-actions__grid"
            style={{
              display: 'grid',
              gap: 16,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'
            }}
          >
            {songAction ? <QuickCard title={songAction.title} desc={songAction.desc} onClick={handleSongAction} /> : null}
            {setlistAction ? <QuickCard title={setlistAction.title} desc={setlistAction.desc} onClick={handleSetlistAction} /> : null}
            {songbookAction ? <QuickCard title={songbookAction.title} desc={songbookAction.desc} onClick={handleSongbookAction} /> : null}
            <QuickCard title="Contribute" desc="Download source code, suggest a feature, or report a bug." onClick={handleContribute} />
          </div>
        </div>
      </section>

      <section className="home-latest" style={{ marginTop: 8, marginBottom: 40 }}>
        <div className="container" style={{ padding: '0 12px' }}>
          <div className="home-latest__grid">
            <div className="home-latest__col">
              <div className="home-latest__header">
                <h3>Latest Songs</h3>
              </div>
              <div className="home-latest__list">
                {!listsReady ? (
                  <SongMiniSkeleton count={6} />
                ) : latestSongs.length ? latestSongs.map(song => (
                  <SongMiniCard key={song.id} song={song} />
                )) : <p className="Small" style={{ opacity: 0.8 }}>No songs yet.</p>}
              </div>
            </div>
            <div className="home-latest__col home-latest__col--posts">
              <div className="home-latest__header">
                <h3>Latest Posts</h3>
              </div>
              <div className="home-latest__posts">
                {!listsReady ? (
                  <PostMiniSkeleton count={3} />
                ) : latestPosts.length ? latestPosts.map(post => (
                  <PostMiniCard key={post.slug} post={post} />
                )) : <p className="Small" style={{ opacity: 0.8 }}>No posts yet.</p>}
              </div>
            </div>
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

function SongMiniCard({ song }){
  const tags = song.tags || []
  const shownTags = tags.slice(0, 4)
  const extra = tags.length - shownTags.length
  const author = Array.isArray(song.authors) ? song.authors[0] : ''
  const key = song.originalKey ? ` (${song.originalKey})` : ''
  return (
    <Link to={`/song/${song.id}`} className="home-mini-card tool-card">
      <div className="home-mini-card__title">
        <strong>{song.title}{key}</strong>
        {author ? <span className="home-mini-card__by"> by <span className="gc-emphasis">{author}</span></span> : null}
      </div>
      <div className="home-mini-card__tags">
        {shownTags.map(t => (
          <span key={t} className="gc-tag gc-tag--gray Small">{t}</span>
        ))}
        {extra > 0 ? <span className="gc-tag gc-tag--gray Small">+{extra}</span> : null}
      </div>
    </Link>
  )
}

function PostMiniCard({ post }){
  const summary = post.summary || ''
  return (
    <Link to={`/resources/${post.slug}`} className="home-post-card tool-card">
      <div className="home-post-card__title">{post.title}</div>
      <p className="home-post-card__summary line-clamp-3">{summary}</p>
    </Link>
  )
}

function SongMiniSkeleton({ count = 4 }){
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="home-mini-card tool-card" aria-hidden="true" style={{ opacity:0.6 }}>
          <div className="skeleton-line" style={{ width:'70%', height:16 }} />
          <div className="skeleton-line" style={{ width:'40%', height:14, marginTop:8 }} />
        </div>
      ))}
    </>
  )
}

function PostMiniSkeleton({ count = 2 }){
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="home-post-card tool-card" aria-hidden="true" style={{ opacity:0.6 }}>
          <div className="skeleton-line" style={{ width:'80%', height:16 }} />
          <div className="skeleton-line" style={{ width:'90%', height:14, marginTop:8 }} />
          <div className="skeleton-line" style={{ width:'60%', height:14, marginTop:6 }} />
        </div>
      ))}
    </>
  )
}

function parseDateMs(val){
  if (!val) return 0
  const t = Date.parse(val)
  return Number.isNaN(t) ? 0 : t
}
