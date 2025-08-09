import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Fuse from 'fuse.js'
import indexData from '../data/index.json'
import { KEYS } from '../utils/chordpro'
import { SelectAllIcon, ClearIcon, SetlistIcon } from './Icons'

export default function Home(){
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState({})

  useEffect(()=>{
    setItems((indexData?.items||[]).map(it=> ({...it, toKey: it.originalKey || 'C'})))
    try{ const raw = localStorage.getItem('bundleSelection'); if(raw){ setSelected(JSON.parse(raw)) } }catch{}
  },[])

  useEffect(()=>{ try{ localStorage.setItem('bundleSelection', JSON.stringify(selected)) }catch{} }, [selected])

  const allTags = useMemo(()=>{
    const t = new Set(); for(const it of items){ (it.tags||[]).forEach(x=> t.add(x)) } return Array.from(t).sort()
  },[items])

  const fuse = useMemo(()=> new Fuse(items, { keys: ['title','tags'], threshold: 0.4 }), [items])
  const results = useMemo(()=>{
    let list = q ? fuse.search(q).map(r=> r.item) : items.slice().sort((a,b)=> a.title.localeCompare(b.title))
    if(tagFilter) list = list.filter(it=> (it.tags||[]).includes(tagFilter))
    return list
  },[q, fuse, items, tagFilter])

  function toggle(id, toKey){
    setSelected(prev=>{
      const next = {...prev}; if(next[id]) delete next[id]; else next[id] = { toKey: toKey || (items.find(x=>x.id===id)?.originalKey || 'C') }; return next
    })
  }
  function selectAllFiltered(list){
    const next = {}; for(const it of list){ next[it.id] = { toKey: it.originalKey || 'C' } }
    try{ localStorage.setItem('bundleSelection', JSON.stringify(next)) }catch{}
    setSelected(next)
  }
  function clearSelection(){
    try{ localStorage.removeItem('bundleSelection') }catch{}
    setSelected({})
  }

  return (
    <div className="container">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h1>GraceChords</h1>
        <Link to='/setlist' className='btn iconbtn'><SetlistIcon /> Setlist</Link>
      </div>

      <div className="card" style={{display:'grid', gap:10}}>
        <input value={q} onChange={e=> setQ(e.target.value)} placeholder="Search by title or tag..." />
        <div className="row">
          <div className="tagbar">
            <button className={`badge ${tagFilter===''? 'active':''}`} onClick={()=> setTagFilter('')}>All</button>
            {allTags.map(t=> <button key={t} className="badge" onClick={()=> setTagFilter(t)}>{t}</button>)}
          </div>
          <div style={{display:'flex', gap:8}}>
            <button className="btn" onClick={()=> selectAllFiltered(results)}><SelectAllIcon /> Select All</button>
            <button className="btn" onClick={clearSelection}><ClearIcon /> Clear</button>
            {Object.keys(selected).length>0 && <button className="btn primary" onClick={()=>{ try{ localStorage.setItem('bundleSelection', JSON.stringify(selected)) }catch{}; navigate('/bundle') }}>Download PDF ({Object.keys(selected).length})</button>}
          </div>
        </div>
      </div>

      <div className="grid">
        {results.map(it=> (
          <div key={it.id} className="card">
            <div className="row">
              <div>
                <Link to={`/song/${it.id}`} style={{fontWeight:600}}>{it.title}</Link>
                <div className="meta">{it.originalKey || ''}{it.tags?.length ? ` • ${it.tags.join(', ')}` : ''}</div>
              </div>
              <div style={{display:'flex', gap:8, alignItems:'center'}}>
                <select value={(selected[it.id]?.toKey) || it.originalKey || 'C'} onChange={(e)=> setSelected(prev=> ({...prev, [it.id]: { toKey: e.target.value }}))}>
                  {KEYS.map(k=> <option key={k} value={k}>{k}</option>)}
                </select>
                <button className="btn" onClick={()=> toggle(it.id, it.originalKey)}>{selected[it.id] ? 'Remove' : 'Select'}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
