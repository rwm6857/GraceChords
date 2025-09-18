import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Fuse from 'fuse.js'
import indexData from '../data/index.json'
import { KEYS } from '../utils/chordpro'
import { ArrowUp, ArrowDown, MinusIcon, DownloadIcon, PlusIcon, SaveIcon, TrashIcon, ClearIcon, MediaIcon, LinkIcon } from './Icons'
import { stepsBetween, transposeSym } from '../utils/chordpro'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { normalizeSongInput } from '../utils/pdf/pdfLayout'
import { listSets, getSet, saveSet, deleteSet } from '../utils/sets'
import { fetchTextCached } from '../utils/fetchCache'
import { showToast } from '../utils/toast'
import { headOk } from '../utils/headCache'
import { encodeSet, decodeSet } from '../utils/setcode'
import Busy from './Busy'
import { SongCard } from './ui/Card'
import Button from './ui/Button'
import Select from './ui/Select'
import Input from './ui/Input'
import Toolbar from './ui/Toolbar'
import PageContainer from './layout/PageContainer'

// Lazy pdf exporter
let pdfLibPromise
const loadPdfLib = () => pdfLibPromise || (pdfLibPromise = import('../utils/pdf'))

export default function Setlist(){
  const { code: routeCode } = useParams()
  const navigate = useNavigate()
  // existing state
  const [name, setName] = useState('New Setlist')
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
  const [loadOpen, setLoadOpen] = useState(false)
  const [loadChoice, setLoadChoice] = useState('')

  // load catalog (dedupe by id to avoid duplicate keys/results)
  useEffect(()=>{
    const arr = indexData?.items || []
    const seen = new Set()
    const uniq = []
    for (const s of arr) { if (!seen.has(s.id)) { seen.add(s.id); uniq.push(s) } }
    setItems(uniq)
  },[])

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

  // Load set from route code if present
  useEffect(() => {
    if (!routeCode) return
    const { entries, error } = decodeSet(routeCode)
    if (error) {
      alert(error)
      navigate('/setlist', { replace: true })
      return
    }
    setList(entries.map(e => ({ id: e.id, toKey: e.toKey })))
  }, [routeCode])

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
  function moveToIndex(srcId, dstIndex){
    const i = list.findIndex(x=> x.id===srcId); if(i<0) return
    if (dstIndex < 0 || dstIndex >= list.length) return
    if (i === dstIndex) return
    const copy = list.slice();
    const [item] = copy.splice(i,1);
    copy.splice(dstIndex,0,item);
    setList(copy)
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
    setCurrentId(null); setName('New Setlist'); setList([]); setSelectedId('')
  }
  function onSave(){
    const proposed = (name?.trim() || 'New Setlist')
    const input = window.prompt('Save set as:', proposed)
    if (input === null) return
    const finalName = (String(input).trim() || 'New Setlist')
    // If no current id, but a set exists with this name, overwrite it by reusing its id
    let targetId = currentId
    if (!targetId) {
      const existing = (listSets() || []).find(s => (s.name || '') === finalName)
      if (existing) targetId = existing.id
    }
    const saved = saveSet({ id: targetId, name: finalName, items: list })
    setName(saved.name); setCurrentId(saved.id); refreshSaved(saved.id)
  }
  function onLoadConfirm(){
    const id = loadChoice || selectedId || ''
    if (!id) { setLoadOpen(false); return }
    const s = getSet(id)
    if (s){ setCurrentId(s.id); setName(s.name || 'New Setlist'); setList(s.items || []) ; setSelectedId(s.id) }
    setLoadOpen(false)
  }
  function onOpenLoad(){
    const first = (savedSets[0]?.id) || ''
    setLoadChoice(selectedId || first)
    setLoadOpen(true)
  }
  // Duplicate removed per request
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

  // Copy set link (generates code on demand)
  async function copySetLink(){
    try {
      const code = encodeSet(list)
      const url = `${location.origin}${location.pathname}#/set/${code}`
      await navigator.clipboard.writeText(url)
      try { showToast?.('Link copied!') } catch {}
    } catch (e) { alert('Failed to copy link') }
  }

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
    } else {
      try { (showToast && showToast('No PPTX files found for selected songs')) || alert('No PPTX files found for selected songs') } catch {}
    }
    setPptxProgress('')
  }
  

  return (
    <PageContainer>
      {/* Load Set modal */}
      {loadOpen ? (
        <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.45)', zIndex: 90 }} role="dialog" aria-modal="true">
          <div style={{ background:'var(--card)', color:'var(--text)', border:'1px solid var(--line)', borderRadius:10, padding:16, width:'min(560px, 92vw)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Load Set</h3>
            {savedSets.length ? (
              <label style={{ display:'block', margin:'8px 0' }}>Select a saved set
                <select value={loadChoice} onChange={e=> setLoadChoice(e.target.value)} style={{ width:'100%' }}>
                  {savedSets.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {new Date(s.updatedAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="meta">No saved sets yet.</div>
            )}
            <div className="row" style={{ justifyContent:'flex-end', gap:8, marginTop: 12 }}>
              <Button onClick={()=> setLoadOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={onLoadConfirm} disabled={!savedSets.length}>Load</Button>
            </div>
          </div>
        </div>
      ) : null}
      <Busy busy={busy} />
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop: 12, marginBottom: 4}}>
        <div />
        <h1 style={{margin:0}}>Setlist Builder</h1>
        <div />
      </div>

      {/* Consolidated controls with title on its own line */}
      <Toolbar className="card" style={{ marginTop: 8, position: 'static' }}>
        <div style={{ width: '100%', marginBottom: 6 }}>
          <strong title="Current set name">{name || 'New Setlist'}</strong>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', width:'100%' }}>
          {/* Left cluster: Save, Load, New, Delete */}
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <Button size="sm" variant="primary" onClick={onSave} title="Save set" iconLeft={<SaveIcon />}> <span className="text-when-wide">Save</span></Button>
            <Button size="sm" onClick={onOpenLoad} title="Load saved set" iconLeft={<DownloadIcon />}> <span className="text-when-wide">Load</span></Button>
            <Button size="sm" onClick={onNew} title="New set" iconLeft={<PlusIcon />}> <span className="text-when-wide">New</span></Button>
            <Button size="sm" onClick={onDelete} disabled={!currentId} title="Delete set" iconLeft={<TrashIcon />}> <span className="text-when-wide">Delete</span></Button>
          </div>

          {/* Right cluster: Export PDF, Export PPTX, Share Set, Worship Mode */}
          <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
           {/* 1) Export PDF */}
          <Button size="sm"
            variant="primary"
            onClick={exportPdf}
            onMouseEnter={prefetchPdf}
            onFocus={prefetchPdf}
            disabled={busy}
            title="Export set as a single PDF"
            iconLeft={<DownloadIcon />}
          >{busy ? 'Exporting…' : <><span className="text-when-wide">Export PDF</span><span className="text-when-narrow">PDF</span></>}</Button>

          {/* 2) Export PPTX */}
          <Button size="sm"
            onClick={bundlePptx}
            disabled={list.length===0 || !!pptxProgress}
            title={list.length===0 ? 'Add songs to export PPTX bundle' : 'Export PPTX bundle for selected songs'}
            iconLeft={<DownloadIcon />}
          >{pptxProgress ? pptxProgress : <><span className="text-when-wide">Export PPTX</span><span className="text-when-narrow">PPTX</span></>}</Button>

          {/* 3) Share Set */}
          <Button size="sm" onClick={copySetLink} title="Copy shareable link" iconLeft={<LinkIcon />}>Share Set</Button>

          {/* 4) Worship Mode */}
          <Button size="sm"
            variant="primary"
            as={Link}
            to={(list.length ? `/worship/${list.map(s=> s.id).join(',')}?toKeys=${list.map(sel => encodeURIComponent(sel.toKey)).join(',')}` : '#')}
            title={list.length ? 'Open Worship Mode with this set' : 'Add songs to open Worship Mode'}
            aria-disabled={!list.length}
            onClick={(e)=>{ if(!list.length){ e.preventDefault() } }}
            iconLeft={<MediaIcon />}
          >
            <span className="text-when-wide">Worship Mode</span>
            <span className="text-when-narrow">Worship</span>
          </Button>
          </div>
        </div>
      </Toolbar>

      <div className="BuilderPage" style={{ marginTop: 8 }}>
        <div className="BuilderLeft">
          <div className="card" style={{ display:'flex', flexDirection:'column', flex:'1 1 auto', minHeight:0 }}>
            <div className="BuilderScroll" style={{ minHeight:0, flex:'1 1 auto', overflow:'auto', marginTop:8 }}>
              <div className="BuilderHeader" style={{ display:'flex', alignItems:'center', gap:8 }}>
                <strong style={{ whiteSpace:'nowrap' }}>Add songs</strong>
                <Input value={q} onChange={e=> setQ(e.target.value)} placeholder="Search..." style={{flex:1, minWidth:0}} />
                <label className="row" style={{gap:6, alignItems:'center'}}>
                  <input type="checkbox" checked={icpOnly} onChange={e=> setIcpOnly(e.target.checked)} />
                  <span className="meta" title="Limit results to songs tagged ICP">ICP only</span>
                </label>
              </div>
              {!fuse ? (
                <div>Loading search…</div>
              ) : (
                <div style={{ display:'grid', gap:'.5rem', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', marginTop:6 }}>
                  {results.map(s=> (
                    <SongCard
                      key={s.id}
                      title={s.title}
                      subtitle={`${s.originalKey || ''}${s.tags?.length ? ` • ${s.tags.join(', ')}` : ''}`}
                      rightSlot={<Button aria-label="Add" title="Add to set" variant="primary" iconLeft={<PlusIcon />} iconOnly onClick={(e)=> { e.stopPropagation(); addSong(s) }} />}
                      onClick={() => addSong(s)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="BuilderRight" style={{ minHeight:0, display:'flex', flexDirection:'column' }}>
          <div className="card" style={{ display:'flex', flexDirection:'column', flex:'1 1 auto', minHeight:0 }}>
            <div className="BuilderScroll" style={{minHeight:0, flex:'1 1 auto', overflow:'auto', marginTop:8}}>
              <div className="BuilderHeader">
                <strong>Current setlist ({list.length})</strong>
              </div>
              <div style={{ marginTop: 6 }}>
                {list.map((sel, idx)=>{
                  const s = items.find(it=> it.id===sel.id)
                  if(!s) return null
                  return (
                    <SongCard
                      key={sel.id}
                      draggable
                      onDragStart={(e)=>{ e.dataTransfer.setData('text/plain', String(sel.id)); e.dataTransfer.effectAllowed = 'move' }}
                      onDragOver={(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                      onDrop={(e)=>{ e.preventDefault(); const srcId = e.dataTransfer.getData('text/plain'); moveToIndex(srcId, idx) }}
                      title={s.title}
                      subtitle={`Original: ${s.originalKey || '—'}`}
                      rightSlot={
                        <div style={{display:'flex', alignItems:'center', gap:6}}>
                          <Select value={sel.toKey} onChange={e=> changeKey(sel.id, e.target.value)}>
                            {KEYS.map(k=> <option key={k} value={k}>{k}</option>)}
                          </Select>
                          <Button onClick={()=> move(sel.id,'up')} title="Move up" iconLeft={<ArrowUp />} />
                          <Button onClick={()=> move(sel.id,'down')} title="Move down" iconLeft={<ArrowDown />} />
                          <Button onClick={()=> removeSong(sel.id)} title="Remove" iconLeft={<MinusIcon />} iconOnly style={{ color:'#b91c1c' }} />
                        </div>
                      }
                    />
                  )
                })}
              </div>
            </div>
          {/* Actions moved to toolbar above */}

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
    </PageContainer>
  )
}
