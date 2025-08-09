import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Fuse from 'fuse.js'
import indexData from '../data/index.json'
import { KEYS } from '../utils/chordpro'
import { ArrowUp, ArrowDown, RemoveIcon, DownloadIcon } from './Icons'
import { parseChordPro, stepsBetween, transposeSym } from '../utils/chordpro'
import { downloadMultiSongPdf } from '../utils/pdf'

export default function Setlist(){
  const [name, setName] = useState('Untitled Set')
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [list, setList] = useState([])
  useEffect(()=>{ setItems(indexData?.items || []) },[])
  useEffect(()=>{ try{ const saved = localStorage.getItem('setlist'); if(saved){ const s = JSON.parse(saved); setName(s.name||'Untitled Set'); setList(s.list||[]) } }catch{} },[])
  useEffect(()=>{ try{ localStorage.setItem('setlist', JSON.stringify({ name, list })) }catch{} },[name, list])

  const fuse = useMemo(()=> new Fuse(items, { keys: ['title','tags'], threshold:0.4 }), [items])
  const results = useMemo(()=> q ? fuse.search(q).map(r=> r.item) : items.slice().sort((a,b)=> a.title.localeCompare(b.title)), [q, fuse, items])

  function addSong(s){ if(list.find(x=> x.id===s.id)) return; setList([...list, { id: s.id, toKey: s.originalKey || 'C' }]) }
  function removeSong(id){ setList(list.filter(x=> x.id!==id)) }
  function move(id, dir){ const i = list.findIndex(x=> x.id===id); if(i<0) return; const j = i + (dir==='up'?-1:1); if(j<0||j>=list.length) return; const copy = list.slice(); const [item] = copy.splice(i,1); copy.splice(j,0,item); setList(copy) }
  function changeKey(id, val){ setList(list.map(x=> x.id===id ? { ...x, toKey: val } : x)) }

  async function exportPdf(){
    const songs = []
    for(const sel of list){
      const s = items.find(it=> it.id===sel.id); if(!s) continue
      const txt = await fetch(`${import.meta.env.BASE_URL}songs/${s.filename}`).then(r=>r.text())
      const parsed = parseChordPro(txt)
      const baseKey = parsed.meta.key || parsed.meta.originalkey || s.originalKey || 'C'
      const steps = stepsBetween(baseKey, sel.toKey || baseKey)
      const blocks = parsed.blocks.map(b => ({
        section: b.section,
        lines: b.lines.map(ln => ({
          plain: ln.text,
          chordPositions: (ln.chords||[]).map(c => ({ sym: transposeSym(c.sym, steps), index: c.index }))
        }))
      }))
      songs.push({ title: parsed.meta.title || s.title, key: sel.toKey || baseKey, lyricsBlocks: blocks })
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
