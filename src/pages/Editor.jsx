import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import indexData from '../data/index.json'
import resourcesData from '../data/resources.json'
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
import { CloudUploadIcon, PlusIcon, TrashIcon, HomeIcon, Sun, Moon } from '../components/Icons'
import { showToast } from '../utils/toast'
import { publicUrl } from '../utils/publicUrl'
import '../styles/admin.css'
import { currentTheme, toggleTheme } from '../utils/theme'
import { parseFrontmatter, slugifyKebab } from '../utils/markdown'
import PostMdxEditor from '../components/editor/PostMdxEditor'
import { Card } from '../components/ui/layout-kit'

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
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('tab')
    if (tab === 'posts' || tab === 'resources') return 'posts'
    return 'songs'
  })
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
  const [tokenModalOpen, setTokenModalOpen] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [tokenError, setTokenError] = useState('')
  const [validatingToken, setValidatingToken] = useState(false)
  const [, setThemeTick] = useState(0)
  const isDark = (currentTheme && typeof currentTheme === 'function') ? (currentTheme() === 'dark') : false
  const songParam = searchParams.get('song')
  const resParam = searchParams.get('resource')
  const newSongParam = searchParams.get('newSong')
  const newResParam = searchParams.get('newResource')
  const tabParam = searchParams.get('tab')

  useEffect(() => {
    if (tabParam === 'posts' || tabParam === 'resources') {
      setActiveTab('posts')
    } else if (tabParam === 'songs') {
      setActiveTab('songs')
    } else if (resParam || newResParam) {
      setActiveTab('posts')
    }
  }, [tabParam, resParam, newResParam])

  useEffect(() => {
    const existing = localStorage.getItem('ghToken')
    if (existing) {
      setTokenInput(existing)
      validateAndStoreToken(existing, { silent: true })
    } else {
      setTokenModalOpen(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  async function validateAndStoreToken(rawToken, { silent = false } = {}) {
    const t = (rawToken || '').trim()
    if (!t) {
      setTokenError('Token cannot be empty')
      return
    }
    setValidatingToken(true)
    setTokenError('')
    try {
      localStorage.setItem('ghToken', t)
      const user = await GH.validateToken()
      setGhUser(user)
      if (!silent) {
        const msg = `GitHub token OK: ${user.login}`
        if (typeof showToast === 'function') showToast(msg)
        else alert(msg)
      }
      setTokenModalOpen(false)
      setTokenInput('')
    } catch (e) {
      localStorage.removeItem('ghToken')
      setGhUser(null)
      setTokenError(e?.message || String(e))
      setTokenModalOpen(true)
    } finally {
      setValidatingToken(false)
    }
  }

  function handleOpenPrClick(){
    const existing = localStorage.getItem('ghToken')
    if (!existing) {
      setTokenInput('')
      setTokenError('')
      setTokenModalOpen(true)
      return
    }
    openPrModal()
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
      let wrote = 0
      for(const item of staged){
        if(item.action === 'delete-request') continue
        const basePath = item.kind === 'song' ? 'public/songs' : 'public/resources'
        const path = item.path || `${basePath}/${item.filename}`
        if(item.action === 'delete'){
          const existingSha = await GH.getFileSha({ owner, repo, path, ref: branchName })
    const msg = item.deleteReason ? `delete: ${item.filename} – ${item.deleteReason}` : `delete: ${item.filename}`
    await GH.deleteFile({ owner, repo, branch: branchName, path, message: msg, sha: existingSha || undefined })
    wrote += 1
    continue
        }
        const existingSha = await GH.getFileSha({ owner, repo, path, ref: branchName })
        const msg = item.action === 'add' ? `add: ${item.filename}` : `update: ${item.filename}`
        await GH.putFile({
          owner,
          repo,
          branch: branchName,
          path,
          contentBase64: item.contentIsBase64 ? (item.content || '') : GH.toBase64(item.content || ''),
          message: msg,
          sha: existingSha,
        })
        wrote += 1
      }

      if (wrote === 0) {
        throw new Error('No file changes to commit. Add or edit a post before opening a PR (deletion requests alone are not committed).')
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
    <div className="gc-editor-page">
      <div className="container gc-editor">
        <EditorHelpTab />
        <header className="gc-editor__header">
          <div className="gc-editor__title">
            <h1>GraceChords Editor</h1>
            <span className="gc-editor__author">
              Author: {authorName}
              <span style={{ marginLeft: 8, display:'inline-flex', alignItems:'center', gap:4 }}>
                Token {ghUser ? (
                  <span title={`Token OK: ${ghUser.login}`} style={{ color:'var(--primary)' }}>✔</span>
                ) : (
                  <span title="Token missing or invalid" style={{ color:'#ef4444' }}>✘</span>
                )}
              </span>
            </span>
          </div>
          <nav className="gc-editor__tabs" aria-label="Editor tabs">
            <button
              className={`gc-editor__tab ${activeTab==='songs' ? 'is-active' : ''}`}
              onClick={()=> setActiveTab('songs')}
            >
              🎵 Song Editor
            </button>
            <button
              className={`gc-editor__tab ${activeTab==='posts' ? 'is-active' : ''}`}
              onClick={()=> setActiveTab('posts')}
            >
              📄 Post Editor
            </button>
          </nav>
          <div className="gc-editor__actions">
            <Link to="/" className="gc-editor__iconbtn" title="Back to home" aria-label="Back to home">
              <HomeIcon size={18} />
            </Link>
            <button
              className="gc-editor__iconbtn"
              aria-label="Toggle theme"
              onClick={()=> { toggleTheme(); setThemeTick(x => x + 1) }}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <div className="gc-editor-shell">
          {activeTab === 'songs' ? (
            <SongsEditor
              onStageSong={onStageSong}
              prefill={songParam ? { kind: 'existing', id: songParam } : (newSongParam ? { kind: 'new' } : null)}
            />
          ) : (
            <PostsEditor
              onStagePost={onStagePost}
              prefill={resParam ? { kind: 'existing', slug: resParam } : (newResParam ? { kind: 'new' } : null)}
            />
          )}

          <section className="gc-editor-panel gc-editor-panel--staged gc-staged-card">
            <div className="Row" style={{ alignItems:'center', gap:8 }}>
              <h3 style={{ margin: 0 }}>Staged changes <span className="Small">({staged.length})</span></h3>
              <div className="spacer" />
              <Button onClick={clearStaged} disabled={!staged.length}>Clear all</Button>
              <Button variant="primary" onClick={handleOpenPrClick} disabled={!staged.length}>
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
                        {s.path ? <div className="Small"><code>{s.path}</code></div> : null}
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
        </div>

        {staged.length > 0 && (
          <button className="gc-staged-floating" onClick={handleOpenPrClick}>
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
      <TokenModal
        open={tokenModalOpen}
        tokenInput={tokenInput}
        setTokenInput={setTokenInput}
        tokenError={tokenError}
        validating={validatingToken}
        onSubmit={validateAndStoreToken}
        onClose={() => { setTokenModalOpen(false); setTokenError('') }}
      />
    </div>
  </div>
)
}

function SongsEditor({ onStageSong, prefill }){
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
  const [searchIndex, setSearchIndex] = useState(-1)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteReasonInput, setDeleteReasonInput] = useState('')
  const [prefillApplied, setPrefillApplied] = useState(false)

  useEffect(() => {
    setPrefillApplied(false)
  }, [prefill?.id, prefill?.kind])

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
  useEffect(() => { setSearchIndex(-1) }, [searchQuery])

  useEffect(() => {
    if (prefillApplied) return
    if (!prefill) return
    const kind = prefill.kind
    const id = prefill.id
    if (kind === 'existing' && id) {
      const target = items.find(s =>
        String(s.id) === String(id) ||
        s.filename === id ||
        s.filename?.replace(/\.chordpro$/, '') === String(id)
      )
      if (target) {
        handleSelectSong(target)
        setPrefillApplied(true)
        return
      }
      setPrefillApplied(true)
      return
    }
    if (kind === 'new') {
      handleNewSong()
      setPrefillApplied(true)
    }
  }, [prefill, prefillApplied, items])

  async function handleSelectSong(it){
    if (!it) return
    try {
      const url = publicUrl(`songs/${it.filename}`)
      const body = await fetchTextCached(url)
      if (body) {
        setText(body)
        const loadedMeta = parseMeta(body)
        const canonical = buildCanonical(body, loadedMeta, it.filename)
        setEditingFile(it.filename)
        setOriginalMeta(loadedMeta)
        setOriginalContent(canonical?.content || '')
        setSearchQuery('')
        setSearchIndex(-1)
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
    const ta = editorRef.current
    if(!ta){
      setText(t => (t || '') + spec.start + spec.end)
      return
    }
    const selStart = ta.selectionStart ?? 0
    const selEnd = ta.selectionEnd ?? selStart
    const hasSelection = selEnd > selStart

    setText(prev => {
      const before = prev.slice(0, selStart)
      const selected = hasSelection ? prev.slice(selStart, selEnd) : ''
      const after = prev.slice(selEnd)
      return before + spec.start + selected + spec.end + after
    })

    setTimeout(() => {
      try {
        ta.focus()
        const base = selStart + spec.start.length
        const endPos = base + (hasSelection ? (selEnd - selStart) : 0)
        ta.setSelectionRange(base, endPos || base)
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
        mp3: metaOverride.mp3 || '',
        added: metaOverride.added || ''
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
    let rawText = text
    if (!isExisting) {
      const m = parseMeta(rawText)
      if (!m.added) {
        const iso = new Date().toISOString()
        rawText = setOrInsertMeta(rawText, 'added', iso)
        setText(rawText)
      }
    }
    const built = buildCanonical(rawText, parseMeta(rawText), editingFile)
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
      action: 'delete',
      title: meta.title || 'Untitled',
      filename: editingFile,
      deleteReason: reason,
    }])
    setDeleteReasonInput('')
    setDeleteModalOpen(false)
    handleNewSong()
  }

  return (
    <div className="gc-song-editor">
      <section className="gc-editor-panel gc-editor-panel--selector">
        <div className="gc-song-selector">
          <Button onClick={handleNewSong} iconLeft={<PlusIcon />}>New Song</Button>
          <div className="gc-song-selector__search">
            <input
              type="search"
              placeholder="Search existing songs…"
              value={searchQuery}
              onChange={e=> setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (!searchResults.length) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSearchIndex(i => Math.min(i + 1, searchResults.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSearchIndex(i => Math.max(i - 1, 0))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  const choice = searchIndex >=0 ? searchResults[searchIndex] : searchResults[0]
                  handleSelectSong(choice)
                } else if (e.key === 'Escape') {
                  setSearchIndex(-1)
                }
              }}
            />
            {searchResults.length > 0 && (
              <ul className="gc-song-selector__results">
                {searchResults.map((song, idx) => (
                  <li
                    key={song.id}
                    className={searchIndex === idx ? 'is-active' : ''}
                    onMouseEnter={()=> setSearchIndex(idx)}
                    onMouseDown={()=> handleSelectSong(song)}
                  >
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
      </section>

      <section className="gc-editor-panel gc-editor-panel--meta" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop: 12}}>
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
      </section>

      <section className="gc-editor-panel gc-editor-panel--body" style={{ marginTop: 12 }}>
        <div className="gc-editor-toolbar">
          <div className="gc-quick-row">
            <strong>Quick Chords</strong>
            {quickChords.map((sym, i) => (
              <button key={sym} className="gc-btn gc-btn--sm" onClick={()=> insertAtCursor(`[${sym}]`)} title={`Insert [${sym}] (Alt+${i+1})`}>{sym}</button>
            ))}
          </div>
          <div className="gc-quick-sections">
            <strong>Quick Sections</strong>
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
              style={{width:'100%', minHeight:'70vh', height:'70vh', fontFamily:'\"Roboto Mono\", ui-monospace, Menlo, Consolas, monospace'}}
            />
          </div>
          {showPreview && (
            <div className="gc-editor-pane gc-editor-pane--preview">
              <div className="Small" style={{ marginBottom:8, fontFamily:'\"Roboto Mono\", ui-monospace, Menlo, Consolas, monospace' }}>
                {parsed?.meta?.title ? <div style={{ fontWeight:700 }}>{parsed.meta.title}</div> : null}
                {parsed?.meta?.key || parsed?.meta?.originalkey ? <div style={{ fontStyle:'italic' }}>Key of {parsed.meta.key || parsed.meta.originalkey}</div> : null}
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
      </section>

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

function PostsEditor({ onStagePost, prefill }){
  const [list] = useState(() => (resourcesData?.items || []).slice().sort((a,b)=> (b.date||'').localeCompare(a.date||'')))
  const [meta, setMeta] = useState({ title:'', author:'', date: new Date().toISOString().slice(0,10), tags:[], summary:'' })
  const [tagsInput, setTagsInput] = useState('')
  const [body, setBody] = useState('')
  const [assets, setAssets] = useState([])
  const [editingSlug, setEditingSlug] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(-1)
  const [changeSummary, setChangeSummary] = useState('')
  const [prefillApplied, setPrefillApplied] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteReasonInput, setDeleteReasonInput] = useState('')
  const [originalMeta, setOriginalMeta] = useState(null)
  const [originalBody, setOriginalBody] = useState('')
  const editorRef = useRef(null)
  const prevSlugRef = useRef(slugifyKebab(meta.title || 'untitled'))

  useEffect(() => {
    setPrefillApplied(false)
  }, [prefill?.slug, prefill?.kind])

  const finalSlug = useMemo(() => slugifyKebab(meta.title || 'untitled'), [meta.title])
  const filename = `${finalSlug}.md`
  const isExisting = !!editingSlug

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return list.filter(p => {
      const title = String(p.title || '').toLowerCase()
      const tags = (p.tags || []).map(t => String(t).toLowerCase()).join(' ')
      const author = String(p.author || '').toLowerCase()
      return title.includes(q) || tags.includes(q) || author.includes(q)
    }).slice(0, 12)
  }, [list, searchQuery])
  useEffect(() => { setSearchIndex(-1) }, [searchQuery])

  useEffect(() => {
    if (prefillApplied) return
    if (!prefill) return
    if (prefill.kind === 'existing' && prefill.slug) {
      const target = list.find(it => it.slug === prefill.slug)
      if (target) {
        loadExisting(target)
        setPrefillApplied(true)
        return
      }
      setPrefillApplied(true)
      return
    }
    if (prefill.kind === 'new') {
      handleNewPost()
      setPrefillApplied(true)
    }
  }, [prefill, prefillApplied, list])

  useEffect(() => {
    const prev = prevSlugRef.current
    const next = finalSlug
    if (prev && next && prev !== next && assets.length) {
      const oldPrefix = `/uploads/resources/${prev}/`
      const newPrefix = `/uploads/resources/${next}/`
      setAssets(existing => existing.map(asset => {
        const updatedPath = (asset.path || '')
          .split(`public${oldPrefix}`).join(`public${newPrefix}`)
          .split(oldPrefix).join(newPrefix)
        return { ...asset, path: updatedPath }
      }))
      setBody(b => b ? b.split(oldPrefix).join(newPrefix) : b)
    }
    prevSlugRef.current = next
  }, [finalSlug, assets.length])

  function composeFile(currentMeta = meta, currentBody = body){
    const safeTags = Array.isArray(currentMeta.tags)
      ? currentMeta.tags
      : String(currentMeta.tags || '').split(/[,;]/).map(t => t.trim()).filter(Boolean)
    const summary = currentMeta.summary || ''
    const fm = [
      '---',
      `title: "${String(currentMeta.title || '').replace(/"/g,'\\"')}"`,
      `author: "${String(currentMeta.author || '').replace(/"/g,'\\"')}"`,
      `date: "${currentMeta.date || ''}"`,
      `tags: ${JSON.stringify(safeTags)} `,
      `summary: "${String(summary || '').replace(/"/g,'\\"')}"`,
      '---',
      '',
    ].join('\n')
    return fm + (currentBody || '')
  }

  function handleNewPost(){
    setMeta({ title:'', author:'', date: new Date().toISOString().slice(0,10), tags:[], summary:'' })
    setTagsInput('')
    setBody('')
    setAssets([])
    setEditingSlug('')
    setChangeSummary('')
    setOriginalMeta(null)
    setOriginalBody('')
    setSearchQuery('')
    setSearchIndex(-1)
  }

  async function loadExisting(post){
    if (!post) return
    try {
      const url = publicUrl(`resources/${post.slug}.md`)
      const txt = await fetchTextCached(url)
      const fm = parseFrontmatter(txt)
      setMeta({
        title: String(fm.meta.title || post.title || ''),
        author: String(fm.meta.author || post.author || ''),
        date: String(fm.meta.date || post.date || new Date().toISOString().slice(0,10)),
        tags: Array.isArray(fm.meta.tags)
          ? fm.meta.tags
          : String(fm.meta.tags || (Array.isArray(post.tags) ? post.tags.join(',') : post.tags) || '')
              .split(/[,;]/)
              .map(t => t.trim())
              .filter(Boolean),
        summary: String(fm.meta.summary || post.summary || ''),
      })
      setTagsInput(
        Array.isArray(fm.meta.tags)
          ? fm.meta.tags.join(', ')
          : String(fm.meta.tags || (Array.isArray(post.tags) ? post.tags.join(', ') : post.tags || ''))
      )
      setBody(fm.content || '')
      setAssets([])
      setEditingSlug(post.slug || '')
      setChangeSummary('')
      setOriginalMeta({
        title: String(fm.meta.title || post.title || ''),
        author: String(fm.meta.author || post.author || ''),
        date: String(fm.meta.date || post.date || new Date().toISOString().slice(0,10)),
        tags: Array.isArray(fm.meta.tags)
          ? fm.meta.tags
          : String(fm.meta.tags || (Array.isArray(post.tags) ? post.tags.join(',') : post.tags) || '')
              .split(/[,;]/)
              .map(t => t.trim())
              .filter(Boolean),
        summary: String(fm.meta.summary || post.summary || ''),
      })
      setOriginalBody(fm.content || '')
      setSearchQuery('')
      setSearchIndex(-1)
    } catch (e) {
      console.error(e)
      alert(`Failed to load ${post.slug}`)
    }
  }

  function setTitle(v){
    setMeta(m => ({ ...m, title: v }))
  }
  function setAuthor(v){ setMeta(m => ({ ...m, author: v })) }
  function setDate(v){ setMeta(m => ({ ...m, date: v })) }
  function setSummary(v){ setMeta(m => ({ ...m, summary: v })) }
  function setTagsValue(v){
    setTagsInput(v)
    const arr = String(v || '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
    setMeta(m => ({ ...m, tags: arr }))
  }

  function handleAddAsset(asset){
    if (!asset?.path) return
    setAssets(prev => {
      const idx = prev.findIndex(a => a.path === asset.path)
      if (idx >= 0) {
        const copy = prev.slice()
        copy[idx] = { ...copy[idx], ...asset }
        return copy
      }
      return [...prev, asset]
    })
  }

  const draft = useMemo(() => ({
    slug: finalSlug,
    filename,
    meta,
    body,
    content: composeFile(),
    isExisting,
  }), [finalSlug, filename, meta, body, isExisting])

  function buildItems(currentDraft, action, summaryOverride = ''){
    if (!currentDraft) return []
    const main = {
      kind: 'post',
      action,
      title: currentDraft.meta?.title || 'Untitled',
      filename: currentDraft.filename,
      path: `public/resources/${currentDraft.filename}`,
      content: currentDraft.content,
      changeSummary: action === 'edit' ? (summaryOverride || changeSummary || '') : '',
    }
    const assetItems = assets.map(asset => ({
      ...asset,
      kind: asset.kind || 'asset',
      action: asset.action || 'add',
      title: `${currentDraft.meta?.title || 'Untitled'} asset`,
      filename: asset.filename || asset.path?.split('/').pop(),
    }))
    return [main, ...assetItems]
  }

  function stageAdd(currentDraft = draft){
    if(!currentDraft || currentDraft.isExisting){
      showToast?.('Use Stage Edit for existing posts.') ?? alert('Use Stage Edit for existing posts.')
      return
    }
    onStagePost(buildItems(currentDraft, 'add'))
    handleNewPost()
  }

  function detectChangeSummary(currentDraft){
    const changes = []
    if ((currentDraft.meta?.title || '') !== (originalMeta?.title || '')) changes.push('Title')
    const metaChanged = ['author','date','tags','summary'].some(k => JSON.stringify(currentDraft.meta?.[k] || '') !== JSON.stringify(originalMeta?.[k] || ''))
    if (metaChanged) changes.push('Metadata')
    if ((currentDraft.body || '') !== (originalBody || '')) changes.push('Content')
    return changes.length ? changes.join(' + ') : 'Minor edit'
  }

  function stageEdit(currentDraft = draft){
    if(!currentDraft?.isExisting){
      showToast?.('Load an existing post to stage an edit.') ?? alert('Load an existing post to stage an edit.')
      return
    }
    const autoSummary = detectChangeSummary(currentDraft)
    setChangeSummary(autoSummary)
    onStagePost(buildItems({ ...currentDraft, changeSummary: autoSummary }, 'edit', autoSummary))
    handleNewPost()
  }

  function stageDelete(currentDraft = draft, reason = ''){
    if(!currentDraft?.isExisting){
      showToast?.('Load an existing post to request deletion.') ?? alert('Load an existing post to request deletion.')
      return
    }
    const targetSlug = editingSlug || currentDraft.slug || finalSlug
    onStagePost([{
      kind: 'post',
      action: 'delete',
      title: currentDraft.meta?.title || 'Untitled',
      filename: `${targetSlug}.md`,
      path: `public/resources/${targetSlug}.md`,
      deleteReason: reason || '',
    }])
    handleNewPost()
  }

  const searchLabel = isExisting ? `Editing ${(editingSlug || finalSlug)}.md` : 'New post'

  return (
    <div className="gc-song-editor gc-post-editor">
      <section className="gc-editor-panel gc-editor-panel--selector">
        <div className="gc-song-selector">
          <Button onClick={handleNewPost} iconLeft={<PlusIcon />}>New Post</Button>
          <div className="gc-song-selector__search">
            <input
              type="search"
              placeholder="Search existing posts…"
              value={searchQuery}
              onChange={e=> setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (!searchResults.length) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSearchIndex(i => Math.min(i + 1, searchResults.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSearchIndex(i => Math.max(i - 1, 0))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  const choice = searchIndex >=0 ? searchResults[searchIndex] : searchResults[0]
                  loadExisting(choice)
                } else if (e.key === 'Escape') {
                  setSearchIndex(-1)
                }
              }}
            />
            {searchResults.length > 0 && (
              <ul className="gc-song-selector__results">
                {searchResults.map((post, idx) => (
                  <li
                    key={post.slug}
                    className={searchIndex === idx ? 'is-active' : ''}
                    onMouseEnter={()=> setSearchIndex(idx)}
                    onMouseDown={()=> loadExisting(post)}
                  >
                    {post.title}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {isExisting ? (
            <span className="badge" style={{ background:'#fde68a', color:'#92400e' }}>{searchLabel}</span>
          ) : (
            <span className="badge" style={{ background:'#d1fae5', color:'#065f46' }}>{searchLabel}</span>
          )}
        </div>
      </section>

      <section className="gc-editor-panel gc-editor-panel--meta" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop: 12}}>
        <label>Title
          <input value={meta.title} onChange={e=> setTitle(e.target.value)} />
        </label>
        <label>Author
          <input value={meta.author} onChange={e=> setAuthor(e.target.value)} />
        </label>
        <label>Date
          <input type="date" value={meta.date} onChange={e=> setDate(e.target.value)} />
        </label>
        <label>Tags
          <input value={tagsInput} onChange={e=> setTagsValue(e.target.value)} placeholder="leadership, vocals" />
        </label>
        <label style={{ gridColumn:'1 / -1' }}>Summary
          <input value={meta.summary} onChange={e=> setSummary(e.target.value)} placeholder="Optional short blurb shown in lists" />
        </label>
      </section>

      <section className="gc-editor gc-editor-panel gc-editor-panel--body" style={{ marginTop: 12 }}>
        <div className="gc-editor-split is-single">
          <div className="gc-editor-pane gc-editor-pane--input">
            <Card className="gc-editor__card">
              <PostMdxEditor
                ref={editorRef}
                markdown={body}
                onChange={setBody}
                slug={finalSlug}
                onAddAsset={handleAddAsset}
                assetNames={assets.map(a => a.filename)}
              />
            </Card>
          </div>
        </div>

        <div className="gc-stage-actions">
          <Button variant="primary" onClick={()=> draft?.isExisting ? stageEdit(draft) : stageAdd(draft)} disabled={!draft}>
            Add Changes
          </Button>
          {isExisting && (
            <Button onClick={()=> { setDeleteModalOpen(true); setDeleteReasonInput('') }} iconLeft={<TrashIcon />}>
              Request Deletion
            </Button>
          )}
        </div>
      </section>

      {deleteModalOpen && (
        <div className="modal">
          <div className="modal-body">
            <h3>Request Deletion</h3>
            <label>Why should this post be removed?
              <textarea
                rows={3}
                value={deleteReasonInput}
                onChange={e=> setDeleteReasonInput(e.target.value)}
                placeholder="Reason for deletion"
              />
            </label>
            <div className="Row" style={{ justifyContent:'flex-end', gap:8 }}>
              <button className="btn" onClick={()=> { setDeleteModalOpen(false); setDeleteReasonInput('') }}>Cancel</button>
              <button className="btn primary" onClick={()=> { setDeleteModalOpen(false); stageDelete(draft, deleteReasonInput) }} disabled={!deleteReasonInput.trim()}>Submit request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EditorHelpTab(){
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    function onKey(e){
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <>
      <button
        className="gc-editor-help-tab"
        onClick={()=> setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Open editor help"
      >
        {' Editor Help '}
      </button>
      {open && (
        <div className="gc-editor-help-drawer">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
            <strong>Editor Help</strong>
            <button className="btn small" onClick={()=> setOpen(false)} aria-label="Close help">✕</button>
          </div>
          <div className="gc-help__content Small" style={{ marginTop:8 }}>
            <h3>Editor basics</h3>
            <p>Fill metadata (title, key, authors, country, tags, YouTube). Use quick chords and quick sections to speed up typing.</p>
            <p>New Song + search lets you start fresh or load an existing song to edit.</p>
            <h3>ChordPro tips</h3>
            <p>Place chords in square brackets like <code>[G]</code>. Section headers use short codes such as <code>{'{sov Verse}'}</code> … <code>{'{eov}'}</code>.</p>
            <pre className="Small" style={{ whiteSpace:'pre-wrap' }}>{`{title: Example}
{key: G}
{sov Verse}
[G]Amazing [C]grace
{eov}`}</pre>
            <h3>Staging &amp; PRs</h3>
            <p>“Add Changes” stages the current song (new or edited) for the PR. Deletion requests log a reason without deleting files.</p>
            <p>Use the staged table or floating pill to review and open the PR; a maintainer will review and merge.</p>
          </div>
        </div>
      )}
    </>
  )
}

function TokenModal({ open, tokenInput, setTokenInput, tokenError, validating, onSubmit, onClose }){
  if (!open) return null
  return (
    <div className="modal">
      <div className="modal-body">
        <h3>GitHub token required</h3>
        <p className="Small" style={{ opacity:0.85 }}>
          Paste a GitHub personal access token (repo scope) to send changes as a pull request. It is stored only in this browser.
        </p>
        <label>Token
          <input
            type="password"
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
            placeholder="ghp_..."
            autoFocus
          />
        </label>
        {tokenError ? <div className="alert error Small">{tokenError}</div> : null}
        <div className="Row" style={{ justifyContent:'flex-end', gap:8 }}>
          <button className="btn" onClick={onClose} disabled={validating}>Cancel</button>
          <button className="btn primary" onClick={()=> onSubmit(tokenInput)} disabled={validating}>
            {validating ? 'Validating…' : 'Save token'}
          </button>
        </div>
      </div>
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

    const gap = 2
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
