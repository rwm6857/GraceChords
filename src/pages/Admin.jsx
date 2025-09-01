import React, { useEffect, useMemo, useRef, useState } from 'react'
import { KEYS, parseChordPro, transposeSym } from '../utils/chordpro'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { serializeChordPro, kebab } from '../utils/chordpro/serialize'
import { convertToCanonicalChordPro, suggestCanonicalFilename } from '../utils/chordpro/convert'
import { lintChordPro } from '../utils/chordpro/lint'
import { downloadZip } from '../utils/zip'
import indexData from '../data/index.json'
import { fetchTextCached } from '../utils/fetchCache'
import * as GH from '../utils/github'
import AdminPrModal from '../components/admin/AdminPrModal'
import { showToast } from '../utils/toast'
import '../styles/admin.css'

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
        <label htmlFor="adminPw" className="sr-only">Password</label>
        <input
          id="adminPw"
          type="password"
          value={pw}
          onChange={e=> setPw(e.target.value)}
          placeholder="Password"
        />
        <button className="btn primary" style={{marginLeft:8}} onClick={()=> setOk(pw===PASSWORD)}>
          Enter
        </button>
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

  const id = (meta.id || (meta.title||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')).replace(/(^-|-$)/g,'')
  const filename = `${id||'untitled'}.chordpro`
  const parsed = useMemo(()=> parseChordPro(text||''), [text])

  function addDraft(){
    const title = meta.title || 'Untitled'
    setDrafts(d => [...d, { title, filename, body: text }])
    setText(INITIAL_TEXT)
  }
  function removeDraft(i){ setDrafts(d => d.filter((_,j)=> j!==i)) }
  function editDraft(i){
    const d = drafts[i]
    if(!d) return
    setText(d.body)
    setDrafts(ds => ds.filter((_,j)=> j!==i))
  }
  async function exportDrafts(){
    if(drafts.length===0) return
    const files = drafts.map(d => ({ path: `songs/${d.filename}`, content: d.body }))
    await downloadZip(files, { name: 'songs.zip' })
    if(window.confirm('Clear drafts?')) setDrafts([])
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

  const [staged, setStaged] = useState([])
  function stageSong(){
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
    const content = serializeChordPro(doc, { useDirectives: saveWithDirectives })
    const base = kebab(meta.id || doc.meta.title || 'untitled')
    const fname = editingFile || `${base}.chordpro`
    const willUpdate = items.some(it => it.filename === fname)
    const commitMsg = willUpdate ? `update: ${fname}` : `add: ${fname}`
    setStaged(s => [...s, { filename: fname, content, title: doc.meta.title || 'Untitled', key: doc.meta.key || '', commitMsg }])
    if (willUpdate) showToast?.(`Will update existing file: ${fname}`) ?? alert(`Will update existing file: ${fname}`)
  }

  function convertAndStage(){
    try {
      const { text: out, docTitle, docKey } = convertToCanonicalChordPro(text, {
        country: meta.country || '',
        tags: meta.tags || '',
        youtube: meta.youtube || '',
        mp3: meta.mp3 || ''
      })
      const fname = suggestCanonicalFilename(docTitle)
      setStaged(s => [...s, { filename: fname, content: out, title: docTitle, key: docKey || '' }])
      showToast?.(`Converted & staged: ${fname}`) ?? alert(`Converted & staged: ${fname}`)
    } catch (e) {
      showToast?.(String(e.message || e)) ?? alert(String(e.message || e))
    }
  }

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
    const content = serializeChordPro(doc, { useDirectives: saveWithDirectives })
    const base = kebab(doc.meta?.title || d.filename.replace(/\.\w+$/, ''))
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
  const items = (indexData?.items || [])
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

  async function openPrModal(){
    try {
      const { default_branch } = await GH.getRepoInfo({ owner: 'rwm6857', repo: 'GraceChords' })
      setDefaultBranch(default_branch || 'main')
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

      const pr = await GH.createPR({
        owner, repo,
        head: branchName,
        base: defaultBranch,
        title: prTitle,
        body: prBody,
      })
      showToast?.(`PR #${pr.number} created`) ?? alert(`PR #${pr.number} created`)
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
        <div className="Row" style={{ alignItems:'center', gap:8 }}>
          <strong>GitHub:</strong>
          <span>Token: {ghUser ? `@${ghUser.login}` : (localStorage.getItem('ghToken') ? 'set' : 'not set')}</span>
          <button className="btn" onClick={setToken}>Set token</button>
          <button className="btn" onClick={clearToken}>Clear token</button>
          <button className="btn" onClick={validateTokenNow}>Validate</button>
          <div className="spacer" />
          <button className="btn primary" disabled={!staged.length} onClick={openPrModal}>Create PR…</button>
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
        <table className="Table Small" style={{ width: '100%', marginTop: 8 }}>
          <thead>
            <tr><th>Filename</th><th>Title</th><th>Key</th><th>Commit message</th><th></th></tr>
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

      {/* Editor filename indicator */}
      <div className="Row Small" style={{ alignItems:'center', gap:8, marginTop:10 }}>
        <label>Filename
          <input
            readOnly
            value={editingFile || filename}
            title={editingFile ? 'Editing existing file' : 'Suggested filename'}
            style={{ marginLeft: 8, width: 320 }}
          />
        </label>
        {editingFile && (
          <span className="Small">(loaded from index — updates will overwrite this file)</span>
        )}
      </div>

      {/* Editor + Preview */}
      {/* Quick chord insert */}
      <div className="Row" style={{ alignItems:'center', gap:8, marginTop:10, flexWrap:'wrap' }}>
        <strong>Quick chords</strong>
        <span className="Small">(Key: {meta.key || 'G'})</span>
        {majorScaleChordSet(resolveQuickChordMajor(meta.key || 'G')).map(sym => (
          <button key={sym} className="btn small" onClick={()=> insertAtCursor(`[${sym}]`)} title={`Insert [${sym}]`}>
            {sym}
          </button>
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
          <button key={d.k} className="btn small" title={`Insert ${d.label} block`} onClick={() => {
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

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:6}}>
        <textarea
          ref={editorRef}
          value={text}
          onChange={e=> setText(e.target.value)}
          style={{width:'100%', minHeight:'60vh', fontFamily:'ui-monospace, Menlo, Consolas, monospace'}}
        />
        <div className='card' style={{minHeight:'60vh', overflow:'auto'}}>
          <strong>Preview</strong>
          <div style={{marginTop:8}}>
            {(parsed.blocks||[]).map((b,bi)=>(
              <div key={bi}>
                <div className="section">{b.section ? `[${b.section}]` : ''}</div>
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
      </div>

      {/* Save options */}
      <div className="Row Small" style={{gap:8, alignItems:'center', marginTop:10}}>
        <label><input type="checkbox" checked={saveWithDirectives} onChange={e=> setSaveWithDirectives(e.target.checked)} /> Save with ChordPro section directives</label>
        <label><input type="checkbox" checked={prefer2Col} onChange={e=> setPrefer2Col(e.target.checked)} /> Prefer 2 columns</label>
        <label><input type="checkbox" checked={showCapo} onChange={e=> setShowCapo(e.target.checked)} /> Capo in header</label>
        <label title="Always writes .chordpro extension"><input type="checkbox" checked readOnly /> Normalize to .chordpro</label>
      </div>

      {/* Draft actions */}
      <div style={{display:'flex', gap:8, alignItems:'center', marginTop:10}}>
        <button className="btn" onClick={lintCurrent}>Lint</button>
        <button className="btn" onClick={addDraft}>Add to Drafts</button>
        <button className="btn" onClick={stageSong}>Stage Song</button>
        <button className="btn" onClick={convertAndStage}>Convert → Stage</button>
        <button className="btn primary" onClick={exportDrafts} disabled={drafts.length===0}>Export Drafts (ZIP)</button>
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

      {drafts.length>0 && (
        <div className="card" style={{marginTop:10}}>
          <strong>Drafts</strong>
          <table style={{width:'100%', marginTop:8}}>
            <thead><tr><th style={{textAlign:'left'}}>Title</th><th style={{textAlign:'left'}}>File</th><th></th></tr></thead>
            <tbody>
              {drafts.map((d,i)=>(
                <tr key={i}>
                  <td>{d.title}</td>
                  <td>{d.filename}</td>
                  <td style={{textAlign:'right'}}>
                    <button className="btn" onClick={()=>stageDraft(i)} style={{marginRight:4}}>Stage</button>
                    <button className="btn" onClick={()=>editDraft(i)} style={{marginRight:4}}>Edit</button>
                    <button className="btn" onClick={()=>removeDraft(i)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{marginTop:10}}>
        <strong>Publish (docs/ Pages):</strong>
        <ol>
          <li>Unzip archive.</li>
          <li>Copy <code>songs/*.chordpro</code> to <code>public/songs/</code>.</li>
          <li>Merge entries into <code>src/data/index.json</code> (or run <code>npm run build-index</code>).</li>
          <li><code>npm run build</code> → outputs to <code>docs/</code>.</li>
        </ol>
      </div>
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
    const chordFontFamily = `'Noto Sans Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
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
              fontFamily: `'Noto Sans Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`,
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
  while((x = re.exec(t))){ m[x[1].trim().toLowerCase()] = x[2].trim() }
  return m
}
