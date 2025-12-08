import React, { useEffect, useMemo, useState } from 'react'
import resourcesData from '../data/resources.json'
import { Link } from 'react-router-dom'
import Fuse from 'fuse.js'
import { stripMarkdown } from '../utils/markdown'

export default function Resources(){
  const items = useMemo(() => (resourcesData?.items || []).slice().sort((a,b)=> (b.date||'').localeCompare(a.date||'')), [])
  const allTags = useMemo(() => {
    const s = new Set()
    for(const it of items){ (it.tags||[]).forEach(t => s.add(String(t))) }
    return Array.from(s).sort((a,b)=> a.localeCompare(b))
  }, [items])
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')

  const fuse = useMemo(() => new Fuse(items, { keys: ['title','summary'], threshold: 0.35 }), [items])
  const [contentMap, setContentMap] = useState({})

  useEffect(() => {
    if (!q || Object.keys(contentMap).length) return
    // Lazy load content for content-search
    ;(async () => {
      const next = {}
      for(const it of items){
        try {
          const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/,'') + '/'
          const res = await fetch(`${base}resources/${it.slug}.md`)
          const txt = await res.text()
          const body = txt.replace(/^---[\s\S]*?---\n?/,'')
          next[it.slug] = stripMarkdown(body)
        } catch {}
      }
      setContentMap(next)
    })()
  }, [q, items, contentMap])

  const filtered = useMemo(() => {
    let base = q ? fuse.search(q).map(r=> r.item) : items
    // Content search if title/summary miss
    if (q && base.length === 0 && Object.keys(contentMap).length){
      const qq = q.toLowerCase()
      base = items.filter(it => (contentMap[it.slug] || '').toLowerCase().includes(qq))
    }
    if (tag) base = base.filter(it => (it.tags||[]).includes(tag))
    return base
  }, [q, tag, fuse, items, contentMap])

  return (
    <div className="HomePage">
      <div className="HomeHeader">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:12}}>
          <h1>Resources</h1>
        </div>
        <div className="card" style={{display:'grid', gap:10}}>
          <input
            placeholder="Search resources..."
            value={q}
            onChange={e=> setQ(e.target.value)}
            aria-label="Search resources"
            style={{ minWidth:0, fontSize:16 }}
          />
          <div className="row" style={{gap:8, alignItems:'center'}}>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <TagChip label="All" active={!tag} onClick={()=> setTag('')} />
              {allTags.map(t => (
                <TagChip key={t} label={t} active={tag===t} onClick={()=> setTag(t)} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="HomeResults" role="region" aria-label="Resource results">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:12, marginTop:12 }}>
          {filtered.map(it => (
            <article key={it.slug} className="gc-card" style={{ flexDirection:'column', gap:8 }}>
              <h3 className="gc-card__title" style={{ margin:'4px 0' }}>
                <Link to={`/resources/${it.slug}`}>{it.title}</Link>
              </h3>
              <div className="gc-card__meta Small" style={{ opacity: 0.8 }}>
                by {it.author} • {fmtDate(it.date)}
              </div>
              {it.tags?.length ? (
                <div className="gc-card__tags Small" style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {it.tags.map(t => <span key={t} className="gc-tag gc-tag--gray">{t}</span>)}
                </div>
              ) : null}
              {it.summary ? <p style={{ margin:'4px 0 0 0' }}>{it.summary}</p> : null}
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

function TagChip({ label, active, onClick }){
  return (
    <button className={`gc-tag ${active ? 'gc-tag--blue' : 'gc-tag--gray'}`} onClick={onClick}>{label}</button>
  )
}

function fmtDate(s){
  try { return new Date(s).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }) } catch { return s }
}
