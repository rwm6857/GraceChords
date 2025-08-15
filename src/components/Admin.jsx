import React, { useEffect, useMemo, useRef, useState } from 'react'
import { KEYS, parseChordPro } from '../utils/chordpro'
import { downloadZip } from '../utils/zip'
import * as GH from '../utils/github'

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

  return (
    <div className="container">
      <h1>Admin</h1>

      <div style={{display:'flex', gap:8, marginBottom:10}}>
        <button className="btn" onClick={() => {
          const t = prompt('Paste GitHub Personal Access Token (PAT):')
          if(t !== null){
            localStorage.setItem('ghToken', t.trim())
            alert(t.trim() ? 'Token saved locally.' : 'Token cleared.')
          }
        }}>Set GitHub token</button>

        <button className="btn primary" onClick={async () => {
          try {
            const files = drafts.length
              ? drafts.map(d => ({ filename: d.filename, content: d.body, title: d.title }))
              : [{ filename, content: text, title: meta.title || '' }]

            if(!files.length){ alert('Nothing to commit.'); return }

            const now = new Date()
            const defaultBranchName = `song-upload-${now.toISOString().slice(0,19).replace(/[:T]/g,'-')}`
            const branch = prompt('Branch name:', defaultBranchName) || defaultBranchName
            const prTitle = prompt('PR Title:', `Add ${files.length} songs (${now.toISOString().slice(0,10)})`) || `Add ${files.length} songs`
            const commitMsg = prompt('Commit message (per file):', 'add: <filename>') || 'add: <filename>'

            const owner = 'rwm6857', repo = 'GraceChords'
            const { default_branch, sha } = await GH.getRepoInfo({ owner, repo })
            await GH.createBranch({ owner, repo, fromSha: sha, newBranch: branch })

            for(const f of files){
              const path = `public/songs/${f.filename}`
              const existingSha = await GH.getFileSha({ owner, repo, path, ref: branch })
              const msg = commitMsg.includes('<filename>') ? commitMsg.replace('<filename>', f.filename) : commitMsg
              await GH.putFile({
                owner, repo, branch, path,
                contentBase64: GH.toBase64(f.content),
                message: msg,
                sha: existingSha,
              })
            }

            const body = files.map(f => `- ${f.filename}${f.title ? ` — ${f.title}` : ''}`).join('\\n')
            const pr = await GH.createPR({
              owner, repo,
              head: branch,
              base: default_branch,
              title: prTitle,
              body,
            })

            alert(`PR #${pr.number} opened`)
            window.open(pr.html_url, '_blank', 'noopener')
          } catch (err) {
            console.error(err)
            alert(`PR failed: ${err?.message || err}`)
          }
        }}>Create PR</button>
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
