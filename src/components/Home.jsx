import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Fuse from 'fuse.js'
import indexData from '../data/index.json'
import { KEYS } from '../utils/chordpro'

export default function Home(){
  const items = indexData?.items || []

  // -------- Search & filters --------
  const [q, setQ] = useState('')
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
      list = items.slice().sort((a,b) => a.title.localeCompare(b.title))
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

      return a.title.localeCompare(b.title)
    })

    return list
  }, [items, fuse, qLower, lyricsOn, lyricsCache, selectedTags.join(','), tagMode])


  // UI helpers
  function toggleTag(t){
    setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x!==t) : [...prev, t])
  }
  function clearTags(){ setSelectedTags([]) }

  return (
    <div className="container">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h1>GraceChords</h1>
        {/* Removed redundant Setlist link (NavBar already has it) */}
      </div>

      <div className="card" style={{display:'grid', gap:10}}>
        <label htmlFor="search">Search</label>
        <div className="row" style={{gap:8, alignItems:'center'}}>
          <input
            id="search"
            value={q}
            onChange={e=> setQ(e.target.value)}
            placeholder="Search title/tags/authors…"
            style={{flex:1}}
          />
          <label className="row" style={{gap:8, alignItems:'center'}}>
            <input
              type="checkbox"
              checked={lyricsOn}
              onChange={e=> setLyricsOn(e.target.checked)}
            />
            <span className="meta">Lyrics contains</span>
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

      {/* Results grid (directory only) */}
      <div className="grid" style={{marginTop:10}}>
        {results.map(s => {
          return (
            <div key={s.id} className="card">
              <div className="row">
                <div>
                  <Link to={`/song/${s.id}`} style={{fontWeight:600}}>{s.title}</Link>
                  <div className="meta">
                    {s.originalKey || '—'}
                    {s.tags?.length ? ` • ${s.tags.join(', ')}` : ''}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
