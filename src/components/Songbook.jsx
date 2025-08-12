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
  },[items,tag,country,author])

  function onCoverChange(e){
    const file = e.target.files?.[0]
    if(!file){ setCover(null); return }
    const reader = new FileReader()
    reader.onload = (ev)=> setCover(ev.target.result)
    reader.readAsDataURL(file)
  }

  async function exportPdf(){
    const songs = []
    for(const it of filtered){
      const url = `${import.meta.env.BASE_URL}songs/${it.filename}`
      const txt = await fetchTextCached(url)
      const parsed = parseChordPro(txt)
      const blocks = parsed.blocks.map(b => ({
        section: b.section,
        lines: b.lines.map(ln => ({
          plain: ln.text,
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
        <div>
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
        </div>
        <div>
          <strong>Preview ({filtered.length})</strong>
          <ol style={{maxHeight:320, overflow:'auto', marginTop:6}}>
            {filtered.map((it, idx)=>(
              <li key={it.id}>{it.title}</li>
            ))}
          </ol>
        </div>
      </div>
      <div className="card" style={{marginTop:12}}>
        <strong>Options</strong>
        <div style={{display:'flex', flexWrap:'wrap', gap:12, marginTop:8}}>
          <label><input type="checkbox" checked={includeTOC} onChange={e=> setIncludeTOC(e.target.checked)} /> Include TOC</label>
          <label>Include cover page:{' '}
            <input type="file" accept="image/*" onChange={onCoverChange} />
          </label>
          <label>Font size:{' '}
            <select value={fontSize} onChange={e=> setFontSize(Number(e.target.value))}>
              {[12,14,16].map(sz=> <option key={sz} value={sz}>{sz}pt</option>)}
            </select>
          </label>
          <label>Columns:{' '}
            <select value={columns} onChange={e=> setColumns(Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
        </div>
        <div style={{marginTop:8}}>
          <button className="btn primary" onClick={exportPdf} disabled={!filtered.length}>Export PDF</button>
        </div>
      </div>
    </div>
  )
}

