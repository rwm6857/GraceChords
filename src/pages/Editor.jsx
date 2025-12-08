import React, { useEffect, useMemo, useRef, useState } from 'react'
import indexData from '../data/index.json'
import { ResourceEditor } from './AdminResources.jsx'
import { KEYS, keyRoot } from '../utils/chordpro'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { serializeChordPro, slugifyUnderscore } from '../utils/chordpro/serialize'
import { convertToCanonicalChordPro, suggestCanonicalFilename } from '../utils/chordpro/convert'
import { appendDisclaimerIfMissing } from '../utils/chordpro/disclaimer'
import { formatInstrumental } from '../utils/instrumental'
import { fetchTextCached } from '../utils/fetchCache'
import * as GH from '../utils/github'
import AdminPrModal from '../components/admin/AdminPrModal'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Toolbar from '../components/ui/Toolbar'
import { CloudUploadIcon, PlusIcon, SearchIcon, TrashIcon } from '../components/Icons'
import { showToast } from '../utils/toast'
import '../styles/admin.css'

const EDITOR_PASSWORD = import.meta.env.VITE_EDITOR_PW || import.meta.env.VITE_ADMIN_PW || ''

const INITIAL_TEXT = `{title: }
{key: }
{authors: }
{country: }
{tags: }
{youtube: }
{mp3: }

`

export default function Editor(){
  const [authorName, setAuthorName] = useState(() => {
    try { return localStorage.getItem('editor:author') || '' } catch { return '' }
  })
  const [pw, setPw] = useState('')
  const [isAuthed, setIsAuthed] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    try { localStorage.setItem('editor:author', authorName || '') } catch {}
  }, [authorName])

  function submit(e){
    e.preventDefault()
    setError('')
    if(!authorName.trim()){
      setError('Author name is required.')
      return
    }
    if(pw === EDITOR_PASSWORD){
      setIsAuthed(true)
    }else{
      setError('Invalid password.')
    }
  }

  if(!isAuthed){
    return (
      <div className="container" style={{ maxWidth: 520 }}>
        <h1>GraceChords Editor</h1>
        <p>Enter your author name and password to continue.</p>
        <form onSubmit={submit} className="card" style={{ display:'grid', gap:10, padding:16 }}>
          <label>Author name
            <Input value={authorName} onChange={e=> setAuthorName(e.target.value)} placeholder="Your name" required />
          </label>
          <label>Password
            <Input type="password" value={pw} onChange={e=> setPw(e.target.value)} placeholder="Password" required />
          </label>
          {error ? <div className="alert error Small">{error}</div> : null}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <Button variant="primary" type="submit">Enter</Button>
          </div>
        </form>
      </div>
    )
  }

  return <EditorPanel authorName={authorName.trim()} />
}

