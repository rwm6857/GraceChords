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
import { CloudUploadIcon, PlusIcon, TrashIcon, SearchIcon } from '../components/Icons'
import { showToast } from '../utils/toast'
import '../styles/admin.css'
import Toolbar from '../components/ui/Toolbar'

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
    <div className="container gc-editor">
      <EditorHelpTabs activeTab={activeTab} />
      <header className="gc-editor__header">
        <div className="gc-editor__title">
          <h1>GraceChords Editor</h1>
          <span className="gc-editor__author">Author: {authorName}</span>
        </div>
        <nav className="gc-editor__tabs" aria-label="Editor tabs">
          <button
            className={`gc-editor__tab ${activeTab==='songs' ? 'is-active' : ''}`}
            onClick={()=> setActiveTab('songs')}
          >
            🎵 Songs
          </button>
          <button
            className={`gc-editor__tab ${activeTab==='posts' ? 'is-active' : ''}`}
            onClick={()=> setActiveTab('posts')}
          >
            📄 Posts
          </button>
        </nav>
      </header>

      <div className="card gc-editor__github">
        <div className="Row Small" style={{ alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <strong>GitHub:</strong>
          <span>Token: {ghUser ? `@${ghUser.login}` : (localStorage.getItem('ghToken') ? 'set' : 'not set')}</span>
          <button className="btn" onClick={setToken}>Set token</button>
          <button className="btn" onClick={clearToken}>Clear</button>
          <button className="btn" onClick={validateTokenNow}>Validate</button>
        </div>
      </div>

      {activeTab === 'songs' ? (
        <SongsEditor onStageSong={onStageSong} />
      ) : (
        <PostsEditor onStagePost={onStagePost} />
      )}

      <section className="card gc-staged-card">
        <div className="Row" style={{ alignItems:'center', gap:8 }}>
          <h3 style={{ margin: 0 }}>Staged changes <span className="Small">({staged.length})</span></h3>
          <div className="spacer" />
          <Button onClick={clearStaged} disabled={!staged.length}>Clear all</Button>
          <Button variant="primary" onClick={openPrModal} disabled={!staged.length}>
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
      </section>

      {staged.length > 0 && (
        <button className="gc-staged-floating" onClick={openPrModal}>
          Staged: {staged.length} – Review / Open PR
        </button>
      )}

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
  const [originalMeta, setOriginalMeta] = useState(null)
  const [originalContent, setOriginalContent] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteReasonInput, setDeleteReasonInput] = useState('')

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return items.filter(s => {
      const title = String(s.title || '').toLowerCase()
      const tags = (s.tags || []).map(t => String(t).toLowerCase()).join(' ')
      const authors = (s.authors || []).map(a => String(a).toLowerCase()).join(' ')
      return title.includes(q) || tags.includes(q) || authors.includes(q)
    }).slice(0, 12)
  }, [items, searchQuery])

  async function handleSelectSong(it){
    if (!it) return
    try {
      const base = ((import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/')
      const url = `${base}songs/${it.filename}`
      const body = await fetchTextCached(url)
      if (body) {
        setText(body)
        const loadedMeta = parseMeta(body)
        const canonical = buildCanonical(body, loadedMeta, it.filename)
        setEditingFile(it.filename)
        setOriginalMeta(loadedMeta)
        setOriginalContent(canonical?.content || '')
        setSearchQuery('')
      }
    } catch (e) {
      console.error(e)
      alert(`Failed to load ${it.filename}`)
    }
  }

  function handleNewSong(){
    setEditingFile('')
    setOriginalMeta(null)
    setOriginalContent('')
    setText(INITIAL_TEXT)
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

  function insertSectionHeader(label){
    const spec = {
      Verse: { start: '{sov Verse}\n', end: '{eov}\n' },
      Chorus: { start: '{soc Chorus}\n', end: '{eoc}\n' },
      Bridge: { start: '{sob Bridge}\n', end: '{eob}\n' },
    }[label] || { start: `{start_of_${label.toLowerCase()}}:\n`, end: `{end_of_${label.toLowerCase()}}\n` }
    insertAtCursor(`${spec.start}${spec.end}`)
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
  useEffect(() => {
    function onKey(e){
      if (deleteModalOpen) return
      if (!e.altKey) return
      const k = e.key
      if (!/^([1-6])$/.test(k)) return
      const idx = parseInt(k, 10) - 1
      const sym = quickChords[idx]
      if (sym) {
        e.preventDefault()
        insertAtCursor(`[${sym}]`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quickChords, deleteModalOpen])

  function buildCanonical(rawText = text, metaOverride = meta, filenameOverride = editingFile){
    try {
      const { text: out, docTitle, docKey } = convertToCanonicalChordPro(rawText, {
        country: metaOverride.country || '',
        tags: metaOverride.tags || '',
        youtube: metaOverride.youtube || '',
        mp3: metaOverride.mp3 || ''
      })
      const fname = filenameOverride || suggestCanonicalFilename(docTitle)
      const final = appendDisclaimerIfMissing(out)
      return { filename: fname, title: docTitle || metaOverride.title || 'Untitled', content: final, key: docKey || metaOverride.key || '' }
    } catch {}

    try {
      const doc = parseChordProOrLegacy(rawText)
      doc.meta.title = metaOverride.title || doc.meta.title || ''
      doc.meta.key = metaOverride.key || doc.meta.key || ''
      doc.meta.meta = {
        ...(doc.meta.meta || {}),
        authors: metaOverride.authors || doc.meta.meta?.authors || '',
        country: metaOverride.country || doc.meta.meta?.country || '',
        tags: metaOverride.tags || doc.meta.meta?.tags || '',
        youtube: metaOverride.youtube || doc.meta.meta?.youtube || '',
        mp3: metaOverride.mp3 || doc.meta.meta?.mp3 || '',
      }
      let content = serializeChordPro(doc, { useDirectives: true })
      content = appendDisclaimerIfMissing(content)
      const base = slugifyUnderscore(metaOverride.id || doc.meta.title || 'untitled')
      const fname = filenameOverride || `${base}.chordpro`
      return { filename: fname, title: doc.meta.title || 'Untitled', content, key: doc.meta.key || '' }
    } catch (e) {
      console.error(e)
      return null
    }
  }

  const strippedText = (text || '').replace(/\s+/g, '').replace(/\{[^}]*\}/g, '')
  const canStage = Boolean((meta.title || '').trim() || strippedText)
  const isExisting = !!editingFile

  function handleStageChanges(){
    const built = buildCanonical()
    if (!built) return

    if (!isExisting) {
      onStageSong([{
        kind: 'song',
        action: 'add',
        title: built.title,
        filename: built.filename,
        content: built.content,
      }])
      handleNewSong()
      return
    }

    const changedParts = []
    if ((meta.title || '').trim() !== (originalMeta?.title || '').trim()) changedParts.push('Title')
    const metaFields = ['authors','tags','key','country','youtube']
    const metaChanged = metaFields.some(f => (meta[f] || '').trim() !== (originalMeta?.[f] || '').trim())
    if (metaChanged) changedParts.push('Metadata')
    if ((built.content || '') !== (originalContent || '')) changedParts.push('Content')
    const changeSummary = changedParts.length ? changedParts.join(' + ') : 'Minor edit'

    onStageSong([{
      kind: 'song',
      action: 'edit',
      title: built.title,
      filename: editingFile,
      content: built.content,
      changeSummary,
    }])
    handleNewSong()
  }

  function confirmDeletion(reason){
    if (!editingFile) return
    onStageSong([{
      kind: 'song',
      action: 'delete-request',
      title: meta.title || 'Untitled',
      filename: editingFile,
      deleteReason: reason,
    }])
    setDeleteReasonInput('')
    setDeleteModalOpen(false)
    handleNewSong()
  }

  return (
    <div className="card gc-song-editor">
      <div className="gc-song-selector">
        <Button onClick={handleNewSong} iconLeft={<PlusIcon />}>New Song</Button>
        <div className="gc-song-selector__search">
          <input
            type="search"
            placeholder="Search existing songs…"
            value={searchQuery}
            onChange={e=> setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && searchResults.length) {
                e.preventDefault()
                handleSelectSong(searchResults[0])
              }
            }}
          />
          {searchResults.length > 0 && (
            <ul className="gc-song-selector__results">
              {searchResults.map(song => (
                <li key={song.id} onMouseDown={()=> handleSelectSong(song)}>
                  {song.title}
                </li>
              ))}
            </ul>
          )}
        </div>
        {editingFile ? (
          <span className="badge" style={{ background:'#fde68a', color:'#92400e' }}>Editing {editingFile}</span>
        ) : (
          <span className="badge" style={{ background:'#d1fae5', color:'#065f46' }}>New song</span>
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
      </div>

      <div className="gc-editor-toolbar">
        <div className="gc-quick-row">
          <strong>Quick chords</strong>
          <span className="Small">(Key: {meta.key || 'G'})</span>
          {quickChords.map((sym, i) => (
            <button key={sym} className="gc-btn gc-btn--sm" onClick={()=> insertAtCursor(`[${sym}]`)} title={`Insert [${sym}] (Alt+${i+1})`}>{sym}</button>
          ))}
        </div>
        <div className="gc-quick-sections">
          <span className="Small">Quick sections:</span>
          <button className="gc-btn gc-btn--sm" onClick={()=> insertSectionHeader('Verse')}>Verse</button>
          <button className="gc-btn gc-btn--sm" onClick={()=> insertSectionHeader('Chorus')}>Chorus</button>
          <button className="gc-btn gc-btn--sm" onClick={()=> insertSectionHeader('Bridge')}>Bridge</button>
        </div>
        <label className="gc-preview-toggle">
          <input type="checkbox" checked={showPreview} onChange={e=> setShowPreview(e.target.checked)} /> Preview
        </label>
      </div>

      <div className={`gc-editor-split ${showPreview ? '' : 'is-single'}`}>
        <div className="gc-editor-pane gc-editor-pane--input">
          <textarea
            ref={editorRef}
            value={text}
            onChange={e=> setText(e.target.value)}
            style={{width:'100%', minHeight:'60vh', fontFamily:'\"Roboto Mono\", ui-monospace, Menlo, Consolas, monospace', fontSize: showPreview ? undefined : 'calc(1rem + 2pt)'}}
          />
        </div>
        {showPreview && (
          <div className="gc-editor-pane gc-editor-pane--preview">
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

      <div className="gc-stage-actions">
        <Button variant="primary" onClick={handleStageChanges} disabled={!canStage}>
          Add Changes
        </Button>
        {isExisting && (
          <Button onClick={()=> setDeleteModalOpen(true)} iconLeft={<TrashIcon />}>
            Request Deletion
          </Button>
        )}
        <span className="Small" style={{ marginLeft: 'auto' }}>Files save as .chordpro</span>
      </div>

      {deleteModalOpen && (
        <div className="modal">
          <div className="modal-body">
            <h3>Request Deletion</h3>
            <label>Why should this song be removed?
              <textarea
                rows={3}
                value={deleteReasonInput}
                onChange={e=> setDeleteReasonInput(e.target.value)}
                placeholder="Reason for deletion"
              />
            </label>
            <div className="Row" style={{ justifyContent:'flex-end', gap:8 }}>
              <button className="btn" onClick={()=> { setDeleteModalOpen(false); setDeleteReasonInput('') }}>Cancel</button>
              <button className="btn primary" onClick={()=> confirmDeletion(deleteReasonInput)} disabled={!deleteReasonInput.trim()}>Submit request</button>
            </div>
          </div>
        </div>
      )}
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

function EditorHelpTabs({ activeTab }){
  const [open, setOpen] = useState('')
  const chordTabLabel = activeTab === 'posts' ? 'Resource Help' : 'ChordPro Help'

  const tabs = [
    {
      id: 'editor',
      label: 'Editor Help',
      title: 'Editor Help',
      content: (
        <>
          <p>Fill in metadata (title, key, authors, country, tags, YouTube). Use quick chords and quick sections to speed up typing.</p>
          <p>New Song + search lets you start fresh or load an existing song to edit.</p>
        </>
      ),
    },
    {
      id: 'chordpro',
      label: chordTabLabel,
      title: chordTabLabel,
      content: (
        <>
          {activeTab === 'posts' ? (
            <p>Resources use Markdown with frontmatter (title, author, date, tags, summary) followed by body content.</p>
          ) : (
            <>
              <p>Use chords in square brackets: <code>[G]</code>. Section headers use short codes like <code>{'{sov Verse}'}</code> … <code>{'{eov}'}</code>.</p>
              <pre className="Small" style={{ whiteSpace:'pre-wrap' }}>{`{title: Example}
{key: G}
{sov Verse}
[G]Amazing [C]grace
{eov}`}</pre>
            </>
          )}
        </>
      ),
    },
    {
      id: 'staging',
      label: 'Staging Help',
      title: 'Staging Help',
      content: (
        <>
          <p>“Add Changes” stages the current song (new or edited) for the PR. Deletion requests log a reason without deleting files.</p>
          <p>Use the floating staged pill or the table to review and open the PR.</p>
        </>
      ),
    },
  ]

  const active = tabs.find(t => t.id === open)

  return (
    <div className="gc-help">
      <div className="gc-help__tabs" aria-label="Help tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`gc-help__tab ${open === t.id ? 'is-open' : ''}`}
            onClick={() => setOpen(open === t.id ? '' : t.id)}
          >
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      {active && (
        <div className="gc-help__drawer">
          <div className="gc-help__drawer-inner">
            <div className="Row" style={{ justifyContent:'space-between', alignItems:'center', gap:8 }}>
              <strong>{active.title}</strong>
              <button className="btn small" onClick={()=> setOpen('')}>Close</button>
            </div>
            <div className="gc-help__content Small">
              {active.content}
            </div>
          </div>
        </div>
      )}
    </div>
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
