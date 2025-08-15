import React, { useEffect, useMemo, useRef, useState } from 'react'
import { KEYS, parseChordPro } from '../utils/chordpro'
import { downloadZip } from '../utils/zip'
import * as GH from '../utils/github'
import AdminPrModal from '../components/admin/AdminPrModal'
import { showToast } from '../utils/toast'
import '../styles/admin.css'

const PASSWORD = import.meta.env.VITE_ADMIN_PW

const INITIAL_TEXT = `{title: }
{key: }
{authors: }
{country: }
{tags: Fast, Slow, Hymn, Holiday}
{youtube: }
{mp3: }
{pptx: }

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
    const title = meta.title || 'Untitled'
    setStaged(s => [...s, { filename, content: text, title, key: meta.key || '' }])
  }
  function stageDraft(i){
    const d = drafts[i]
    if(!d) return
    setStaged(s => [...s, { filename: d.filename, content: d.body, title: d.title, key: '' }])
  }
  function unstage(name){ setStaged(s => s.filter(f => f.filename !== name)) }
  function renameStaged(name, nextName){
    const safe = nextName.replace(/\.\w+$/, '') + '.chordpro'
    setStaged(s => s.map(f => f.filename === name ? { ...f, filename: safe } : f))
  }
  function setPerFileCommit(name, msg){
    setStaged(s => s.map(f => f.filename === name ? { ...f, commitMsg: msg } : f))
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
      <h1>Admin</h1>

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
          <select
            value={meta.key||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'key', e.target.value))}
          >
            <option value=""></option>
            {KEYS.map(k=> <option key={k} value={k}>{k}</option>)}
          </select>
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

        <label>PPTX (URL or /media/…)
          <input
            value={meta.pptx||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'pptx', e.target.value))}
          />
        </label>
      </div>

      {/* Editor + Preview */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10}}>
        <textarea
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

      {/* Draft actions */}
      <div style={{display:'flex', gap:8, alignItems:'center', marginTop:10}}>
        <button className="btn" onClick={addDraft}>Add to Drafts</button>
        <button className="btn" onClick={stageSong}>Stage Song</button>
        <button className="btn primary" onClick={exportDrafts} disabled={drafts.length===0}>Export Drafts (ZIP)</button>
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