function EditorPanel({ authorName }){
  const [activeTab, setActiveTab] = useState('songs')
  const [staged, setStaged] = useState(() => {
    try {
      const raw = sessionStorage.getItem('editor:staged')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      if (staged.length) {
        sessionStorage.setItem('editor:staged', JSON.stringify(staged))
      } else {
        sessionStorage.removeItem('editor:staged')
      }
    } catch {}
  }, [staged])

  const [prOpen, setPrOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [defaultBranch, setDefaultBranch] = useState('main')
  const [ghUser, setGhUser] = useState(null)

  function onStageSong(items){
    if(!items?.length) return
    setStaged(s => [...s, ...items])
  }
  function onStagePost(items){
    if(!items?.length) return
    setStaged(s => [...s, ...items])
  }
  function removeStaged(idx){
    setStaged(s => s.filter((_, i) => i !== idx))
  }
  function clearStaged(){
    setStaged([])
  }

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

  async function openPrModal(){
    if(!staged.length){
      showToast?.('Stage at least one change first.') ?? alert('Stage at least one change first.')
      return
    }
    if(!authorName){
      showToast?.('Author name required to open a PR.') ?? alert('Author name required to open a PR.')
      return
    }
    try {
      const { default_branch } = await GH.getRepoInfo({ owner: 'rwm6857', repo: 'GraceChords' })
      setDefaultBranch(default_branch || 'main')
      setPrOpen(true)
    } catch (e) {
      showToast?.(String(e.message || e)) ?? alert(String(e.message || e))
    }
  }

  async function createEditorPr({ branchName, prTitle, prBody }){
    setBusy(true)
    try {
      const owner = 'rwm6857'
      const repo = 'GraceChords'
      const { sha } = await GH.getRepoInfo({ owner, repo })
      await GH.createBranch({ owner, repo, fromSha: sha, newBranch: branchName })

      for(const item of staged){
        if(item.action === 'delete-request') continue
        const basePath = item.kind === 'song' ? 'public/songs' : 'public/resources'
        const path = `${basePath}/${item.filename}`
        const existingSha = await GH.getFileSha({ owner, repo, path, ref: branchName })
        const msg = item.action === 'add' ? `add: ${item.filename}` : `update: ${item.filename}`
        await GH.putFile({
          owner,
          repo,
          branch: branchName,
          path,
          contentBase64: GH.toBase64(item.content || ''),
          message: msg,
          sha: existingSha,
        })
      }

      const pr = await GH.createPR({
        owner,
        repo,
        head: branchName,
        base: defaultBranch,
        title: prTitle,
        body: prBody,
      })
      try { sessionStorage.removeItem('editor:staged') } catch {}
      setStaged([])
      setPrOpen(false)
      window.open(pr.html_url, '_blank', 'noopener')
    } catch (e) {
      showToast?.(String(e.message || e)) ?? alert(String(e.message || e))
      throw e
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom: 8 }}>
        <div>
          <h1 style={{ margin: 0 }}>GraceChords Editor</h1>
          <div className="Small">Author: {authorName}</div>
        </div>
        <div className="Row Small" style={{ gap:8 }}>
          <strong>GitHub:</strong>
          <span>Token: {ghUser ? `@${ghUser.login}` : (localStorage.getItem('ghToken') ? 'set' : 'not set')}</span>
          <button className="btn" onClick={setToken}>Set token</button>
          <button className="btn" onClick={clearToken}>Clear</button>
          <button className="btn" onClick={validateTokenNow}>Validate</button>
        </div>
      </div>

      <div className="card" style={{ display:'flex', gap:8, marginBottom:12 }}>
        <button className={`gc-btn ${activeTab==='songs' ? 'gc-btn--primary' : ''}`} onClick={()=> setActiveTab('songs')}>Songs</button>
        <button className={`gc-btn ${activeTab==='posts' ? 'gc-btn--primary' : ''}`} onClick={()=> setActiveTab('posts')}>Posts</button>
      </div>

      {activeTab === 'songs' ? (
        <SongsEditor onStageSong={onStageSong} />
      ) : (
        <PostsEditor onStagePost={onStagePost} />
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="Row" style={{ alignItems:'center', gap:8 }}>
          <strong>Staged changes</strong>
          <span className="Small">({staged.length})</span>
          <div className="spacer" />
          <Button onClick={clearStaged} disabled={!staged.length}>Clear all</Button>
          <Button className="gc-btn gc-btn--primary" onClick={openPrModal} disabled={!staged.length}>
            <CloudUploadIcon /> Open PR
          </Button>
        </div>
        <div style={{ width:'100%', marginTop: 8, overflow:'auto' }}>
          <table className="Table Small" style={{ width:'100%' }}>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Action</th>
                <th>Title</th>
                <th>Filename</th>
                <th>Details</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {staged.map((s, idx) => (
                <tr key={`${s.filename}-${idx}`}>
                  <td>{s.kind}</td>
                  <td>{s.action}</td>
                  <td>{s.title}</td>
                  <td><code>{s.filename}</code></td>
                  <td>
                    {s.changeSummary || s.deleteReason || ''}
                  </td>
                  <td>
                    <button className="btn small" onClick={()=> removeStaged(idx)}>Remove</button>
                  </td>
                </tr>
              ))}
              {!staged.length && (
                <tr>
                  <td colSpan={6} className="Small" style={{ textAlign:'center', padding: 12 }}>Nothing staged yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AdminPrModal
        open={prOpen}
        onClose={() => setPrOpen(false)}
        defaultBranch={defaultBranch}
        staged={staged}
        authorName={authorName}
        onCreate={createEditorPr}
        busy={busy}
      />
    </div>
  )
}

function SongsEditor({ onStageSong }){
  const [text, setText] = useState(INITIAL_TEXT)
  const [meta, setMeta] = useState({})
  useEffect(() => { setMeta(parseMeta(text)) }, [text])
  const editorRef = useRef(null)

  const [showPreview, setShowPreview] = useState(() => {
    try { return localStorage.getItem('editor:showPreview') !== '0' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('editor:showPreview', showPreview ? '1' : '0') } catch {}
  }, [showPreview])

  const items = useMemo(() => {
    const arr = indexData?.items || []
    const seen = new Set()
    const uniq = []
    for (const s of arr) {
      if (!seen.has(s.id)) { seen.add(s.id); uniq.push(s) }
    }
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
    setTimeout(() => {
      try {
        ta.focus()
        const pos = start + snippet.length
        ta.setSelectionRange(pos, pos)
      } catch {}
    }, 0)
  }

  function majorScaleChordSet(keySym){
    const scaleSemis = [0, 2, 4, 5, 7, 9]
    const minorIdx = new Set([1,2,5])
    const k = String(keySym || '').toUpperCase()
    const i = KEYS.indexOf(k)
    const rootIndex = i >= 0 ? i : KEYS.indexOf('G')
    const out = []
    for(let d=0; d<scaleSemis.length; d++){
      const idx = (rootIndex + scaleSemis[d]) % KEYS.length
      const base = KEYS[idx]
      out.push(minorIdx.has(d) ? `${base}m` : base)
    }
    return out
  }

  function resolveQuickChordMajor(inputKey){
    const s = String(inputKey || '').trim()
    if (!s) return 'G'
    const m = /^([A-Ga-g][#b]?)(m|min)?$/i.exec(s)
    if (!m) return 'G'
    const root = keyRoot(m[1])
    const idx = KEYS.indexOf(root)
    if (idx < 0) return 'G'
    const isMinor = !!m[2]
    const majorIdx = isMinor ? (idx + 3) % KEYS.length : idx
    return KEYS[majorIdx]
  }

  const parsed = useMemo(() => {
    try {
      const doc = parseChordProOrLegacy(text || '')
      const blocks = (doc.sections || []).map(sec => ({
        section: sec.label,
        lines: (sec.lines || []).map(ln => ({
          text: ln.instrumental ? '' : (ln.comment || ln.lyrics || ''),
          chords: ln.instrumental ? [] : (ln.chords || []),
          comment: !!ln.comment,
          instrumental: ln.instrumental || null,
        }))
      }))
      return { meta: doc.meta, blocks }
    } catch {
      return { meta: {}, blocks: [] }
    }
  }, [text])
  const quickChords = useMemo(() => majorScaleChordSet(resolveQuickChordMajor(meta.key || 'G')), [meta.key])

  const [changeSummary, setChangeSummary] = useState('')
  const [deleteReason, setDeleteReason] = useState('')

  function newSong(){
    setEditingFile('')
    setText(INITIAL_TEXT)
    setLoadId('')
    setChangeSummary('')
    setDeleteReason('')
  }

  function buildSongFile(){
    try {
      const { text: out, docTitle, docKey } = convertToCanonicalChordPro(text, {
        country: meta.country || '',
        tags: meta.tags || '',
        youtube: meta.youtube || '',
        mp3: meta.mp3 || ''
      })
      const fname = editingFile || suggestCanonicalFilename(docTitle)
      const final = appendDisclaimerIfMissing(out)
      return { filename: fname, title: docTitle || meta.title || 'Untitled', content: final, key: docKey || meta.key || '' }
    } catch {}

    try {
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
      let content = serializeChordPro(doc, { useDirectives: true })
      content = appendDisclaimerIfMissing(content)
      const base = slugifyUnderscore(meta.id || doc.meta.title || 'untitled')
      const fname = editingFile || `${base}.chordpro`
      return { filename: fname, title: doc.meta.title || 'Untitled', content, key: doc.meta.key || '' }
    } catch (e) {
      console.error(e)
      return null
    }
  }

  function stageAdd(){
    const built = buildSongFile()
    if (!built) return
    if (editingFile) {
      showToast?.('Use "Stage Edit" for existing songs.') ?? alert('Use "Stage Edit" for existing songs.')
      return
    }
    onStageSong([{
      kind: 'song',
      action: 'add',
      title: built.title,
      filename: built.filename,
      content: built.content,
    }])
  }

  function stageEdit(){
    if(!editingFile){
      showToast?.('Load an existing song to stage an edit.') ?? alert('Load an existing song to stage an edit.')
      return
    }
    const built = buildSongFile()
    if (!built) return
    onStageSong([{
      kind: 'song',
      action: 'edit',
      title: built.title,
      filename: built.filename,
      content: built.content,
      changeSummary: changeSummary || '',
    }])
  }

  function stageDelete(){
    if(!editingFile){
      showToast?.('Load an existing song to request deletion.') ?? alert('Load an existing song to request deletion.')
      return
    }
    onStageSong([{
      kind: 'song',
      action: 'delete-request',
      title: meta.title || 'Untitled',
      filename: editingFile,
      deleteReason: deleteReason || '',
    }])
  }

  return (
    <div className="card">
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

      <div className="card" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop: 12}}>
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
      </div>

      <div className="Row" style={{ alignItems:'center', gap:8, marginTop:10, flexWrap:'wrap' }}>
        <strong>Quick chords</strong>
        <span className="Small">(Key: {meta.key || 'G'})</span>
        {quickChords.map((sym, i) => (
          <button key={sym} className="gc-btn gc-btn--sm" onClick={()=> insertAtCursor(`[${sym}]`)} title={`Insert [${sym}] (Alt+${i+1})`}>{sym}</button>
        ))}
      </div>

      <div style={{display:'grid', gridTemplateColumns: showPreview ? '1fr 1fr' : '1fr', gap:10, marginTop:6}}>
        <textarea
          ref={editorRef}
          value={text}
          onChange={e=> setText(e.target.value)}
          style={{width:'100%', minHeight:'60vh', fontFamily:'\"Roboto Mono\", ui-monospace, Menlo, Consolas, monospace', fontSize: showPreview ? undefined : 'calc(1rem + 2pt)'}}
        />
        {showPreview && (
          <div className='card' style={{minHeight:'60vh', overflow:'auto'}}>
            <strong>Preview</strong>
            <div className="Small" style={{ marginTop:6, fontFamily:'\"Roboto Mono\", ui-monospace, Menlo, Consolas, monospace' }}>
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
                    ln.instrumental ? (
                      <InstrumentalPreviewLine key={`${bi}-${li}`} spec={ln.instrumental} />
                    ) : (
                      <MeasuredPreviewLine
                        key={`${bi}-${li}`}
                        plain={ln.text}
                        chords={ln.chords || []}
                        comment={ln.comment}
                      />
                    )
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="Row Small" style={{gap:8, alignItems:'center', marginTop:10}}>
        <span className="Small">Saves as .chordpro</span>
        <label style={{marginLeft:'auto'}}><input type="checkbox" checked={showPreview} onChange={e=> setShowPreview(e.target.checked)} /> Preview</label>
      </div>

      <Toolbar style={{ position:'sticky', bottom: 0, marginTop: 12, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button className="gc-btn" onClick={newSong}><PlusIcon /> New</button>
          <button className="gc-btn" onClick={stageAdd} disabled={!!editingFile}><PlusIcon /> Stage Add</button>
        </div>
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
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <label className="Small" style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span>What changed?</span>
            <input value={changeSummary} onChange={e=> setChangeSummary(e.target.value)} placeholder="Metadata, key, content…" disabled={!editingFile} />
          </label>
          <button className="gc-btn gc-btn--primary" onClick={stageEdit} disabled={!editingFile}><SearchIcon /> Stage Edit</button>
          <label className="Small" style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span>Removal reason</span>
            <input value={deleteReason} onChange={e=> setDeleteReason(e.target.value)} placeholder="Why remove this song?" disabled={!editingFile} />
          </label>
          <button className="gc-btn gc-btn--primary" onClick={stageDelete} disabled={!editingFile}><TrashIcon /> Stage Deletion</button>
        </div>
      </Toolbar>
    </div>
  )
}

function PostsEditor({ onStagePost }){
  const [draft, setDraft] = useState(null)
  const [changeSummary, setChangeSummary] = useState('')
  const [deleteReason, setDeleteReason] = useState('')

  function stageAdd(currentDraft){
    if(!currentDraft) return
    if(currentDraft.isExisting){
      showToast?.('Use Stage Edit for existing posts.') ?? alert('Use Stage Edit for existing posts.')
      return
    }
    onStagePost([{
      kind: 'post',
      action: 'add',
      title: currentDraft.meta?.title || 'Untitled',
      filename: currentDraft.filename,
      content: currentDraft.content,
    }])
  }

  function stageEdit(currentDraft){
    if(!currentDraft?.isExisting){
      showToast?.('Load an existing post to stage an edit.') ?? alert('Load an existing post to stage an edit.')
      return
    }
    onStagePost([{
      kind: 'post',
      action: 'edit',
      title: currentDraft.meta?.title || 'Untitled',
      filename: currentDraft.filename,
      content: currentDraft.content,
      changeSummary: changeSummary || '',
    }])
  }

  function stageDelete(currentDraft){
    if(!currentDraft?.isExisting){
      showToast?.('Load an existing post to request deletion.') ?? alert('Load an existing post to request deletion.')
      return
    }
    onStagePost([{
      kind: 'post',
      action: 'delete-request',
      title: currentDraft.meta?.title || 'Untitled',
      filename: currentDraft.filename,
      deleteReason: deleteReason || '',
    }])
  }

  return (
    <ResourceEditor
      heading="Posts"
      showGhTools={false}
      wrapInContainer={false}
      onDraftChange={setDraft}
      actions={({ draft: currentDraft, newPost }) => {
        const d = currentDraft || draft
        return (
          <Toolbar style={{ position:'sticky', bottom: 0, marginTop: 12, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <Button onClick={newPost}><PlusIcon /> New</Button>
              <Button onClick={()=> stageAdd(d)} disabled={!d}><PlusIcon /> Stage Add</Button>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
              <label className="Small" style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span>Filename</span>
                <input readOnly value={d?.filename || ''} style={{ width: 240 }} placeholder="slug.md" />
              </label>
              {d?.isExisting ? (
                <span className="badge" style={{ background:'#fde68a', color:'#92400e' }} title="Editing existing file">Editing</span>
              ) : (
                <span className="badge" style={{ background:'#d1fae5', color:'#065f46' }} title="New file will be created">New</span>
              )}
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <label className="Small" style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span>What changed?</span>
                <input value={changeSummary} onChange={e=> setChangeSummary(e.target.value)} placeholder="Content, tags…" disabled={!d?.isExisting} />
              </label>
              <Button className="gc-btn gc-btn--primary" onClick={()=> stageEdit(d)} disabled={!d?.isExisting}><SearchIcon /> Stage Edit</Button>
              <label className="Small" style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span>Removal reason</span>
                <input value={deleteReason} onChange={e=> setDeleteReason(e.target.value)} placeholder="Why remove this post?" disabled={!d?.isExisting} />
              </label>
              <Button className="gc-btn gc-btn--primary" onClick={()=> stageDelete(d)} disabled={!d?.isExisting}><TrashIcon /> Stage Deletion</Button>
            </div>
          </Toolbar>
        )
      }}
    />
  )
}

function InstrumentalPreviewLine({ spec }){
  const rows = formatInstrumental(spec || {}, { split: false })
  if (!rows.length) return null
  return (
    <div style={{ marginBottom: 10 }}>
      {rows.map((line, idx) => (
        <div
          key={idx}
          style={{
            whiteSpace: 'pre',
            fontFamily: `'Fira Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`,
            fontWeight: 700,
            fontSize: 'inherit',
            lineHeight: 1.35,
          }}
        >
          {line}
        </div>
      ))}
    </div>
  )
}

function MeasuredPreviewLine({ plain, chords, comment }){
  if (comment) {
    return (
      <div className="comment">{plain}</div>
    )
  }
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

    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const offsets = (chords || []).map(c => ({
      left: ctx.measureText(plain.slice(0, c.index)).width,
      sym: c.sym
    }))

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
    const val = x[2]
    m[key] = val
  }
  return m
}
