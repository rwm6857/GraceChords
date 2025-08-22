// src/components/Songbook.jsx
import { useMemo, useState } from 'react'
import indexData from '../data/index.json'
import { parseChordPro } from '../utils/chordpro'
import { normalizeSongInput } from '../utils/pdf/pdfLayout'
import { fetchTextCached } from '../utils/fetchCache'
import { showToast } from '../utils/toast'
import Busy from './Busy'
import SongCard from './ui/SongCard'
import '../styles/cards.css'
import '../styles/songbook.css'

// Lazy pdf exporters
let pdfLibPromise
const loadPdfLib = () => pdfLibPromise || (pdfLibPromise = import('../utils/pdf'))

function byTitle(a, b) {
  return (a?.title || '').localeCompare(b?.title || '', undefined, { sensitivity: 'base' })
}
function uniqSorted(arr) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
  )
}

export default function Songbook() {
  // Catalog from index.json (uses .items + .filename)
  const items = useMemo(() => (indexData?.items || []).slice().sort(byTitle), [])

  // Filters / search
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState('All')
  const [country, setCountry] = useState('All')
  const [author, setAuthor] = useState('All')

  const tags = useMemo(
    () =>
      uniqSorted(
        items.flatMap((s) => (Array.isArray(s.tags) ? s.tags : s.tags ? [s.tags] : []))
      ),
    [items]
  )
  const countries = useMemo(
    () => uniqSorted(items.map((s) => s.country).filter(Boolean)),
    [items]
  )
  const authors = useMemo(
    () =>
      uniqSorted(
        items.flatMap((s) =>
          Array.isArray(s.authors) ? s.authors : s.authors ? [s.authors] : []
        )
      ),
    [items]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let arr = items
    if (q) {
      arr = arr.filter((s) => {
        const title = (s.title || '').toLowerCase()
        const auth = (
          Array.isArray(s.authors) ? s.authors.join(', ') : s.authors || ''
        ).toLowerCase()
        return title.includes(q) || auth.includes(q)
      })
    }
    if (tag !== 'All') {
      arr = arr.filter((s) =>
        Array.isArray(s.tags) ? s.tags.includes(tag) : s.tags === tag
      )
    }
    if (country !== 'All') arr = arr.filter((s) => s.country === country)
    if (author !== 'All') {
      arr = arr.filter((s) =>
        Array.isArray(s.authors) ? s.authors.includes(author) : s.authors === author
      )
    }
    return arr.slice().sort(byTitle)
  }, [items, search, tag, country, author])

  // Selection
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const selectedEntries = useMemo(
    () => filtered.filter((s) => selectedIds.has(s.id)).slice().sort(byTitle),
    [filtered, selectedIds]
  )
  const filteredCount = filtered.length
  const selectedCount = selectedIds.size

  function toggleOne(id, checked) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }
  function selectAllFiltered() {
    if (!filtered.length) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const s of filtered) next.add(s.id)
      return next
    })
  }
  function clearAll() {
    setSelectedIds(new Set())
  }

  // Export
  const [includeTOC, setIncludeTOC] = useState(true)
  const [cover, setCover] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleExport() {
    if (!selectedEntries.length) return
    setBusy(true)
    try {
      const { downloadSongbookPdf } = await loadPdfLib()
      const songs = []
      for (const it of selectedEntries) {
        try {
          const url = `${import.meta.env.BASE_URL}songs/${it.filename}`
          const txt = await fetchTextCached(url)
          const parsed = parseChordPro(txt)
          const blocks = parsed.blocks.map((b) => ({
            section: b.section,
            lines: (b.lines || []).map((ln) => ({
              plain: ln.text,
              chordPositions: (ln.chords || []).map((c) => ({ sym: c.sym, index: c.index })),
            })),
          }))
          const slug = it.filename.replace(/\.chordpro$/, '')
          const song = normalizeSongInput({
            title: parsed.meta.title || it.title || slug,
            key: parsed.meta.key || parsed.meta.originalkey || it.originalKey || 'C',
            capo: parsed.meta?.capo,
            lyricsBlocks: blocks,
          })
          songs.push(song)
        } catch(err) {
          console.error(err)
          showToast(`Failed to process ${it.filename}`)
        }
      }
      if (songs.length) {
        await downloadSongbookPdf(songs, { includeTOC, coverImageDataUrl: cover })
      }
    } finally {
      setBusy(false)
    }
  }

  function prefetchPdf(){ loadPdfLib() }

  function onCoverFile(e) {
    const f = e.target.files?.[0]
    if (!f) {
      setCover(null)
      return
    }
    if (f.size > 2 * 1024 * 1024) {
      showToast('Image must be under 2 MB')
      e.target.value = ''
      setCover(null)
      return
    }
    if (!f.type.startsWith('image/')) {
      showToast('File must be an image')
      e.target.value = ''
      setCover(null)
      return
    }
    const reader = new FileReader()
    reader.onload = () => setCover(String(reader.result || ''))
    reader.readAsDataURL(f)
  }

  // Render
  if (items.length === 0) {
    return (
      <div className="container">
        <h1>No songs found</h1>
        <p className="Small">The song index is empty or failed to load.</p>
      </div>
    )
  }

  return (
    <div className="container">
      <Busy busy={busy} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <a href="/" className="back">
            ← Back
          </a>
        </div>
        <h1 style={{ margin: 0 }}>Songbook Builder</h1>
        <div />
      </div>

      {/* Toolbar */}
      <div className="card toolbar" style={{ marginTop: 12 }}>
        <div className="Field">
          <input
            id="sb-toc"
            type="checkbox"
            checked={includeTOC}
            onChange={(e) => setIncludeTOC(e.target.checked)}
          />
          <label htmlFor="sb-toc">Include table of contents</label>
        </div>
        <div className="Field">
          <label htmlFor="sb-cover">Cover page (image):</label>
          <input
            id="sb-cover"
            className="CoverInput"
            type="file"
            accept="image/*"
            onChange={onCoverFile}
          />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn" onClick={selectAllFiltered} disabled={!filteredCount}>
            Select all ({filteredCount})
          </button>
          <button className="btn" onClick={clearAll} disabled={!selectedCount}>
            Clear
          </button>
          <button
            className="btn primary"
            onClick={handleExport}
            onMouseEnter={prefetchPdf}
            onFocus={prefetchPdf}
            disabled={!selectedEntries.length || busy}
            title={!selectedEntries.length ? 'Select some songs first' : 'Export PDF'}
          >
            {busy ? 'Exporting…' : `Export PDF (${selectedEntries.length})`}
          </button>
        </div>
      </div>

      {/* Two-pane region */}
      <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Left pane */}
        <div className="BuilderLeft">
          <div className="Row" style={{ gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
            <div className="Field" style={{ minWidth: 220 }}>
              <label htmlFor="sb-search">Search:</label>
              <input
                id="sb-search"
                type="search"
                placeholder="Title or author"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div className="Field">
              <label htmlFor="sb-tag">Tag:</label>
              <select id="sb-tag" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option>All</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="Field">
              <label htmlFor="sb-country">Country:</label>
              <select
                id="sb-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                <option>All</option>
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="Field">
              <label htmlFor="sb-author">Author:</label>
              <select
                id="sb-author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              >
                <option>All</option>
                {authors.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="Row Small" style={{ marginTop: '.5rem' }}>
            <strong>{selectedCount}</strong> selected
          </div>
          <div className="SongList" role="region" aria-label="Song list" style={{ minHeight: 0, maxHeight: 300, overflow: 'auto', marginTop: 6 }}>
            <div className="gc-list">
              {filtered.map((s) => {
                const checked = selectedIds.has(s.id)
                const authorsLine = Array.isArray(s.authors)
                  ? s.authors.join(', ')
                  : s.authors || ''
                const tags = Array.isArray(s.tags)
                  ? s.tags
                  : s.tags
                  ? String(s.tags)
                      .split(',')
                      .map((t) => t.trim())
                  : []
                const subtitle = [authorsLine || '—', s.country]
                  .filter(Boolean)
                  .join(' • ')
                return (
                  <SongCard
                    key={s.id}
                    title={s.title}
                    subtitle={subtitle}
                    tags={tags}
                    leftSlot={
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggleOne(s.id, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${s.title}`}
                      />
                    }
                    onClick={() => toggleOne(s.id, !checked)}
                  />
                )
              })}
            </div>
          </div>
        </div>

        {/* Right pane */}
        <div className="BuilderRight">
          <strong>Current selection ({selectedEntries.length})</strong>
          <div
            className="PreviewList"
            role="region"
            aria-label="Selected songs"
            style={{ minHeight: 0, maxHeight: 360, overflow: 'auto', marginTop: 6 }}
          >
            <ol className="List" style={{ listStyle: 'decimal inside' }}>
              {selectedEntries.map((s) => (
                <li key={s.id}>
                  {s.title}
                  {Array.isArray(s.authors) && s.authors.length ? (
                    <span className="Small"> — {s.authors.join(', ')}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
