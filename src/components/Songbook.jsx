import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import indexData from '../data/index.json'
import { parseChordPro } from '../utils/chordpro'
import { fetchTextCached } from '../utils/fetchCache'
import { downloadSongbookPdf } from '../utils/pdf'

export default function Songbook(){
  const [items, setItems] = useState([])
  const [tag, setTag] = useState('')
  const [country, setCountry] = useState('')
  const [author, setAuthor] = useState('')
  const [includeTOC, setIncludeTOC] = useState(true)
  const [fontSize, setFontSize] = useState(16)
  const [columns, setColumns] = useState(1)
  const [cover, setCover] = useState(null)

  // NEW: selection state (ids)
  const [selected, setSelected] = useState(()=> new Set())

  useEffect(()=>{ setItems(indexData?.items || []) },[])

  const tags = useMemo(()=> Array.from(new Set(items.flatMap(it=> it.tags||[]))).sort(), [items])
  const countries = useMemo(()=> Array.from(new Set(items.map(it=> it.country).filter(Boolean))).sort(), [items])
  const authors = useMemo(()=>{
    const set = new Set()
    items.forEach(it=> (it.authors||'').split(';').map(a=>a.trim()).filter(Boolean).forEach(a=> set.add(a)))
    return Array.from(set).sort()
  },[items])

  const filtered = useMemo(()=>{
    return items.filter(it=>{
      if(tag && !(it.tags||[]).includes(tag)) return false
      if(country && it.country!==country) return false
      if(author){
        const list = (it.authors||'').split(';').map(a=>a.trim())
        if(!list.includes(author)) return false
      }
      return true
    }).sort((a,b)=> a.title.localeCompare(b.title))
  }, [items, tag, country, author])

  // Derived: selected items (alphabetized)
  const selectedItems = useMemo(()=>{
    const map = new Map(items.map(it => [String(it.id), it]))
    const arr = Array.from(selected).map(id => map.get(String(id))).filter(Boolean)
    return arr.sort((a,b)=> a.title.localeCompare(b.title))
  }, [selected, items])

  function toggleOne(id){
    setSelected(prev => {
      const next = new Set(prev)
      const key = String(id)
      if(next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function selectAllFiltered(){
    setSelected(prev => {
      const next = new Set(prev)
      filtered.forEach(it => next.add(String(it.id)))
      return next
    })
  }

  function clearSelection(){
    setSelected(new Set())
  }

  async function exportPdf(){
    const base = ((import.meta.env.BASE_URL || '/').replace(/\/+/g, '') + '/')
    const list = selectedItems
    const songs = []
    for (const it of list) {
      const text = await fetchTextCached(`${base}songs/${it.filename}`)
      const parsed = parseChordPro(text)
      const blocks = (parsed.blocks || []).map((b) => ({
        label: b.label || '',
        lines: (b.lines || []).map(ln => ({
          text: ln.plain || '',
          chordPositions: (ln.chords||[]).map(c => ({ sym: c.sym, index: c.index }))
        }))
      }))
      songs.push({ title: parsed.meta?.title || it.title, key: parsed.meta?.key || it.originalKey || 'C', lyricsBlocks: blocks })
    }
    await downloadSongbookPdf(songs, {
      includeTOC,
      cover,
      lyricSizePt: fontSize,
      chordSizePt: fontSize,
      columns
    })
  }

  return (
    <div className="container">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div><Link to="/" className="back">← Back</Link></div>
        <h2 style={{margin:0}}>Songbook Builder</h2>
        <div />
      </div>

      <div className="card" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12}}>
        {/* LEFT: Picker with filters + list with checkboxes */}
        <div style={{display:'flex', flexDirection:'column', minHeight:0}}>
          <strong>Filters</strong>
          <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:8}}>
            <label>Tag:{' '}
              <select value={tag} onChange={e=> setTag(e.target.value)}>
                <option value="">All</option>
                {tags.map(t=> <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>Country:{' '}
              <select value={country} onChange={e=> setCountry(e.target.value)}>
                <option value="">All</option>
                {countries.map(c=> <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>Author:{' '}
              <select value={author} onChange={e=> setAuthor(e.target.value)}>
                <option value="">All</option>
                {authors.map(a=> <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          </div>

          <div style={{display:'flex', gap:8, marginTop:10}}>
            <button className="btn" onClick={selectAllFiltered} disabled={!filtered.length}>Select all ({filtered.length} filtered)</button>
            <button className="btn" onClick={clearSelection} disabled={!selected.size}>Clear</button>
          </div>

          <div style={{marginTop:10, fontWeight:600}}>{selected.size} selected</div>

          {/* Scrollable list */}
          <div style={{marginTop:8, flex:'1 1 auto', minHeight:0, overflow:'auto', border:'1px solid var(--border)', borderRadius:8, padding:8}}>
            {filtered.map(it => {
              const checked = selected.has(String(it.id))
              return (
                <label key={it.id} style={{display:'flex', alignItems:'center', gap:8, padding:'6px 4px', borderBottom:'1px solid rgba(0,0,0,0.05)'}}>
                  <input type="checkbox" checked={checked} onChange={()=> toggleOne(it.id)} />
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600}}>{it.title}</div>
                    <div className="meta">{(it.authors||'').split(';').filter(Boolean).join(', ') || '—'}{it.tags?.length ? ` • ${it.tags.join(', ')}` : ''}</div>
                  </div>
                </label>
              )
            })}
            {!filtered.length && <div style={{padding:8, color:'var(--muted)'}}>No songs match these filters.</div>}
          </div>
        </div>

        {/* RIGHT: Preview & export */}
        <div style={{display:'flex', flexDirection:'column', minHeight:0}}>
          <strong>Preview (alphabetized)</strong>
          <div style={{marginTop:8, flex:'1 1 auto', minHeight:0, overflow:'auto', border:'1px solid var(--border)', borderRadius:8, padding:8}}>
            <ol style={{margin:0, paddingLeft:20}}>
              {selectedItems.map((it)=>(
                <li key={it.id} style={{padding:'6px 0'}}>
                  <span style={{fontWeight:600}}>{it.title}</span>
                </li>
              ))}
            </ol>
            {!selectedItems.length && <div style={{padding:8, color:'var(--muted)'}}>No songs selected yet.</div>}
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12}}>
            <label>Font size:{' '}
              <input type="number" min={12} max={24} step={1} value={fontSize} onChange={e=> setFontSize(Number(e.target.value)||16)} />
            </label>
            <label>Columns:{' '}
              <select value={columns} onChange={e=> setColumns(Number(e.target.value))}>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </label>
          </div>

          <label style={{marginTop:8, display:'block'}}>
            <input type="checkbox" checked={includeTOC} onChange={e=> setIncludeTOC(e.target.checked)} /> Include Table of Contents
          </label>

          <div style={{marginTop:8}}>
            <label style={{display:'block', marginBottom:6}}>Cover image (optional):</label>
            <input type="file" accept="image/*" onChange={e=> setCover(e.target.files?.[0] || null)} />
          </div>

          <div style={{marginTop:12}}>
            <button className="btn primary" onClick={exportPdf} disabled={!selectedItems.length}>Export PDF</button>
          </div>
        </div>
      </div>
    </div>
  )
}
