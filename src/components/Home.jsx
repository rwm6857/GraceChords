import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Fuse from 'fuse.js'
import indexData from '../data/index.json'
import { KEYS } from '../utils/chordpro'
import { DownloadIcon } from './Icons' // if you show a bundle export button here; optional

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

  // Lyrics cache (id -> lowercased source text)
  const [lyricsCache, setLyricsCache] = useState({})
  const fetchingRef = useRef(new Set()) // prevent duplicate fetches

  // Build Fuse with tuned weights
  const fuse = useMemo(() => {
    return new Fuse(items, {
      includeScore: true,
      threshold: 0.35,
      ignoreLocation: true,
      keys: [
        { name: 'title',  weight: 0.7 },
        { name: 'tags',   weight: 0.25 },
        { name: 'authors',weight: 0.15 }
      ]
    })
  }, [items])

  // Prefetch lyrics lazily when "lyrics contains" is on and a query exists
  useEffect(() => {
    if (!lyricsOn || qLower.length === 0) return
    // Prefetch for all songs that match tag filter (bounded by practical catalog size)
    const shouldFetch = items
      .filter(tagPass)
      .filter(s => !(s.id in lyricsCache) && !fetchingRef.current.has(s.id))
      .slice(0, 200) // safety bound
    if (shouldFetch.length === 0) return

    let cancelled = false
    ;(async () => {
      const next = {}
      for (const s of shouldFetch) {
        try {
          fetchingRef.current.add(s.id)
          const txt = await fetch(`${import.meta.env.BASE_URL}songs/${s.filename}`).then(r => r.text())
          if (cancelled) return
          next[s.id] = (txt || '').toLowerCase()
        } catch { /* noop */ }
      }
      if (!cancelled && Object.keys(next).length) {
        setLyricsCache(prev => ({ ...prev, ...next }))
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lyricsOn, qLower, items, selectedTags.join(','), tagMode])

  function tagPass(s){
    if (!selectedTags.length) return true
    const tags = s.tags || []
    return tagMode === 'all'
      ? selectedTags.every(t => tags.includes(t))
      : selectedTags.some(t => tags.includes(t))
  }

  // Compute results (Fuse + tag filter + optional lyrics union + starts-with boost)
  const results = useMemo(() => {
    let scoreMap = new Map()
    let list = items

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

    // Lyrics contains union
    if (lyricsOn && qLower.length) {
      const extra = items.filter(tagPass).filter(s => {
        const txt = lyricsCache[s.id]
        return typeof txt === 'string' ? txt.includes(qLower) : false
      })
      const byId = new Map(list.map(i => [i.id, true]))
      for (const s of extra) if (!byId.has(s.id)) list.push(s)
    }

    // Starts-with boost + stable sort by fuse score and fallback by title
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, fuse, qLower, lyricsOn, lyricsCache, selectedTags.join(','), tagMode])

  // -------- Selection for bundle/export (kept simple) --------
  const [selected, setSelected] = useState({}) // {id: { toKey }}
  function isSelected(id){ return !!selected[id] }
  function toggleSelect(s){
    setSelected(prev => isSelected(s.id)
      ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== String(s.id)))
      : { ...prev, [s.id]: { toKey: s.originalKey || 'C' } }
    )
  }
  function setKeyFor(id, key){
    setSelected(prev => ({ ...prev, [id]: { ...(prev[id]||{}), toKey: key } }))
  }
  function selectAll(){ // TODO: map to your store if you already manage selection elsewhere
    const next = {}
    for (const s of results) next[s.id] = { toKey: s.originalKey || 'C' }
    setSelected(next)
  }
  function clearAll(){ setSelected({}) } // TODO: map to your store if needed

  // -------- UI helpers --------
  function toggleTag(t){
    setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x!==t) : [...prev, t])
  }
  function clearTags(){ setSelectedTags([]) }

  return (
    <div className="container">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h1>GraceChords</h1>
        <Link to="/setlist" className="btn iconbtn"><DownloadIcon /> Setlist</Link>
      </div>

      <div className="card" style={{display:'grid', gap:10}}>
        {/* Accessible search label so tests can find it */}
        <label htmlFor="search">Search</label>
        <div className="row" style={{gap:8, alignItems:'center'}}>
          <input
            id="search"
            value={q}
            onChange={e=> setQ(e.target.value)}
            placeholder="Search title/tags…"
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
          {/* Tag bar: multi-select + Any/All */}
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

            <button className="btn" onClick={selectAll}>Select All</button>
            <button className="btn" onClick={clearAll}>Clear</button>
          </div>
        </div>
      </div>

      {/* Results grid */}
      <div className="grid" style={{marginTop:10}}>
        {results.map(s => {
          const sel = selected[s.id]
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
                <div style={{display:'flex', gap:8, alignItems:'center'}}>
                  <select
                    value={sel?.toKey || s.originalKey || 'C'}
                    onChange={e => setKeyFor(s.id, e.target.value)}
                  >
                    {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <button className="btn" onClick={()=> toggleSelect(s)}>
                    {isSelected(s.id) ? 'Unselect' : 'Select'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
