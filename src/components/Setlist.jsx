import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Fuse from 'fuse.js'
import indexData from '../data/index.json'
import { KEYS } from '../utils/chordpro'
import { ArrowUp, ArrowDown, RemoveIcon, DownloadIcon, PlusIcon, SaveIcon, CopyIcon, TrashIcon, ClearIcon } from './Icons'
import { stepsBetween, transposeSym } from '../utils/chordpro'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { normalizeSongInput } from '../utils/pdf/pdfLayout'
import { listSets, getSet, saveSet, deleteSet, duplicateSet } from '../utils/sets'
import { fetchTextCached } from '../utils/fetchCache'
import { showToast } from '../utils/toast'
import { headOk } from '../utils/headCache'
import Busy from './Busy'
import SongCard from './ui/SongCard'

// Lazy pdf exporter
let pdfLibPromise
const loadPdfLib = () => pdfLibPromise || (pdfLibPromise = import('../utils/pdf'))

export default function Setlist(){
  // existing state
  const [name, setName] = useState('Untitled Set')
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [icpOnly, setIcpOnly] = useState(() => {
    try { return localStorage.getItem('pref:icpOnly') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('pref:icpOnly', icpOnly ? '1' : '0') } catch {}
  }, [icpOnly])
  const [list, setList] = useState([])
  const [pptxMap, setPptxMap] = useState({})
  const [pptxProgress, setPptxProgress] = useState('')
  const pptxCount = Object.keys(pptxMap).length
  const [busy, setBusy] = useState(false)

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
        const slug = s.filename.replace(/\.chordpro$/i, '')
        const url = `${import.meta.env.BASE_URL}pptx/${slug}.pptx`
        const ok = await headOk(url, slug)
        if(ok) found[slug] = true
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
  function icpPass(s){ return !icpOnly || (Array.isArray(s.tags) ? s.tags.includes('ICP') : s.tags === 'ICP') }
  const results = useMemo(() => {
    const base = q ? fuse.search(q).map(r=> r.item) : items.slice().sort((a,b)=> a.title.localeCompare(b.title))
    return base.filter(icpPass)
  }, [q, fuse, items, icpOnly])

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
async function exportPdf() {
  setBusy(true);
  try {
    const { downloadMultiSongPdf } = await loadPdfLib();
    const songs = [];

    for (const sel of list) {
      const s = items.find((it) => it.id === sel.id);
      if (!s) continue;

      try {
        const url = `${import.meta.env.BASE_URL}songs/${s.filename}`;
        const txt = await fetchTextCached(url);
        const doc = parseChordProOrLegacy(txt);

        const baseKey =
          doc.meta?.key ||
          doc.meta?.originalkey ||
          s.originalKey ||
          "C";

        const steps = stepsBetween(baseKey, sel.toKey || baseKey);

        const blocks = (doc.sections || []).map((sec) => ({
          section: sec.label,
          lines: (sec.lines || []).map((ln) => ({
            plain: ln.comment ? ln.comment : (ln.lyrics || ''),
            chordPositions: (ln.chords || []).map((c) => ({
              sym: transposeSym(c.sym, steps),
              index: c.index,
            })),
            comment: ln.comment ? ln.comment : undefined,
          })),
        }));

        const slug = s.filename.replace(/\.chordpro$/i, "");
        const song = normalizeSongInput({
          title: doc.meta?.title || s.title || slug,
          key: sel.toKey || baseKey,
          capo: doc.meta?.capo,
          lyricsBlocks: blocks,
        });
        songs.push(song);
      } catch (err) {
        console.error(err);
        showToast(`Failed to process ${s.filename}`);
      }
    }

    if (songs.length) {
      await downloadMultiSongPdf(songs);
    }
  } finally {
    setBusy(false);
  }
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
      const slug = s.filename.replace(/\.chordpro$/i, '')
      if(!pptxMap[slug]) continue
      try{
        const res = await fetch(`${import.meta.env.BASE_URL}pptx/${slug}.pptx`)
        if(!res.ok) continue
        const blob = await res.blob()
        added++
        zip.file(`${String(added).padStart(2,'0')}-${slug}.pptx`, blob)
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
  

  return (
    <div className="container">
      <Busy busy={busy} />
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div />
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
        <button className="btn iconbtn" onClick={onNew} title="New set"><PlusIcon /><span className="text-when-wide">New</span></button>
        <button className="btn primary iconbtn" onClick={onSave} title="Save set"><SaveIcon /><span className="text-when-wide">Save</span></button>
        {/* Save As removed per request */}
        <button className="btn iconbtn" onClick={onDuplicate} disabled={!list.length} title="Duplicate set"><CopyIcon /><span className="text-when-wide">Duplicate</span></button>
        <button className="btn iconbtn" onClick={onDelete} disabled={!currentId} title="Delete set"><TrashIcon /><span className="text-when-wide">Delete</span></button>

        {/* Quick transpose */}
        <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:6}}>
          <span className="meta">Transpose:</span>
          <button className="btn" onClick={()=> transposeSet(-1)} title="Transpose set down 1 semitone">–1</button>
          <button className="btn" onClick={resetSetKeys} title="Reset all to originals">Reset</button>
          <button className="btn" onClick={()=> transposeSet(1)} title="Transpose set up 1 semitone">+1</button>
        </div>
      </div>

      <div className="BuilderPage" style={{marginTop:12}}>
        <div className="BuilderLeft">
          <div className="card">
          {/* Removed the redundant "Setlist name" field */}
          <div style={{marginTop:8}}>
            <strong>Add songs</strong>
            <div style={{display:'flex', gap:8, alignItems:'center', marginTop:6}}>
              <input value={q} onChange={e=> setQ(e.target.value)} placeholder="Search..." style={{flex:1}} />
              <label className="row" style={{gap:6, alignItems:'center'}}>
                <input type="checkbox" checked={icpOnly} onChange={e=> setIcpOnly(e.target.checked)} />
                <span className="meta" title="Limit results to songs tagged ICP">ICP only</span>
              </label>
            </div>
            <div style={{minHeight:0, maxHeight:300, overflow:'auto', marginTop:6}}>
              {!fuse ? <div>Loading search…</div> : results.map(s=> (
                <SongCard
                  key={s.id}
                  title={s.title}
                  subtitle={`${s.originalKey || ''}${s.tags?.length ? ` • ${s.tags.join(', ')}` : ''}`}
                  rightSlot={<button className="btn iconbtn" onClick={()=> addSong(s)} title="Add to set"><PlusIcon /><span className="text-when-wide">Add</span></button>}
                />
              ))}
            </div>
          </div>
          </div>
        </div>

        <div className="BuilderRight">
          <div className="card">
          <strong>Current setlist ({list.length})</strong>
          <div style={{minHeight:0, maxHeight:360, overflow:'auto', marginTop:6}}>
            {list.map((sel)=>{
              const s = items.find(it=> it.id===sel.id)
              if(!s) return null
              return (
                <SongCard
                  key={sel.id}
                  title={s.title}
                  subtitle={`Original: ${s.originalKey || '—'}`}
                  rightSlot={
                    <div style={{display:'flex', alignItems:'center', gap:6}}>
                      <select value={sel.toKey} onChange={e=> changeKey(sel.id, e.target.value)}>
                        {KEYS.map(k=> <option key={k} value={k}>{k}</option>)}
                      </select>
                      <button className="btn" onClick={()=> move(sel.id,'up')} title="Move up"><ArrowUp /></button>
                      <button className="btn" onClick={()=> move(sel.id,'down')} title="Move down"><ArrowDown /></button>
                      <button className="btn" onClick={()=> removeSong(sel.id)} title="Remove"><RemoveIcon /></button>
                    </div>
                  }
                />
              )
            })}
          </div>
          <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
            <button
              className="btn primary iconbtn"
              onClick={exportPdf}
              onMouseEnter={prefetchPdf}
              onFocus={prefetchPdf}
              disabled={busy}
              title="Export set as a single PDF"
            >{busy ? 'Exporting…' : <><DownloadIcon /> <span className="text-when-wide">Export PDF</span><span className="text-when-narrow">PDF</span></>}</button>
            <Link
              className="btn iconbtn"
              to={(list.length ? `/worship/${list.map(s=> s.id).join(',')}?toKeys=${list.map(sel => encodeURIComponent(sel.toKey)).join(',')}` : '#')}
              title={list.length ? 'Open Worship Mode with this set' : 'Add songs to open Worship Mode'}
              aria-disabled={!list.length}
              onClick={(e)=>{ if(!list.length){ e.preventDefault() } }}
            >
              <span className="text-when-wide">Open in Worship Mode</span>
              <span className="text-when-narrow">Worship</span>
            </Link>
            <button
              className="btn iconbtn"
              onClick={bundlePptx}
              disabled={pptxCount===0 || !!pptxProgress}
              title={pptxCount===0 ? 'No PPTX files found for this set.' : 'Bundle PPTX files for selected songs'}
            >
              {pptxProgress ? pptxProgress : <><DownloadIcon /> <span className="text-when-wide">Bundle PPTX</span><span className="text-when-narrow">PPTX</span></>}
            </button>
            <button className="btn iconbtn" onClick={()=> setList([])} title="Clear setlist"><ClearIcon /><span className="text-when-wide">Clear</span></button>
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
    </div>
  )
}
