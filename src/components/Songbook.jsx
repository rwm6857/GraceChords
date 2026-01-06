// src/components/Songbook.jsx
import { useMemo, useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Fuse from 'fuse.js'
import indexData from '../data/index.json'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { compareSongsByTitle } from '../utils/sort'
import { normalizeSongInput } from '../utils/pdf/pdfLayout'
import { fetchTextCached } from '../utils/fetchCache'
import { showToast } from '../utils/toast'
import { publicUrl } from '../utils/publicUrl'
import { isIncompleteSong } from '../utils/songStatus'
import Busy from './Busy'
import { SongCard } from './ui/Card'
import Button from './ui/Button'
import Input from './ui/Input'
import Toolbar from './ui/Toolbar'
import { PlusIcon, MinusIcon, DownloadIcon, ClearIcon } from './Icons'
import '../styles/songbook.css'
import PageContainer from './layout/PageContainer'
import { filterByTag, pickManyRandom } from '../utils/quickActions'

// Lazy pdf exporters
let pdfLibPromise
const loadPdfLib = () => pdfLibPromise || (pdfLibPromise = import('../utils/pdf'))

function byTitle(a, b) { return compareSongsByTitle(a, b) }

export default function Songbook() {
  // Catalog from index.json (uses .items + .filename)
  const items = useMemo(() => {
    const arr = indexData?.items || []
    const seen = new Set()
    const uniq = []
    for (const s of arr) {
      if (seen.has(s.id)) continue
      if (isIncompleteSong(s)) continue
      seen.add(s.id)
      uniq.push(s)
    }
    return uniq.slice().sort(byTitle)
  }, [])

  const location = useLocation()
  const navigate = useNavigate()
  const quickAppliedRef = useRef(false)

  // Search (match Setlist semantics).
  const [q, setQ] = useState('')

  const fuse = useMemo(() => new Fuse(items, { keys: ['title','tags','authors'], threshold:0.4 }), [items])
  const results = useMemo(() => {
    return q ? fuse.search(q).map(r => r.item) : items.slice().sort(byTitle)
  }, [items, fuse, q])

  // Selection
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const selectedEntries = useMemo(
    () => results.filter((s) => selectedIds.has(s.id)).slice().sort(byTitle),
    [results, selectedIds]
  )
  const filteredCount = results.length
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
    if (!results.length) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const s of results) next.add(s.id)
      return next
    })
  }
  function clearAll() {
    setSelectedIds(new Set())
  }

  function applyQuickAction(key, songs){
    if (!key) return
    const all = songs || []
    const toIds = (list) => new Set(list.map((s) => s.id))
    if (key === 'random10SongCollection'){
      const count = Math.min(10, all.length)
      const picks = count === all.length ? all : pickManyRandom(all, count)
      setSelectedIds(toIds(picks))
      return
    }
    if (key === 'sendMeSongbook'){
      const tags = ['NATION', 'NATIONS', 'MISSION', 'MISSIONS', 'ICP']
      const matches = all.filter((song) => tags.some((t) => filterByTag([song], t).length))
      if (matches.length){
        matches.sort(byTitle)
        setSelectedIds(toIds(matches))
      } else {
        const fallback = pickManyRandom(all, Math.min(5, all.length))
        setSelectedIds(toIds(fallback))
      }
      return
    }
    if (key === 'graceChordsSongbook'){
      const sorted = all.slice().sort(byTitle)
      setSelectedIds(toIds(sorted))
    }
  }

  // Export
  const [cover, setCover] = useState(null)
  const [busy, setBusy] = useState(false)
  const [isMobile, setIsMobile] = useState(() => { try { return window.innerWidth <= 640 } catch { return false } })

  // viewport listener
  useEffect(() => {
    function onResize(){ try { setIsMobile(window.innerWidth <= 640) } catch {} }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search || '')
    const tagsParam = params.get('tags')
    if (!tagsParam) return
    const tags = tagsParam.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    if (!tags.length) return
    const matches = items.filter((s) => {
      const songTags = Array.isArray(s.tags) ? s.tags.map(t => String(t).toLowerCase()) : []
      return songTags.some(t => tags.includes(t))
    })
    if (!matches.length) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      matches.forEach((s) => next.add(s.id))
      return next
    })
  }, [location.search, items])

  useEffect(() => {
    if (quickAppliedRef.current) return
    const quick = location.state?.quickAction
    if (!quick) return
    if (!items.length) return
    applyQuickAction(quick, items)
    quickAppliedRef.current = true
    navigate(location.pathname + (location.search || ''), { replace: true, state: null })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, items.map(s => s.id).join('|')])

  async function handleExport() {
    if (!selectedEntries.length) return
    setBusy(true)
    try {
      const { downloadSongbookPdf } = await loadPdfLib()
      const songs = []
      for (const it of selectedEntries) {
        try {
          const url = publicUrl(`songs/${it.filename}`)
          const txt = await fetchTextCached(url)
          const doc = parseChordProOrLegacy(txt)
          const blocks = (doc.sections || []).map((sec) => ({
            section: sec.label,
            lines: (sec.lines || []).map((ln) => {
              if (ln.instrumental) {
                return {
                  instrumental: {
                    chords: Array.isArray(ln.instrumental?.chords) ? ln.instrumental.chords.slice() : [],
                    repeat: typeof ln.instrumental?.repeat === 'number' ? ln.instrumental.repeat : undefined,
                  },
                }
              }
              if (ln.comment) {
                return {
                  plain: ln.comment,
                  chordPositions: [],
                  comment: ln.comment,
                }
              }
              return {
                plain: ln.lyrics || '',
                chordPositions: (ln.chords || []).map((c) => ({ sym: c.sym, index: c.index })),
              }
            }),
          }))
          const slug = it.filename.replace(/\.chordpro$/, '')
          const song = normalizeSongInput({
            title: doc.meta.title || it.title || slug,
            key: doc.meta.key || doc.meta.originalkey || it.originalKey || 'C',
            capo: doc.meta?.capo,
            lyricsBlocks: blocks,
          })
          songs.push(song)
        } catch(err) {
          console.error(err)
          showToast(`Failed to process ${it.filename}`)
        }
      }
      if (songs.length) {
        await downloadSongbookPdf(songs, { includeTOC: true, coverImageDataUrl: cover })
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
    <PageContainer>
      <Busy busy={busy} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 4 }}>
        <div />
        <h1 style={{ margin: 0 }}>Songbook Builder</h1>
        <div />
      </div>

      {/* Toolbar */}
      <Toolbar className="card" style={{ marginTop: 8 }}>
        <div className="Field" style={{ minWidth: 0 }}>
          <label htmlFor="sb-cover">Upload Cover Image:</label>
          <input
            id="sb-cover"
            className="CoverInput"
            type="file"
            accept="image/*"
            onChange={onCoverFile}
            style={isMobile ? { maxWidth: '50vw', textOverflow:'ellipsis', overflow:'hidden', whiteSpace:'nowrap' } : undefined}
          />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Button onClick={clearAll} disabled={!selectedCount} title="Clear selection" iconLeft={<ClearIcon />}>
            <span className="text-when-wide">Clear</span>
          </Button>
          <Button
            variant="primary"
            onClick={handleExport}
            onMouseEnter={prefetchPdf}
            onFocus={prefetchPdf}
            disabled={!selectedEntries.length || busy}
            title={!selectedEntries.length ? 'Select some songs first' : 'Export PDF'}
            iconLeft={<DownloadIcon />}
          >
            {busy ? 'Exporting…' : (isMobile ? 'PDF' : <><span className="text-when-wide">Export PDF</span><span className="text-when-narrow">PDF</span></>)}
          </Button>
        </div>
      </Toolbar>

      {/* Two-pane region */}
      <div className="BuilderPage" style={{ marginTop: 8 }}>
        <div className="BuilderLeft">
          <section className="setlist-section songbook-add" data-role="add">
            <div className="card setlist-pane">
              <div
                className={['BuilderHeader', 'section-header'].filter(Boolean).join(' ')}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <strong style={{ whiteSpace: 'nowrap' }}>Add songs</strong>
                <Input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Search..."
                  style={{ flex: 1, minWidth: 0 }}
                />
                <Button
                  onClick={selectAllFiltered}
                  disabled={!filteredCount}
                  title="Add all filtered"
                  iconLeft={<PlusIcon />}
                  variant="primary"
                  style={{ marginLeft: 'auto' }}
                >
                  <span className="text-when-wide">Add all ({filteredCount})</span>
                  <span className="text-when-narrow">All</span>
                </Button>
              </div>

              <div
                className={['BuilderScroll', 'setlist-scroll', 'pane--addSongs'].join(' ')}
                style={{ minHeight: 0, flex: '1 1 auto', overflow: 'auto', marginTop: 6 }}
                role="region"
                aria-label="Song list"
              >
                <div
                  className="gc-list"
                  style={{
                    display: 'grid',
                    gap: '.5rem',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  }}
                >
                  {results.map((s) => {
                    const checked = selectedIds.has(s.id)
                    const authorsLine = Array.isArray(s.authors)
                      ? s.authors.join(', ')
                      : (s.authors || '')
                    const subtitle = [authorsLine || '—', s.country]
                      .filter(Boolean)
                      .join(' • ')

                    return (
                      <SongCard
                        key={s.id}
                        title={s.title}
                        subtitle={subtitle}
                        rightSlot={
                          checked ? (
                            <Button
                              aria-label="Remove"
                              title="Remove"
                              onClick={(e) => { e.stopPropagation(); toggleOne(s.id, false) }}
                              iconLeft={<MinusIcon />}
                              iconOnly
                              style={{ color: '#b91c1c' }}
                            />
                          ) : (
                            <Button
                              aria-label="Add"
                              title="Add"
                              variant="primary"
                              onClick={(e) => { e.stopPropagation(); toggleOne(s.id, true) }}
                              iconLeft={<PlusIcon />}
                              iconOnly
                            />
                          )
                        }
                        onClick={() => toggleOne(s.id, !checked)}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right pane */}
        <div className="BuilderRight" style={{ minHeight: 0, display:'flex', flexDirection:'column' }}>
          <section className="setlist-section songbook-current" data-role="current">
            <div className="card setlist-pane">
              <div className="BuilderHeader section-header">
                <strong>Current selection ({selectedEntries.length})</strong>
              </div>
              <div
                className="BuilderScroll pane--currentSet"
                role="region"
                aria-label="Selected songs"
                style={{ minHeight: 0, flex: '1 1 auto', overflow: 'auto', marginTop: 6 }}
              >
                <ol className="List" style={{ listStyle: 'decimal inside', margin: 0, padding: 0 }}>
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
          </section>
        </div>
      </div>
    </PageContainer>
  )
}
