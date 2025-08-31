import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Fuse from 'fuse.js'
import { compareSongsByTitle, normalizeTitleForSort } from '../utils/sort'
import indexData from '../data/index.json'
import { KEYS } from '../utils/chordpro'
import SongCard from './ui/SongCard'

export default function Home(){
  const items = indexData?.items || []

  // -------- Search & filters --------
  const [q, setQ] = useState('')
  const searchRef = useRef(null)
  const resultsRef = useRef(null)
  const qLower = q.trim().toLowerCase()
  const allTags = useMemo(() => {
    const set = new Set()
    for (const s of items) (s.tags || []).forEach(t => set.add(t))
    return Array.from(set).sort((a,b)=> a.localeCompare(b))
  }, [items])

  const [selectedTags, setSelectedTags] = useState([]) // multi-select
  const [tagMode, setTagMode] = useState('any')        // 'any' | 'all'
  const [lyricsOn, setLyricsOn] = useState(false)

  // Lyrics cache (id -> lowercased source text) — used ONLY when lyricsOn is true
  const [lyricsCache, setLyricsCache] = useState({})
  const fetchingRef = useRef(new Set())

  // Build Fuse with tuned weights (title > tags > authors)
  const fuse = useMemo(() => new Fuse(items, {
    includeScore: true,
    threshold: 0.35,
    ignoreLocation: true,
    keys: [
      { name: 'title',  weight: 0.7 },
      { name: 'tags',   weight: 0.25 },
      { name: 'authors',weight: 0.15 }
    ]
  }), [items])

  function tagPass(s){
    if (!selectedTags.length) return true
    const tags = s.tags || []
    return tagMode === 'all'
      ? selectedTags.every(t => tags.includes(t))
      : selectedTags.some(t => tags.includes(t))
  }

  // Prefetch lyrics only when toggle is ON and there is a query
  useEffect(() => {
    if (!lyricsOn || qLower.length === 0) return
    const shouldFetch = items
      .filter(tagPass)
      .filter(s => !(s.id in lyricsCache) && !fetchingRef.current.has(s.id))
      .slice(0, 200)
    if (!shouldFetch.length) return

    let cancelled = false
    ;(async () => {
      const next = {}
      for (const s of shouldFetch) {
        try {
          fetchingRef.current.add(s.id)
          const txt = await fetch(`${import.meta.env.BASE_URL}songs/${s.filename}`).then(r => r.text())
          if (cancelled) return
          next[s.id] = (txt || '').toLowerCase()
        } catch {}
      }
      if (!cancelled && Object.keys(next).length) {
        setLyricsCache(prev => ({ ...prev, ...next }))
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lyricsOn, qLower, items, selectedTags.join(','), tagMode])

  // Compute results (Fuse + tag filter; optionally union lyrics matches ONLY when lyricsOn)
  const results = useMemo(() => {
    let scoreMap = new Map()
    let list

    if (qLower.length) {
      const rs = fuse.search(qLower)
      list = rs.map(r => {
        scoreMap.set(r.item.id, r.score ?? 0)
        return r.item
      })
    } else {
      list = items.slice().sort(compareSongsByTitle)
    }

    // Tag filter
    list = list.filter(tagPass)

    // Lyrics union strictly when toggle is ON
    if (lyricsOn && qLower.length) {
      const extra = items.filter(tagPass).filter(s => {
        const txt = lyricsCache[s.id]
        return typeof txt === 'string' ? txt.includes(qLower) : false
      })
      const byId = new Set(list.map(i => i.id))
      for (const s of extra) if (!byId.has(s.id)) list.push(s)
    }

    // Starts-with boost + stable ordering by score then title
    list.sort((a, b) => {
      const aSW = qLower && a.title.toLowerCase().startsWith(qLower) ? 1 : 0
      const bSW = qLower && b.title.toLowerCase().startsWith(qLower) ? 1 : 0
      if (aSW !== bSW) return bSW - aSW

      const as = scoreMap.has(a.id) ? scoreMap.get(a.id) : Number.POSITIVE_INFINITY
      const bs = scoreMap.has(b.id) ? scoreMap.get(b.id) : Number.POSITIVE_INFINITY
      if (as !== bs) return as - bs

      return compareSongsByTitle(a, b)
    })

    return list
  }, [items, fuse, qLower, lyricsOn, lyricsCache, selectedTags.join(','), tagMode])

  const [activeIndex, setActiveIndex] = useState(-1)
  const optionRefs = useRef([])
  const resetRef = useRef(false)

  function onSearchKeyDown(e){
    if(e.key === 'Enter'){
      e.preventDefault()
      const c = resultsRef.current
      if(!c) return
      const containerRect = c.getBoundingClientRect()
      const links = c.querySelectorAll('a')
      for(const link of links){
        const rect = link.getBoundingClientRect()
        if(rect.bottom > containerRect.top && rect.top < containerRect.bottom){
          link.click()
          break
        }
      }
    } else if(e.key === 'Escape') {
      e.preventDefault()
      setQ('')
      searchRef.current?.focus()
    } else if(e.key === 'ArrowDown') {
      e.preventDefault()
      if(results.length === 0) return
      if (activeIndex === 0) {
        optionRefs.current[0]?.focus()
      } else {
        setActiveIndex(0)
      }
    } else if(e.key === 'ArrowUp') {
      e.preventDefault()
      if(results.length === 0) return
      const last = results.length - 1
      setActiveIndex(last)
    }
  }

  function onResultsKeyDown(e){
    if(e.key === 'ArrowDown'){
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, results.length - 1))
    } else if(e.key === 'ArrowUp'){
      e.preventDefault()
      setActiveIndex(i => {
        if(i <= 0){
          searchRef.current?.focus()
          return -1
        }
        return i - 1
      })
    }
  }

  useEffect(() => {
    if (activeIndex >= 0) {
      if (resetRef.current) {
        resetRef.current = false
      } else {
        optionRefs.current[activeIndex]?.focus()
      }
    }
  }, [activeIndex])

  useEffect(() => {
    if (results.length > 0) {
      setActiveIndex(0)
      resetRef.current = true
    } else {
      setActiveIndex(-1)
    }
  }, [results])

  useEffect(() => {
    function onKeyDown(e){
      if(e.key === '/' && document.activeElement !== searchRef.current){
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    searchRef.current?.focus()
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // UI helpers
  function toggleTag(t){
    setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x!==t) : [...prev, t])
  }
  function clearTags(){ setSelectedTags([]) }

  optionRefs.current = []

  // ---- Hidden Admin reveal (triple-click title or Alt+Shift+A) ----
  const [showAdmin, setShowAdmin] = useState(() => {
    try { return localStorage.getItem('adminReveal') === '1' } catch { return false }
  })
  const clickRef = useRef({ n: 0, t: 0 })
  function maybeRevealAdmin(){
    const now = Date.now()
    const d = clickRef.current
    if (now - d.t > 1800) { d.n = 0 } // reset window after 1.8s
    d.t = now
    d.n += 1
    if (d.n >= 3) {
      setShowAdmin(true)
      try { localStorage.setItem('adminReveal', '1') } catch {}
      d.n = 0
    }
  }
  useEffect(() => {
    function onKey(e){
      if ((e.key === 'A' || e.key === 'a') && (e.altKey && e.shiftKey)){
        setShowAdmin(true)
        try { localStorage.setItem('adminReveal', '1') } catch {}
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="HomePage">
      <div className="HomeHeader">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:12}}>
          <h1 onClick={maybeRevealAdmin} title="GraceChords">GraceChords</h1>
          {showAdmin && (
            <Link to="/admin" className="Small" style={{ textDecoration:'none', opacity:0.75 }}>
              Admin
            </Link>
          )}
        </div>

        <div className="card" style={{display:'grid', gap:10}}>
          <label htmlFor="search">Search</label>
          <div className="row" style={{gap:8, alignItems:'center'}}>
            <input
              id="search"
              ref={searchRef}
              value={q}
              onChange={e=> setQ(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Search title/tags/authors…"
              aria-label="Search songs"
              style={{flex:1}}
            />
            <label className="row" style={{gap:8, alignItems:'center'}}>
              <input
                type="checkbox"
                checked={lyricsOn}
                onChange={e=> setLyricsOn(e.target.checked)}
              />
              <span className="meta" title="Search within song texts (fetched on demand)">Lyrics contain</span>
            </label>
          </div>

          <div className="row">
            {/* Tags: multi-select + Any/All */}
            <div className="tagbar">
              <button className={`badge ${selectedTags.length===0 ? 'active':''}`} onClick={clearTags}>All</button>
              {allTags.map(t => (
                <button
                  key={t}
                  className={`badge ${selectedTags.includes(t) ? 'active':''}`}
                  onClick={()=> toggleTag(t)}
                >{t}</button>
              ))}
            </div>
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <span className="meta">Match</span>
              <button
                className={`btn ${tagMode==='any' ? 'primary':''}`}
                onClick={()=> setTagMode('any')}
                title="Match songs with any selected tag"
              >Any</button>
              <button
                className={`btn ${tagMode==='all' ? 'primary':''}`}
                onClick={()=> setTagMode('all')}
                title="Match songs with all selected tags"
              >All</button>
            </div>
          </div>
        </div>
      </div>

      {/* Results list */}
      <div
        className="HomeResults"
        role="region"
        ref={resultsRef}
        onKeyDown={onResultsKeyDown}
      >
        {!fuse ? <div>Loading search…</div> : (
          <div className="HomeGrid" role="listbox" aria-label="Song results">
            {results.map((s, i) => (
              <SongCard
                as={Link}
                key={s.id}
                to={`/song/${s.id}`}
                role="option"
                ref={el => (optionRefs.current[i] = el)}
                tabIndex={i === activeIndex ? 0 : -1}
                aria-selected={i === activeIndex}
                className={i === activeIndex ? 'active' : ''}
                title={s.title}
                subtitle={`${s.originalKey || '—'}${s.tags?.length ? ` • ${s.tags.join(', ')}` : ''}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
