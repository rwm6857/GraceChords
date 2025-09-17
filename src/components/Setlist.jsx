import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Fuse from 'fuse.js'
import indexData from '../data/index.json'
import { KEYS } from '../utils/chordpro'
import { ArrowUp, ArrowDown, MinusIcon, DownloadIcon, PlusIcon, SaveIcon, CopyIcon, TrashIcon, ClearIcon, MediaIcon, LinkIcon } from './Icons'
import { stepsBetween, transposeSym } from '../utils/chordpro'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { normalizeSongInput } from '../utils/pdf/pdfLayout'
import { listSets, getSet, saveSet, deleteSet, duplicateSet } from '../utils/sets'
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

  // Set code helpers
  const [setCode, setSetCode] = useState('')
  const [loadCode, setLoadCode] = useState('')
  function generateCode(){
    const code = encodeSet(list)
    setSetCode(code)
  }
  async function copyLink(){
    try {
      const url = `${location.origin}${location.pathname}#/set/${setCode}`
      await navigator.clipboard.writeText(url)
      try { showToast?.('Link copied!') } catch {}
    } catch (e) { alert('Failed to copy link') }
  }
  function loadFromCode(){
    const s = String(loadCode || '').trim()
    const { entries, error } = decodeSet(s)
    if (error) { alert(error); return }
    setList(entries.map(e => ({ id: e.id, toKey: e.toKey })))
    setLoadCode('')
    setSetCode(s)
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
      <Busy busy={busy} />
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div />
        <h1 style={{margin:0}}>Setlist Builder</h1>
        <div />
      </div>

      {/* Named sets toolbar (keep) */}
      <Toolbar className="card" style={{ marginTop: 8, position: 'static' }}>
        <Input label="Set" aria-label="Set name" value={name} onChange={e=> setName(e.target.value)} style={{minWidth:220}} placeholder="Sunday AM" />
        <Select aria-label="Saved sets" value={selectedId} onChange={onLoad}>
          <option value="">— Load saved set —</option>
          {savedSets.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} · {new Date(s.updatedAt).toLocaleString()}
            </option>
          ))}
        </Select>
        <Button onClick={onNew} title="New set" iconLeft={<PlusIcon />}> <span className="text-when-wide">New</span></Button>
        <Button variant="primary" onClick={onSave} title="Save set" iconLeft={<SaveIcon />}> <span className="text-when-wide">Save</span></Button>
        {/* Save As removed per request */}
        <Button onClick={onDuplicate} disabled={!list.length} title="Duplicate set" iconLeft={<CopyIcon />}> <span className="text-when-wide">Duplicate</span></Button>
        <Button onClick={onDelete} disabled={!currentId} title="Delete set" iconLeft={<TrashIcon />}> <span className="text-when-wide">Delete</span></Button>

        {/* Set code tools moved into Set Sharing section below */}

        {/* Actions: Export, Worship, PPTX, Clear (moved from bottom) */}
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {/* 1) Export PDF */}
          <Button
            variant="primary"
            onClick={exportPdf}
            onMouseEnter={prefetchPdf}
            onFocus={prefetchPdf}
            disabled={busy}
            title="Export set as a single PDF"
            iconLeft={<DownloadIcon />}
          >{busy ? 'Exporting…' : <><span className="text-when-wide">Export PDF</span><span className="text-when-narrow">PDF</span></>}</Button>

          {/* 2) Export PPTX */}
          <Button
            onClick={bundlePptx}
            disabled={list.length===0 || !!pptxProgress}
            title={list.length===0 ? 'Add songs to export PPTX bundle' : 'Export PPTX bundle for selected songs'}
            iconLeft={<DownloadIcon />}
          >{pptxProgress ? pptxProgress : <><span className="text-when-wide">Export PPTX</span><span className="text-when-narrow">PPTX</span></>}</Button>

          {/* 3) Clear */}
          <Button onClick={()=> setList([])} title="Clear setlist" iconLeft={<ClearIcon />}><span className="text-when-wide">Clear</span></Button>

          {/* 4) Worship Mode */}
          <Button
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
      </Toolbar>

      {/* Set Sharing: generate, copy link, load by code */}
      <div className="card" style={{ marginTop: 8 }}>
        <strong>Set Sharing</strong>
        <div className="Row" style={{ alignItems:'center', gap:8, flexWrap:'wrap', marginTop: 6 }}>
          <Button onClick={generateCode} title="Generate code for this set">Generate Set Code</Button>
          <input
            readOnly
            placeholder="(code)"
            value={setCode}
            onFocus={(e)=> e.currentTarget.select()}
            style={{ width: 240 }}
            aria-label="Set code"
          />
          <Button onClick={copyLink} disabled={!setCode} title="Copy shareable link" iconLeft={<LinkIcon />}>Copy Link</Button>
        </div>
        <div className="Row" style={{ alignItems:'center', gap:8, flexWrap:'wrap', marginTop: 8 }}>
          <span className="meta">Load from code</span>
          <input value={loadCode} onChange={e=> setLoadCode(e.target.value)} placeholder="Paste set code…" style={{ width: 240 }} aria-label="Load set code" />
          <Button onClick={loadFromCode} disabled={!loadCode.trim()} title="Load set from code">Load</Button>
        </div>
      </div>

      <div className="BuilderPage" style={{ marginTop: 8 }}>
        <div className="BuilderLeft">
          <div className="card" style={{ display:'flex', flexDirection:'column', flex:'1 1 auto', minHeight:0 }}>
          {/* Removed the redundant "Setlist name" field */}
          <div style={{marginTop:8}}>
            <strong>Add songs</strong>
            <div style={{display:'flex', gap:8, alignItems:'center', marginTop:6}}>
              <Input value={q} onChange={e=> setQ(e.target.value)} placeholder="Search..." style={{flex:1}} />
              <label className="row" style={{gap:6, alignItems:'center'}}>
                <input type="checkbox" checked={icpOnly} onChange={e=> setIcpOnly(e.target.checked)} />
                <span className="meta" title="Limit results to songs tagged ICP">ICP only</span>
              </label>
            </div>
            <div style={{ minHeight:0, flex:'1 1 auto', overflow:'auto', marginTop:6 }}>
              {!fuse ? (
                <div>Loading search…</div>
              ) : (
                <div style={{ display:'grid', gap:'.5rem', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))' }}>
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
        </div>

        <div className="BuilderRight" style={{ minHeight:0, display:'flex', flexDirection:'column' }}>
          <div className="card" style={{ display:'flex', flexDirection:'column', flex:'1 1 auto', minHeight:0 }}>
          <strong>Current setlist ({list.length})</strong>
          <div style={{minHeight:0, flex:'1 1 auto', overflow:'auto', marginTop:6}}>
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
