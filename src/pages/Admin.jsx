import React, { useEffect, useMemo, useRef, useState } from 'react'
import { KEYS, transposeSym } from '../utils/chordpro'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { serializeChordPro, slugifyUnderscore } from '../utils/chordpro/serialize'
import { appendDisclaimerIfMissing } from '../utils/chordpro/disclaimer'
import { convertToCanonicalChordPro, suggestCanonicalFilename } from '../utils/chordpro/convert'
import { lintChordPro } from '../utils/chordpro/lint'
import { downloadZip } from '../utils/zip'
import indexData from '../data/index.json'
import { fetchTextCached } from '../utils/fetchCache'
import * as GH from '../utils/github'
import AdminPrModal from '../components/admin/AdminPrModal'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import { SearchIcon, PlusIcon, CloudUploadIcon, DownloadIcon } from '../components/Icons'
import { showToast } from '../utils/toast'
import '../styles/admin.css'
import Toolbar from '../components/ui/Toolbar'

const PASSWORD = import.meta.env.VITE_ADMIN_PW

const INITIAL_TEXT = `{title: }
{key: }
{authors: }
{country: }
{tags: }
{youtube: }
{mp3: }

Verse 1
[]`

export default function Admin(){
  const [ok, setOk] = useState(false)
  const [pw, setPw] = useState('')

  if(!ok){
    return (
      <div className="container" style={{maxWidth:480}}>
        <h1>Admin</h1>
        <p>Enter password to continue.</p>
        <Input id="adminPw" type="password" value={pw} onChange={e=> setPw(e.target.value)} placeholder="Password" />
        <div style={{marginTop:8}}>
          <Button variant="primary" onClick={()=> setOk(pw===PASSWORD)}>Enter</Button>
        </div>
      </div>
    )
  }
  return <AdminPanel />
}

