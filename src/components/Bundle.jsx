import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import indexData from '../data/index.json'
import { parseChordPro, stepsBetween, transposeSym, KEYS } from '../utils/chordpro'
import { downloadMultiSongPdf } from '../utils/pdf'

export default function Bundle(){
  const navigate = useNavigate()
  const [selection, setSelection] = useState({})
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(()=>{
    try{ const raw = localStorage.getItem('bundleSelection'); setSelection(raw? JSON.parse(raw):{}) }catch{}
  },[])

  useEffect(()=>{
    const ids = Object.keys(selection)
    setEntries((indexData?.items||[]).filter(it=> ids.includes(it.id)))
  },[selection])

  async function handleDownload(){
    setLoading(true)
    try{
      const songs = []
      for(const it of entries){
        const toKey = selection[it.id]?.toKey || it.originalKey || 'C'
        const text = await fetch(`${import.meta.env.BASE_URL}songs/${it.filename}`).then(r=>r.text())
        const parsed = parseChordPro(text)
        const baseKey = parsed.meta.key || parsed.meta.originalkey || it.originalKey || 'C'
        const steps = stepsBetween(baseKey, toKey)
        const blocks = parsed.blocks.map(b => ({
          section: b.section,
          lines: b.lines.map(ln => ({
            plain: ln.text,
            chordPositions: (ln.chords||[]).map(c => ({ sym: transposeSym(c.sym, steps), index: c.index }))
          }))
        }))
        songs.push({ title: parsed.meta.title || it.title, key: toKey, lyricsBlocks: blocks })
      }
      await downloadMultiSongPdf(songs, { lyricSizePt: 16, chordSizePt: 16 })
    } finally { setLoading(false) }
  }

  if(entries.length===0){
    return <div className="container"><h2>Bundle</h2><p>No songs selected.</p><Link to="/" className="btn">← Back</Link></div>
  }

  return (
    <div className="container">
      <div className="songpage__top">
        <Link to="/" className="back">← Back</Link>
        <h2 style={{margin:0}}>Build PDF Bundle</h2>
      </div>
      <div className="card" style={{display:'grid', gap:10}}>
        {entries.map(it=>{
          const toKey = selection[it.id]?.toKey || it.originalKey || 'C'
          return (
            <div key={it.id} className="row">
              <div style={{flex:1}}>
                <div style={{fontWeight:600}}>{it.title}</div>
                <div className="meta">Original: {it.originalKey || '—'}{it.tags?.length ? ` • ${it.tags.join(', ')}` : ''}</div>
              </div>
              <label>Key:{' '}
                <select value={toKey} onChange={(e)=> setSelection(prev=> ({...prev, [it.id]: { toKey: e.target.value }}))}>
                  {KEYS.map(k=> <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
            </div>
          )
        })}
      </div>
      <div style={{display:'flex', gap:8, marginTop:10}}>
        <button className="btn" onClick={()=>{ localStorage.removeItem('bundleSelection'); navigate('/') }}>Clear</button>
        <button className="btn primary" disabled={loading} onClick={handleDownload}>{loading? 'Preparing…':'Download PDF ('+entries.length+')'}</button>
      </div>
    </div>
  )
}
