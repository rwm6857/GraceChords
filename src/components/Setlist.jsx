import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Fuse from 'fuse.js'
import indexData from '../data/index.json'
import { KEYS } from '../utils/chordpro'
import { ArrowUp, ArrowDown, RemoveIcon, DownloadIcon } from './Icons'
import { parseChordPro, stepsBetween, transposeSym } from '../utils/chordpro'
import { listSets, getSet, saveSet, deleteSet, duplicateSet } from '../utils/sets'
import { fetchTextCached } from '../utils/fetchCache'
import { showToast } from '../utils/toast'
import { headOk } from '../utils/headCache'

// Lazy pdf exporter
let pdfLibPromise
const loadPdfLib = () => pdfLibPromise || (pdfLibPromise = import('../utils/pdf'))

export default function Setlist(){
  // existing state
  const [name, setName] = useState('Untitled Set')
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [list, setList] = useState([])
  const [pptxMap, setPptxMap] = useState({})
  const [pptxProgress, setPptxProgress] = useState('')
  const pptxCount = Object.keys(pptxMap).length

  // named sets
  const [currentId, setCurrentId] = useState(null)
  const [savedSets, setSavedSets] = useState(() => listSets())
  const [selectedId, setSelectedId] = useState('')

  // load catalog
  useEffect(()=>{ setItems(indexData?.items || []) },[])

  // check available PPTX files for current set
  useEffect(() => {
    let cancelled = false
    async function check(){
      const found = {}
      for(const sel of list){
        const s = items.find(it=> it.id===sel.id)
        if(!s) continue
        const url = `${import.meta.env.BASE_URL}pptx/${s.id}.pptx`
        const ok = await headOk(url, s.id)
        if(ok) found[s.id] = true
      }
      if(!cancelled) setPptxMap(found)
    }
    check()
    return () => { cancelled = true }
  }, [list, items])

  // (optional) migrate legacy single-set storage if present and nothing saved yet
  useEffect(() => {
    try {
      const legacy = localStorage.getItem('setlist')
      if (!legacy) return
      if (listSets().length > 0) return
      const s = JSON.parse(legacy)
      if ((s?.name || '') || (s?.list?.length || 0) > 0) {
        const saved = saveSet({ name: s.name || 'Imported Set', items: s.list || [] })
        setSavedSets(listSets())
        setCurrentId(saved.id)
        setName(saved.name)
        setList(saved.items || [])
        setSelectedId(saved.id)
      }
    } catch {}
  }, [])

  // search
  const fuse = useMemo(()=> new Fuse(items, { keys: ['title','tags'], threshold:0.4 }), [items])
  const results = useMemo(
    ()=> q ? fuse.search(q).map(r=> r.item) : items.slice().sort((a,b)=> a.title.localeCompare(b.title)),
    [q, fuse, items]
  )

  // list mutators
  function addSong(s){ if(list.find(x=> x.id===s.id)) return; setList([...list, { id: s.id, toKey: s.originalKey || 'C' }]) }
  function removeSong(id){ setList(list.filter(x=> x.id!==id)) }
  function move(id, dir){
    const i = list.findIndex(x=> x.id===id); if(i<0) return
    const j = i + (dir==='up'?-1:1); if(j<0||j>=list.length) return
    const copy = list.slice(); const [item] = copy.splice(i,1); copy.splice(j,0,item); setList(copy)
  }
  function changeKey(id, val){ setList(list.map(x=> x.id===id ? { ...x, toKey: val } : x)) }

  // quick transpose (entire set)
  function transposeSet(delta){
    setList(prev => prev.map(sel => {
      const s = items.find(it=> it.id===sel.id)
      const from = sel.toKey || s?.originalKey || 'C'
      return { ...sel, toKey: transposeSym(from, delta) }
    }))
  }
  function resetSetKeys(){
    setList(prev => prev.map(sel => {
      const s = items.find(it=> it.id===sel.id)
      return { ...sel, toKey: s?.originalKey || 'C' }
    }))
  }

  // named set helpers
  function refreshSaved(idToSelect){
    setSavedSets(listSets())
    setSelectedId(idToSelect || '')
  }
  function onNew(){
    setCurrentId(null); setName('Untitled Set'); setList([]); setSelectedId('')
  }
  function onSave(){
    const finalName = (name?.trim() || 'Untitled Set')
    const saved = saveSet({ id: currentId, name: finalName, items: list })
    setName(saved.name); setCurrentId(saved.id); refreshSaved(saved.id)
  }
  function onLoad(e){
    const id = e.target.value
    setSelectedId(id)
    if (!id) return
    const s = getSet(id)
    if (s){ setCurrentId(s.id); setName(s.name || 'Untitled Set'); setList(s.items || []) }
  }
  function onDuplicate(){
    if (!currentId) {
      // no id yet -> equivalent to Save As… but per your request we keep only Save
      const proposed = `Copy of ${name || 'Untitled Set'}`
      const saved = saveSet({ id: null, name: proposed, items: list })
      setName(saved.name); setCurrentId(saved.id); refreshSaved(saved.id)
      return
    }
    const copy = duplicateSet(currentId)
    if (copy){ setCurrentId(copy.id); setName(copy.name); setList(copy.items || []); refreshSaved(copy.id) }
  }
  function onDelete(){
    if (!currentId) return
    if (window.confirm(`Delete set "${name}"? This cannot be undone.`)){
      deleteSet(currentId); onNew(); refreshSaved('')
    }
  }

  // export & print
  async function exportPdf(){
    const { downloadMultiSongPdf } = await loadPdfLib()
    const songs = []
    for(const sel of list){
      const s = items.find(it=> it.id===sel.id); if(!s) continue
      try {
        const url = `${import.meta.env.BASE_URL}songs/${s.filename}`
        const txt = await fetchTextCached(url)
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
      } catch(err){
        console.error(err)
        showToast(`Failed to process ${s.filename}`)
      }
    }
    if(songs.length) await downloadMultiSongPdf(songs, { lyricSizePt: 16, chordSizePt: 16 })
  }

  function prefetchPdf(){ loadPdfLib() }

  async function bundlePptx(){
    setPptxProgress(`Bundling 0/${list.length}…`)
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    let added = 0
    for(let i=0; i<list.length; i++){
      const sel = list[i]
      const s = items.find(it=> it.id===sel.id)
      if(!s){ setPptxProgress(`Bundling ${i+1}/${list.length}…`); continue }
      setPptxProgress(`Bundling ${i+1}/${list.length}…`)
      if(!pptxMap[s.id]) continue
      try{
        const res = await fetch(`${import.meta.env.BASE_URL}pptx/${s.id}.pptx`)
        if(!res.ok) continue
        const blob = await res.blob()
        added++
        zip.file(`${String(added).padStart(2,'0')}-${s.id}.pptx`, blob)
      }catch{}
    }
    if(added>0){
      const blob = await zip.generateAsync({ type:'blob' })
      const date = new Date().toISOString().slice(0,10).replace(/-/g,'')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `setlist-pptx-${date}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
    }
    setPptxProgress('')
  }
  function onPrint(){ window.print() }

  return (
    <div className="container">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div><Link to="/" className="back">← Back</Link></div>
        <h1 style={{margin:0}}>Setlist Builder</h1>
        <div />
      </div>

      {/* Named sets toolbar (keep) */}
      <div className="card toolbar" style={{marginTop:12}}>
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
        {/* Save As removed per request */}
        <button className="btn" onClick={onDuplicate} disabled={!list.length}>Duplicate</button>
        <button className="btn" onClick={onDelete} disabled={!currentId}>Delete</button>

        {/* Quick transpose */}
        <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:6}}>
          <span className="meta">Transpose:</span>
          <button className="btn" onClick={()=> transposeSet(-1)} title="Transpose set down 1 semitone">–1</button>
          <button className="btn" onClick={resetSetKeys} title="Reset all to originals">Reset</button>
          <button className="btn" onClick={()=> transposeSet(1)} title="Transpose set up 1 semitone">+1</button>
        </div>
      </div>

      <div className="card" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
        <div>
          {/* Removed the redundant "Setlist name" field */}
          <div style={{marginTop:8}}>
            <strong>Add songs</strong>
            <input value={q} onChange={e=> setQ(e.target.value)} placeholder="Search..." style={{display:'block', width:'100%', marginTop:6}} />
            <div style={{minHeight:0, maxHeight:300, overflow:'auto', marginTop:6}}>
              {!fuse ? <div>Loading search…</div> : results.map(s=> (
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
          <div style={{minHeight:0, maxHeight:360, overflow:'auto', marginTop:6}}>
            {list.map((sel)=>{
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
            <button
              className="btn primary iconbtn"
              onClick={exportPdf}
              onMouseEnter={prefetchPdf}
              onFocus={prefetchPdf}
            ><DownloadIcon /> Export PDF</button>
            <button
              className="btn iconbtn"
              onClick={bundlePptx}
              disabled={pptxCount===0 || !!pptxProgress}
              title={pptxCount===0 ? 'No PPTX files found for this set.' : ''}
            >
              {pptxProgress ? pptxProgress : <><DownloadIcon /> Bundle PPTX</>}
            </button>
            <button className="btn" onClick={onPrint}>Print</button>
            <button className="btn" onClick={()=> setList([])}>Clear</button>
          </div>

          {/* Print-only minimal outline */}
          <div className="print-only" style={{marginTop:16}}>
            <h2 style={{fontSize:'20pt', margin:'0 0 8pt 0'}}>{name}</h2>
            <ol style={{fontSize:'12pt', lineHeight:1.4, paddingLeft:'1.2em'}}>
              {list.map(sel => {
                const s = items.find(it=> it.id===sel.id)
                if (!s) return null
                return (
                  <li key={sel.id}>
                    {s.title} — {sel.toKey || s.originalKey || '—'}
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