function AdminPanel(){
  const [text, setText] = useState(INITIAL_TEXT)
  const [meta, setMeta] = useState({})
  useEffect(()=>{ setMeta(parseMeta(text)) },[text])
  const editorRef = useRef(null)

  const [saveWithDirectives, setSaveWithDirectives] = useState(true)
  const [prefer2Col, setPrefer2Col] = useState(false)
  const [showCapo, setShowCapo] = useState(true)
  const [showPreview, setShowPreview] = useState(() => {
    try { return localStorage.getItem('admin:showPreview') !== '0' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('admin:showPreview', showPreview ? '1' : '0') } catch {}
  }, [showPreview])

  const [persist, setPersist] = useState(() => localStorage.getItem('adminPersist') === '1')
  const [drafts, setDrafts] = useState(() => {
    if(localStorage.getItem('adminPersist') === '1'){
      try{ return JSON.parse(localStorage.getItem('adminDrafts')||'[]') }catch{}
    }
    return []
  })
  useEffect(() => {
    if(persist){ localStorage.setItem('adminDrafts', JSON.stringify(drafts)) }
  }, [drafts, persist])
  useEffect(() => {
    localStorage.setItem('adminPersist', persist ? '1' : '0')
    if(!persist) localStorage.removeItem('adminDrafts')
  }, [persist])

  const id = slugifyUnderscore(meta.id || meta.title || '')
  const filename = `${id || 'untitled'}.chordpro`
  const parsed = useMemo(() => {
    try {
      const doc = parseChordProOrLegacy(text || '')
      const blocks = (doc.sections || []).map(sec => ({
        section: sec.label,
        lines: (sec.lines || []).map(ln => ({
          text: ln.comment || ln.lyrics || '',
          chords: ln.chords || [],
          comment: !!ln.comment
        }))
      }))
      return { meta: doc.meta, blocks }
    } catch {
      return { meta: {}, blocks: [] }
    }
  }, [text])
  const quickChords = useMemo(() => majorScaleChordSet(resolveQuickChordMajor(meta.key || 'G')), [meta.key])

  function addDraft(){
    // Drafts feature deprecated in favor of staging. No-op retained for compatibility.
  }
  function removeDraft(i){ setDrafts(d => d.filter((_,j)=> j!==i)) }
  function editDraft(i){
    const d = drafts[i]
    if(!d) return
    setText(d.body)
    setDrafts(ds => ds.filter((_,j)=> j!==i))
  }
  async function exportDrafts(){
    // Export staged songs as a ZIP (replaces old drafts export)
    if(!staged || staged.length===0) return
    const files = staged.map(f => ({ path: `songs/${f.filename}`, content: f.content }))
    await downloadZip(files, { name: 'staged-songs.zip' })
  }

  const [ghUser, setGhUser] = useState(null)

  async function validateTokenNow(){
    try {
      const u = await GH.validateToken()
      setGhUser(u)
      showToast?.(`Token OK: ${u.login}`) ?? alert(`Token OK: ${u.login}`)
    } catch (e) {
      setGhUser(null)
      showToast?.(String(e.message || e)) ?? alert(String(e.message || e))
    }
  }
  function setToken(){
    const t = prompt('Paste GitHub token (repo scope):','')
    if(t !== null){ localStorage.setItem('ghToken', t.trim()) }
  }
  function clearToken(){
    localStorage.removeItem('ghToken')
    setGhUser(null)
  }

  const [staged, setStaged] = useState(() => {
    try { const s = sessionStorage.getItem('adminStaged'); return s ? JSON.parse(s) : [] } catch { return [] }
  })
  useEffect(() => {
    try {
      if (staged && staged.length) sessionStorage.setItem('adminStaged', JSON.stringify(staged))
      else sessionStorage.removeItem('adminStaged')
    } catch {}
  }, [staged])
  function stageSong(){
    // Try to convert into canonical ChordPro first (preferred); fallback to serializing current text
    try {
      const { text: out, docTitle, docKey } = convertToCanonicalChordPro(text, {
        country: meta.country || '',
        tags: meta.tags || '',
        youtube: meta.youtube || '',
        mp3: meta.mp3 || ''
      })
      const fname = suggestCanonicalFilename(docTitle)
      const final = appendDisclaimerIfMissing(out)
      setStaged(s => [...s, { filename: fname, content: final, title: docTitle, key: docKey || '' }])
      return
    } catch {}

    // Fallback: serialize parsed doc with directives as needed
    const doc = parseChordProOrLegacy(text)
    doc.meta.title = meta.title || doc.meta.title || ''
    doc.meta.key = meta.key || doc.meta.key || ''
    doc.meta.meta = {
      ...(doc.meta.meta || {}),
      authors: meta.authors || doc.meta.meta?.authors || '',
      country: meta.country || doc.meta.meta?.country || '',
      tags: meta.tags || doc.meta.meta?.tags || '',
      youtube: meta.youtube || doc.meta.meta?.youtube || '',
      mp3: meta.mp3 || doc.meta.meta?.mp3 || '',
    }
    if (prefer2Col) {
      doc.layoutHints = { ...(doc.layoutHints || {}), requestedColumns: 2 }
    }
    if (!showCapo) {
      doc.meta.meta = { ...(doc.meta.meta || {}), showcapo: '0' }
    }
    let content = serializeChordPro(doc, { useDirectives: saveWithDirectives })
    content = appendDisclaimerIfMissing(content)
    const base = slugifyUnderscore(meta.id || doc.meta.title || 'untitled')
    const fname = editingFile || `${base}.chordpro`
    const willUpdate = items.some(it => it.filename === fname)
    const commitMsg = willUpdate ? `update: ${fname}` : `add: ${fname}`
    setStaged(s => [...s, { filename: fname, content, title: doc.meta.title || 'Untitled', key: doc.meta.key || '', commitMsg }])
  }

  function convertAndStage(){ stageSong() }

  function lintCurrent(){
    try {
      const warnings = lintChordPro(text)
      if (!warnings.length) {
        showToast?.('No issues found.') ?? alert('No issues found.')
        return
      }
      const report = warnings.map(w => `${w.code}${w.sectionIndex!=null?` @section ${w.sectionIndex+1}`:''}${w.lineIndex!=null?`, line ${w.lineIndex+1}`:''}: ${w.message}`).join('\n')
      console.log('[ChordPro Lint]\n' + report)
      alert(`ChordPro Lint:\n\n${report}`)
    } catch (e) {
      showToast?.(String(e.message || e)) ?? alert(String(e.message || e))
    }
  }
  function stageDraft(i){
    const d = drafts[i]
    if(!d) return
    const doc = parseChordProOrLegacy(d.body)
    if (prefer2Col) {
      doc.layoutHints = { ...(doc.layoutHints || {}), requestedColumns: 2 }
    }
    if (!showCapo) {
      doc.meta.meta = { ...(doc.meta.meta || {}), showcapo: '0' }
    }
    let content = serializeChordPro(doc, { useDirectives: saveWithDirectives })
    content = appendDisclaimerIfMissing(content)
    const base = slugifyUnderscore(doc.meta?.title || d.filename.replace(/\.\w+$/, ''))
    const fname = editingFile || `${base}.chordpro`
    const willUpdate = items.some(it => it.filename === fname)
    const commitMsg = willUpdate ? `update: ${fname}` : `add: ${fname}`
    setStaged(s => [...s, { filename: fname, content, title: doc.meta.title || d.title, key: doc.meta.key || '', commitMsg }])
  }
  function unstage(name){ setStaged(s => s.filter(f => f.filename !== name)) }
  function renameStaged(name, nextName){
    const safe = nextName.replace(/\.\w+$/, '') + '.chordpro'
    setStaged(s => s.map(f => f.filename === name ? { ...f, filename: safe } : f))
  }
  function setPerFileCommit(name, msg){
    setStaged(s => s.map(f => f.filename === name ? { ...f, commitMsg: msg } : f))
  }

  // ---- Load existing song from index ----
  const items = useMemo(() => {
    const arr = indexData?.items || []
    const seen = new Set()
    const uniq = []
    for (const s of arr) { if (!seen.has(s.id)) { seen.add(s.id); uniq.push(s) } }
    return uniq
  }, [])
  const [editingFile, setEditingFile] = useState('')
  const [loadId, setLoadId] = useState('')
  async function loadExisting(){
    const it = items.find(s => String(s.id) === String(loadId))
    if (!it) return
    try {
      const base = ((import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/')
      const url = `${base}songs/${it.filename}`
      const body = await fetchTextCached(url)
      if (body) setText(body)
      setEditingFile(it.filename)
    } catch (e) {
      console.error(e)
      alert(`Failed to load ${it.filename}`)
    }
  }

  function insertAtCursor(snippet){
    const ta = editorRef.current
    if(!ta){ setText(t => (t || '') + snippet); return }
    const start = ta.selectionStart ?? 0
    const end = ta.selectionEnd ?? start
    setText(prev => {
      const before = prev.slice(0, start)
      const after = prev.slice(end)
      return before + snippet + after
    })
    // Restore caret after React update
    setTimeout(() => {
      try {
        ta.focus()
        const pos = start + snippet.length
        ta.setSelectionRange(pos, pos)
      } catch {}
    }, 0)
  }

  function majorScaleChordSet(keySym){
    // Build I, ii, iii, IV, V, vi chord symbols for given major key
    const scaleSemis = [0, 2, 4, 5, 7, 9] // I ii iii IV V vi
    const minorIdx = new Set([1,2,5])
    const k = String(keySym || '').toUpperCase()
    const i = KEYS.indexOf(k)
    const rootIndex = i >= 0 ? i : KEYS.indexOf('G') // default G
    const out = []
    for(let d=0; d<scaleSemis.length; d++){
      const idx = (rootIndex + scaleSemis[d]) % KEYS.length
      const base = KEYS[idx]
      out.push(minorIdx.has(d) ? `${base}m` : base)
    }
    return out
  }

  function resolveQuickChordMajor(inputKey){
    // Accept C, F#, Bb, Am, Dm, F#m etc. Use relative major for minor keys.
    const s = String(inputKey || '').trim()
    if (!s) return 'G'
    const m = /^([A-Ga-g][#b]?)(m|min)?$/i.exec(s)
    if (!m) return 'G'
    const root = transposeSym(m[1], 0) // normalize flats to sharps
    const idx = KEYS.indexOf(root)
    if (idx < 0) return 'G'
    const isMinor = !!m[2]
    const majorIdx = isMinor ? (idx + 3) % KEYS.length : idx
    return KEYS[majorIdx]
  }

  const [prOpen, setPrOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [defaultBranch, setDefaultBranch] = useState('main')
  const [editsAuthor, setEditsAuthor] = useState(() => {
    try { return localStorage.getItem('admin:editsAuthor') || '' } catch { return '' }
  })
  useEffect(() => {
    try { localStorage.setItem('admin:editsAuthor', editsAuthor || '') } catch {}
  }, [editsAuthor])

  // Hotkeys: Win/Linux Alt+1..6, macOS Ctrl+1..6 insert quick chords (in order)
  useEffect(() => {
    function onKey(e){
      const isMac = (() => {
        try {
          const plat = navigator.platform || ''
          const ua = navigator.userAgent || ''
          return /Mac|iPhone|iPad|iPod/i.test(plat || ua)
        } catch { return false }
      })()
      const modifierOk = isMac ? e.ctrlKey : e.altKey
      if (!modifierOk) return
      if (prOpen) return
      if (document.activeElement !== editorRef.current) return
      const k = e.key
      if (!/^([1-6])$/.test(k)) return
      e.preventDefault()
      const idx = parseInt(k, 10) - 1
      const sym = quickChords[idx]
      if (sym) insertAtCursor(`[${sym}]`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quickChords, prOpen])

  // Global hotkeys: Alt+1..6 insert quick chords in order
  useEffect(() => {
    function onKey(e){
      if (!e.altKey) return
      if (prOpen) return
      const k = e.key
      if (!/^([1-6])$/.test(k)) return
      e.preventDefault()
      const idx = parseInt(k, 10) - 1
      const sym = quickChords[idx]
      if (sym) insertAtCursor(`[${sym}]`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quickChords, prOpen])

  async function openPrModal(){
    try {
      const { default_branch } = await GH.getRepoInfo({ owner: 'rwm6857', repo: 'GraceChords' })
      setDefaultBranch(default_branch || 'main')
      if (!String(editsAuthor || '').trim()){
        const msg = 'Please enter your name in the Edits Author field before submitting.'
        showToast?.(msg) ?? alert(msg)
        return
      }
      setPrOpen(true)
    } catch (e) {
      showToast?.(String(e.message || e)) ?? alert(String(e.message || e))
    }
  }

  async function onCreatePr({ branchName, prTitle, prBody }){
    setBusy(true)
    try {
      const owner = 'rwm6857', repo = 'GraceChords'
      const { sha } = await GH.getRepoInfo({ owner, repo })
      await GH.createBranch({ owner, repo, fromSha: sha, newBranch: branchName })

      for(const f of staged){
        const path = `public/songs/${f.filename}`
        const existingSha = await GH.getFileSha({ owner, repo, path, ref: branchName })
        const msg = (f.commitMsg && f.commitMsg.trim()) ? f.commitMsg.trim() : `add: ${f.filename}`
        await GH.putFile({
          owner, repo, branch: branchName, path,
          contentBase64: GH.toBase64(f.content),
          message: msg,
          sha: existingSha,
        })
      }

      const appendedBody = `${prBody || ''}${prBody ? '\n\n' : ''}Submitted by: ${String(editsAuthor || '').trim()}`
      const pr = await GH.createPR({
        owner, repo,
        head: branchName,
        base: defaultBranch,
        title: prTitle,
        body: appendedBody,
      })
      // PR created; clear staged (and persisted copy) and open in a new tab for review
      try { sessionStorage.removeItem('adminStaged') } catch {}
      window.open(pr.html_url, '_blank', 'noopener')
      setStaged([])
      setPrOpen(false)
    } catch (e) {
      showToast?.(String(e.message || e)) ?? alert(String(e.message || e))
      throw e
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <a href="/" className="back">← Back</a>
        </div>
        <h1 style={{ margin: 0 }}>Admin</h1>
        <div />
      </div>

      <div className="card">
        <div className="Row" style={{ alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <strong>GitHub:</strong>
          <span>Token: {ghUser ? `@${ghUser.login}` : (localStorage.getItem('ghToken') ? 'set' : 'not set')}</span>
          <button className="btn" onClick={setToken}>Set token</button>
          <button className="btn" onClick={clearToken}>Clear token</button>
          <button className="btn" onClick={validateTokenNow}>Validate</button>
          <div className="spacer" />
          <label style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span>Edits Author <span aria-hidden style={{ color:'#ef4444' }}>*</span></span>
            <input
              value={editsAuthor}
              onChange={e=> setEditsAuthor(e.target.value)}
              placeholder="Your name"
              style={{ minWidth:180 }}
            />
          </label>
          {/* Publish moved to sticky toolbar */}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="Row" style={{ alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <strong>Load existing:</strong>
          <select value={loadId} onChange={e=> setLoadId(e.target.value)}>
            <option value="">— Choose a song —</option>
            {items.map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          <button className="btn" onClick={loadExisting} disabled={!loadId}>Load</button>
          {editingFile && (
            <span className="Small" style={{ marginLeft: 8 }}>
              Editing: <code>{editingFile}</code>
            </span>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="Row" style={{ alignItems:'center', gap:8 }}>
          <strong>Staged songs:</strong> {staged.length}
        </div>
        <div style={{ width:'100%', marginTop: 8, maxHeight: 240, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
          <table className="Table Small" style={{ width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--card)', boxShadow: '0 1px 0 var(--line)', zIndex: 1 }}>
              <tr><th style={{background:'inherit'}}>Filename</th><th style={{background:'inherit'}}>Title</th><th style={{background:'inherit'}}>Key</th><th style={{background:'inherit'}}>Commit message</th><th style={{background:'inherit'}}></th></tr>
            </thead>
            <tbody>
              {staged.map(s => (
                <tr key={s.filename}>
                  <td>
                    <input value={s.filename}
                      onChange={e => renameStaged(s.filename, e.target.value)}
                      style={{ width:'100%' }}/>
                  </td>
                  <td>{s.title || ''}</td>
                  <td>{s.key || ''}</td>
                  <td>
                    <input placeholder={`add: ${s.filename}`} value={s.commitMsg || ''}
                      onChange={e => setPerFileCommit(s.filename, e.target.value)}
                      style={{ width:'100%' }}/>
                  </td>
                  <td><button className="btn small" onClick={() => unstage(s.filename)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Metadata form */}
      <div className="card" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
        <label>Title
          <input
            value={meta.title||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'title', e.target.value))}
          />
        </label>

        <label>Original Key
          <input
            value={meta.key||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'key', e.target.value))}
            placeholder="e.g., C, Am, Dm, F#m"
          />
        </label>

        <label>Authors
          <input
            value={meta.authors||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'authors', e.target.value))}
          />
        </label>

        <label>Country
          <input
            value={meta.country||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'country', e.target.value))}
          />
        </label>

        <label>Tags
          <input
            value={meta.tags||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'tags', e.target.value))}
            placeholder="Fast, Slow, Hymn, Holiday"
          />
        </label>

        <label>YouTube (ID or URL)
          <input
            value={meta.youtube||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'youtube', e.target.value))}
            placeholder="e.g. dQw4w9WgXcQ or https://youtu.be/..."
          />
        </label>

        <label>MP3 (URL or /media/…)
          <input
            value={meta.mp3||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'mp3', e.target.value))}
          />
        </label>

        {/* PPTX linking is automatic via public/pptx/<slug>.pptx; no explicit field */}
      </div>

      {/* Editor filename indicator moved to sticky toolbar */}

      {/* Editor + Preview */}
      {/* Quick chord insert */}
      <div className="Row" style={{ alignItems:'center', gap:8, marginTop:10, flexWrap:'wrap' }}>
        <strong>Quick chords</strong>
        <span className="Small">(Key: {meta.key || 'G'})</span>
        {quickChords.map((sym, i) => (
          <button key={sym} className="gc-btn gc-btn--sm" onClick={()=> insertAtCursor(`[${sym}]`)} title={`Insert [${sym}] (Alt+${i+1} on Win/Linux, Ctrl+${i+1} on macOS)`}>{sym}</button>
        ))}
      </div>

      {/* Quick directives (short form for verse/chorus/bridge; long form for others) */}
      <div className="Row" style={{ alignItems:'center', gap:8, marginTop:6, flexWrap:'wrap' }}>
        <strong>Directives</strong>
        {[
          { k: 'verse',  label: 'Verse',  short: 'sov', end: 'eov' },
          { k: 'chorus', label: 'Chorus', short: 'soc', end: 'eoc' },
          { k: 'bridge', label: 'Bridge', short: 'sob', end: 'eob' },
          { k: 'intro',  label: 'Intro' },
          { k: 'tag',    label: 'Tag' },
          { k: 'outro',  label: 'Outro' },
        ].map(d => (
          <button key={d.k} className="gc-btn gc-btn--sm" title={`Insert ${d.label} block`} onClick={() => {
            const start = d.short ? `{${d.short} ${d.label}}\n` : `{start_of_${d.k}: ${d.label}}\n`
            const end = d.end ? `\n{${d.end}}` : `\n{end_of_${d.k}}`
            const ta = editorRef.current
            if (ta && ta.selectionStart !== undefined && ta.selectionEnd !== undefined && ta.selectionStart !== ta.selectionEnd) {
              const selStart = ta.selectionStart
              const selEnd = ta.selectionEnd
              setText(prev => prev.slice(0, selStart) + start + prev.slice(selStart, selEnd) + end + prev.slice(selEnd))
              setTimeout(() => {
                try { ta.focus(); ta.setSelectionRange(selStart + start.length, selEnd + start.length) } catch {}
              }, 0)
            } else {
              insertAtCursor(`${start}\n${end}`)
            }
          }}>
            {d.label}
          </button>
        ))}
      </div>

      <div style={{display:'grid', gridTemplateColumns: showPreview ? '1fr 1fr' : '1fr', gap:10, marginTop:6}}>
        <textarea
          ref={editorRef}
          value={text}
          onChange={e=> setText(e.target.value)}
          style={{width:'100%', minHeight:'60vh', fontFamily:'"Roboto Mono", ui-monospace, Menlo, Consolas, monospace', fontSize: showPreview ? undefined : 'calc(1rem + 2pt)'}}
        />
        {showPreview && (
          <div className='card' style={{minHeight:'60vh', overflow:'auto'}}>
            <strong>Preview</strong>
            <div className="Small" style={{ marginTop:6, fontFamily:'"Roboto Mono", ui-monospace, Menlo, Consolas, monospace' }}>
              {(() => {
                const kv = {
                  title: parsed?.meta?.title,
                  key: parsed?.meta?.key || parsed?.meta?.originalkey,
                  capo: parsed?.meta?.capo,
                  authors: parsed?.meta?.meta?.authors,
                  country: parsed?.meta?.meta?.country,
                  tags: parsed?.meta?.meta?.tags,
                  youtube: parsed?.meta?.meta?.youtube,
                  mp3: parsed?.meta?.meta?.mp3,
                }
                return Object.entries(kv)
                  .filter(([,v]) => v != null && String(v).trim() !== '')
                  .map(([k,v]) => (
                    <div key={k}><strong>{k}</strong>: {String(v)}</div>
                  ))
              })()}
            </div>
            <div style={{marginTop:8}}>
              {(parsed.blocks||[]).map((b,bi)=>(
                <div key={bi}>
                  <div className="section">{b.section || ''}</div>
                  {(b.lines||[]).map((ln,li)=>(
                    <MeasuredPreviewLine
                      key={`${bi}-${li}`}
                      plain={ln.text}
                      chords={ln.chords || []}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Save options */}
      <div className="Row Small" style={{gap:8, alignItems:'center', marginTop:10}}>
        <label><input type="checkbox" checked={saveWithDirectives} onChange={e=> setSaveWithDirectives(e.target.checked)} /> Save with ChordPro section directives</label>
        <label><input type="checkbox" checked={prefer2Col} onChange={e=> setPrefer2Col(e.target.checked)} /> Prefer 2 columns</label>
        <label><input type="checkbox" checked={showCapo} onChange={e=> setShowCapo(e.target.checked)} /> Capo in header</label>
        <span className="Small" title="Files are always saved with a .chordpro extension">Saves as .chordpro</span>
        <label style={{marginLeft:'auto'}}><input type="checkbox" checked={showPreview} onChange={e=> setShowPreview(e.target.checked)} /> Preview</label>
      </div>

      {/* Draft actions */}
      <div style={{display:'flex', gap:8, alignItems:'center', marginTop:10}}>
        <button className="gc-btn" onClick={lintCurrent} title="Run checks"><SearchIcon /> Check</button>
        <button className="gc-btn" onClick={()=> { setEditingFile(''); setText(INITIAL_TEXT) }} title="Clear editor and start a new song"><PlusIcon /> New song</button>
        <button className="gc-btn" onClick={stageSong} title="Convert and stage song"><PlusIcon /> Stage</button>
        <button className="gc-btn gc-btn--primary" onClick={exportDrafts} disabled={!staged.length}><DownloadIcon /> Download Staged (ZIP)</button>
        {editingFile ? (
          <span className="badge" style={{ background:'#fde68a', color:'#92400e' }} title="Editing existing file">
            Editing existing
          </span>
        ) : (
          <span className="badge" style={{ background:'#d1fae5', color:'#065f46' }} title="New file will be created">
            New song
          </span>
        )}
        <label style={{display:'flex', alignItems:'center', gap:4}}>
          <input type="checkbox" checked={persist} onChange={e=> setPersist(e.target.checked)} />
          Keep drafts in browser
        </label>
      </div>

      {/* Drafts section removed; staging is the single source of truth. */}

      <div className="card" style={{marginTop:10}}>
        <strong>Publish Guide</strong>
        <div className="Small" style={{marginTop:6}}>
          <div><strong>Preferred (Pull Request)</strong></div>
          <ol>
            <li>Stage songs using <em>Stage</em>.</li>
            <li>Enter your name in <em>Edits Author</em>.</li>
            <li>Click <em>Publish</em> in the sticky toolbar to open a PR.</li>
            <li>Merge the PR after review. CI updates the site.</li>
          </ol>
          <div style={{marginTop:8}}><strong>Manual (ZIP)</strong></div>
          <ol>
            <li>Stage songs using <em>Stage</em>.</li>
            <li>Click <em>Download</em> to save <code>staged-songs.zip</code>.</li>
            <li>Unzip and copy <code>songs/*.chordpro</code> into <code>public/songs/</code>.</li>
            <li>Run <code>npm run build-index</code> to refresh <code>src/data/index.json</code>.</li>
            <li>Run <code>npm run build</code> to update <code>docs/</code> and deploy.</li>
          </ol>
        </div>
      </div>
      <Toolbar style={{ position:'sticky', bottom: 0, marginTop: 12, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
        {/* Left group */}
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button className="gc-btn" onClick={()=> { setEditingFile(''); setText(INITIAL_TEXT) }}><PlusIcon /> New</button>
          <button className="gc-btn" onClick={lintCurrent}><SearchIcon /> Check</button>
          <button className="gc-btn" onClick={stageSong}><PlusIcon /> Stage</button>
        </div>
        {/* Center: filename + status */}
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
          <label className="Small" style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span>Filename</span>
            <input
              readOnly
              value={editingFile || (slugifyUnderscore(meta.id || meta.title || '') + '.chordpro')}
              title={editingFile ? 'Editing existing file' : 'Suggested filename'}
              style={{ width: 320 }}
            />
          </label>
          {editingFile ? (
            <span className="badge" style={{ background:'#fde68a', color:'#92400e' }} title="Editing existing file">Editing</span>
          ) : (
            <span className="badge" style={{ background:'#d1fae5', color:'#065f46' }} title="New file will be created">New</span>
          )}
        </div>
        {/* Right group */}
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button className="gc-btn gc-btn--primary" onClick={exportDrafts} disabled={!staged.length}><DownloadIcon /> Download</button>
          <button className="gc-btn gc-btn--primary" onClick={openPrModal} disabled={!staged.length}><CloudUploadIcon /> Publish</button>
        </div>
      </Toolbar>
      <AdminPrModal
        open={prOpen}
        onClose={() => setPrOpen(false)}
        defaultBranch={defaultBranch}
        staged={staged}
        onCreate={onCreatePr}
        busy={busy}
      />
    </div>
  )
}

/** Preview line with pixel-measured chord overlay (matches Song View’s alignment rule) */
function MeasuredPreviewLine({ plain, chords }){
  const hostRef = useRef(null)
  const canvasRef = useRef(null)
  const [state, setState] = useState({ offsets: [], padTop: 0, chordTop: 0 })

  useEffect(()=>{
    if(!hostRef.current) return
    if(!canvasRef.current){
      const cv = document.createElement('canvas')
      cv.width = 1; cv.height = 1
      canvasRef.current = cv
    }
    const ctx = canvasRef.current.getContext('2d')

    const lyr = hostRef.current.querySelector('.lyrics')
    const cs = window.getComputedStyle(lyr)

    // Measure with lyrics font (critical alignment rule)
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const offsets = (chords || []).map(c => ({
      left: ctx.measureText(plain.slice(0, c.index)).width,
      sym: c.sym
    }))

    // Estimate chord ascent with mono bold (for reserved space)
    const chordFontFamily = `'Fira Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    const chordFontSize = cs.fontSize
    ctx.font = `${cs.fontStyle} 700 ${chordFontSize} ${chordFontFamily}`
    const chordM = ctx.measureText('Mg')
    const chordAscent = chordM.actualBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8

    const gap = 4
    const padTop = Math.ceil(chordAscent + gap)
    const chordTop = 0
    setState({ offsets, padTop, chordTop })
  }, [plain, chords])

  return (
    <div ref={hostRef} style={{position:'relative', marginBottom:10, paddingTop: state.padTop}}>
      {state.offsets.length>0 && (
        <div aria-hidden className="chord-layer" style={{position:'absolute', left:0, right:0, top: state.chordTop}}>
          {state.offsets.map((c, i)=>(
            <span key={i} style={{
              position:'absolute',
              left: `${c.left}px`,
              fontFamily: `'Fira Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`,
              fontWeight: 700
            }}>{c.sym}</span>
          ))}
        </div>
      )}
      <div className="lyrics">{plain}</div>
    </div>
  )
}

// Insert or update a {key: value} meta line in the ChordPro text
function setOrInsertMeta(text, key, value){
  const re = new RegExp(`\\{\\s*${key}\\s*:[^}]*\\}`, 'i')
  if(re.test(text)) return text.replace(re, `{${key}: ${value}}`)
  if(/\{\s*title\s*:[^}]*\}/i.test(text)){
    return text.replace(/\{\s*title\s*:[^}]*\}\s*/, m => m + `\n{${key}: ${value}}\n`)
  }
  return `{${key}: ${value}}\n` + text
}

function parseMeta(t){
  const m = {}
  const re = /^\{\s*([^:}]+)\s*:\s*([^}]*)\s*\}\s*$/gm
  let x
  while((x = re.exec(t))){
    const key = x[1].trim().toLowerCase()
    const val = x[2] // preserve spaces as typed
    m[key] = val
  }
  return m
}
