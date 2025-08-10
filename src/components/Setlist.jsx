import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Fuse from 'fuse.js'
import indexData from '../data/index.json'
import { KEYS } from '../utils/chordpro'
import { ArrowUp, ArrowDown, RemoveIcon, DownloadIcon } from './Icons'
import { parseChordPro, stepsBetween, transposeSym } from '../utils/chordpro'
import { downloadMultiSongPdf } from '../utils/pdf'

// NEW: named set utilities
import { listSets, getSet, saveSet, deleteSet, duplicateSet, newEmptySet } from '../utils/sets'

export default function Setlist(){
  // --- existing state ---
  const [name, setName] = useState('Untitled Set')
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [list, setList] = useState([])

  // NEW: saved sets state
  const [currentId, setCurrentId] = useState(null)
  const [savedSets, setSavedSets] = useState(() => listSets())
  const [selectedId, setSelectedId] = useState('')

  // Load catalog
  useEffect(()=>{ setItems(indexData?.items || []) },[])

  // One-time migration from legacy single-set storage (optional, safe)
  useEffect(() => {
    try {
      const legacy = localStorage.getItem('setlist')
      if (!legacy) return
      const s = JSON.parse(legacy)
      const already = listSets()
      if (already.length === 0 && (s?.name || (s?.list?.length || 0) > 0)) {
        const saved = saveSet({ name: s.name || 'Imported Set', items: s.list || [] })
        setSavedSets(listSets())
        setCurrentId(saved.id)
        setName(saved.name)
        setList(saved.items || [])
        setSelectedId(saved.id)
      }
    } catch {}
  }, [])

  // Search
  const fuse = useMemo(()=> new Fuse(items, { keys: ['title','tags'], threshold:0.4 }), [items])
  const results = useMemo(
    ()=> q ? fuse.search(q).map(r=> r.item) : items.slice().sort((a,b)=> a.title.localeCompare(b.title)),
    [q, fuse, items]
  )

  // Mutators for current list
  function addSong(s){ if(list.find(x=> x.id===s.id)) return; setList([...list, { id: s.id, toKey: s.originalKey || 'C' }]) }
  function removeSong(id){ setList(list.filter(x=> x.id!==id)) }
  function move(id, dir){
    const i = list.findIndex(x=> x.id===id); if(i<0) return
    const j = i + (dir==='up'?-1:1); if(j<0||j>=list.length) return
    const copy = list.slice(); const [item] = copy.splice(i,1); copy.splice(j,0,item); setList(copy)
  }
  function changeKey(id, val){ setList(list.map(x=> x.id===id ? { ...x, toKey: val } : x)) }

  // ---- Named set helpers ----
  function refreshSaved(idToSelect){
    setSavedSets(listSets())
    if (idToSelect !== undefined) setSelectedId(idToSelect || '')
  }

  function onNew(){
    setCurrentId(null)
    setName('Untitled Set')
    setList([])
    setSelectedId('')
  }

  function onSave(){
    const finalName = (name?.trim() || 'Untitled Set')
    const saved = saveSet({ id: currentId, name: finalName, items: list })
    setName(saved.name)
    setCurrentId(saved.id)
    refreshSaved(saved.id)
  }

  function onSaveAs(){
    const proposed = `Copy of ${name || 'Untitled Set'}`
    const input = window.prompt('Save as…', proposed)
    if (!input) return
    const saved = saveSet({ id: null, name: input.trim() || proposed, items: list })
    setName(saved.name)
    setCurrentId(saved.id)
    refreshSaved(saved.id)
  }

  function onLoad(e){
    const id = e.target.value
    setSelectedId(id)
    if (!id) return
    const s = getSet(id)
    if (s){
      setCurrentId(s.id)
      setName(s.name || 'Untitled Set')
      setList(s.items || [])
    }
  }

  function onDuplicate(){
    if (!currentId) return onSaveAs()
    const copy = duplicateSet(currentId)
    if (copy){
      setCurrentId(copy.id)
      setName(copy.name)
      setList(copy.items || [])
      refreshSaved(copy.id)
    }
  }

  function onDelete(){
    if (!currentId) return
    if (window.confirm(`Delete set "${name}"? This cannot be undone.`)){
      deleteSet(currentId)
      onNew()
      refreshSaved('')
    }
  }

  // Export
  async function exportPdf(){
    const songs = []
    for(const sel of list){
      const s = items.find(it=> it.id===sel.id); if(!s) continue
      const txt = await fetch(`${import.meta.env.BASE_URL}songs/${s.filename}`).then(r=>r.text())
      const parsed = parseChordPro(txt)
      const baseKey = (parsed.meta?.key) || (parsed.meta?.originalkey) || s.originalKey || 'C'
      const steps = stepsBetween(baseKey, sel.toKey || baseKey)
      const blocks = parsed.blocks.map(b => ({
        section: b.section,
        lines: b.lines.map(ln => ({
          plain: ln.text,
          chordPositions: (ln.chords||[]).map(c => ({ sym: transposeSym(c.sym, steps), index: c.index }))
        }))
      }))
      songs.push({ title: parsed.meta?.title || s.title, key: sel.toKey || baseKey, lyricsBlocks: blocks })
    }
    await downloadMultiSongPdf(songs, { lyricSizePt: 16, chordSizePt: 16 })
  }

  return (
    <div className="container">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div><Link to="/" className="back">← Back</Link></div>
        <h2 style={{margin:0}}>Setlist Builder</h2>
        <div />
      </div>

      {/* Named sets toolbar */}
      <div className="card" style={{display:'flex', gap:8, alignItems:'center', marginTop:12}}>
        <label style={{display:'flex', alignItems:'center', gap:6}}>
          <span>Set:</span>
          <input
            aria-label="Set name"
            value={name}
            onChange={e=> setName(e.target.value)}
            style={{minWidth:220}}
            placeholder="Sunday AM"
          />
        </label>
        <select aria-label="Saved sets" value={selectedId} onChange={onLoad}>
          <option value="">— Load saved set —</option>
          {savedSets.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} · {new Date(s.updatedAt).toLocaleString()}
            </option>
          ))}
        </select>
        <button className="btn" onClick={onNew}>New</button>
        <button className="btn primary" onClick={onSave}>Save</button>
        <button className="btn" onClick={onSaveAs}>Save As…</button>
        <button className="btn" onClick={onDuplicate} disabled={!list.length}>Duplicate</button>
        <button className="btn" onClick={onDelete} disabled={!currentId}>Delete</button>
      </div>

      <div className="card" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
        <div>
          <label>Setlist name
            <input value={name} onChange={e=> setName(e.target.value)} placeholder="Sunday AM" />
          </label>
          <div style={{marginTop:8}}>
            <strong>Add songs</strong>
            <input value={q} onChange={e=> setQ(e.target.value)} placeholder="Search..." style={{display:'block', width:'100%', marginTop:6}} />
            <div style={{maxHeight:300, overflow:'auto', marginTop:6}}>
              {results.map(s=> (
                <div key={s.id} className="row" style={{padding:'6px 0'}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600}}>{s.title}</div>
                    <div className="meta">{s.originalKey || ''}{s.tags?.length ? ` • ${s.tags.join(', ')}` : ''}</div>
                  </div>
                  <button className="btn" onClick={()=> addSong(s)}>Add</button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div>
          <strong>Current setlist ({list.length})</strong>
          <div style={{maxHeight:360, overflow:'auto', marginTop:6}}>
            {list.map((sel, idx)=>{
              const s = items.find(it=> it.id===sel.id)
              if(!s) return null
              return (
                <div key={sel.id} className="row" style={{padding:'6px 0'}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600}}>{s.title}</div>
                    <div className="meta">Original: {s.originalKey || '—'}</div>
                  </div>
                  <select value={sel.toKey} onChange={e=> changeKey(sel.id, e.target.value)}>
                    {KEYS.map(k=> <option key={k} value={k}>{k}</option>)}
                  </select>
                  <button className="btn" onClick={()=> move(sel.id,'up')} title="Move up"><ArrowUp /></button>
                  <button className="btn" onClick={()=> move(sel.id,'down')} title="Move down"><ArrowDown /></button>
                  <button className="btn" onClick={()=> removeSong(sel.id)} title="Remove"><RemoveIcon /></button>
                </div>
              )
            })}
          </div>
          <div style={{display:'flex', gap:8, marginTop:8}}>
            <button className="btn primary iconbtn" onClick={exportPdf}><DownloadIcon /> Export PDF</button>
            <button className="btn" onClick={()=> setList([])}>Clear</button>
          </div>
        </div>
      </div>
    </div>
  )
}
