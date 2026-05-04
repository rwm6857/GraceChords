import { useMemo, useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSongs } from '../hooks/useSongs'
import { searchSongs } from '../utils/songs/search'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { formatChord, formatKeyDisplay } from '../utils/chordpro/solfege'
import { useChordStyle } from '../hooks/useSettings'
import { compareSongsByTitle } from '../utils/songs/sort'
import { showToast } from '../utils/app/toast'
import { isIncompleteSong } from '../utils/songs/songStatus'
import {
  buildSongCatalog,
  getLanguageChipLabel,
  hasGroupLanguage,
  resolveGroupEntry,
  resolveInitialSongLanguage,
  writeSongLanguagePreference,
} from '../utils/songs/songCatalog'
import Busy from '../components/Busy'
import { Button, Card, Chip, Field, IconButton, Input, PageHeader, SongCard } from '../components/ui/layout-kit'
import { PlusIcon, MinusIcon, DownloadIcon, ClearIcon, SlidersIcon, CloudUploadIcon, TrashIcon } from '../components/Icons'
import MobileActionSheet from '../components/ui/mobile/MobileActionSheet'
import MobilePaneTabs from '../components/ui/mobile/MobilePaneTabs'
import '../styles/songbook.css'
import PageContainer from '../components/layout/PageContainer'
import { filterByTag, pickManyRandom } from '../utils/songs/quickActions'

// Lazy pdf exporters
let pdfLibPromise
const loadPdfLib = () => pdfLibPromise || (pdfLibPromise = import('../utils/pdf_mvp'))

function byTitle(a, b) { return compareSongsByTitle(a, b) }

export default function Songbook() {
  const { t } = useTranslation('pages')
  const { songs } = useSongs()
  const chordStyle = useChordStyle()
  const catalog = useMemo(() => buildSongCatalog(songs), [songs])
  const allSongsById = catalog.byId
  const languageChipCodes = catalog.translationLanguages || []
  const [selectedLanguage, setSelectedLanguage] = useState(() =>
    resolveInitialSongLanguage(languageChipCodes.length ? languageChipCodes : catalog.allLanguages)
  )
  const items = useMemo(() => {
    const out = []
    for (const group of catalog.groups || []) {
      let display = resolveGroupEntry(group, selectedLanguage)
      if (!display) continue
      if (isIncompleteSong(display)) {
        const fallback = group.variants.find((v) => !isIncompleteSong(v))
        if (!fallback) continue
        display = fallback
      }
      out.push({
        ...display,
        hasSelectedLanguage: hasGroupLanguage(group, selectedLanguage),
        searchTitles: group.variants.map((v) => v.title || '').filter(Boolean),
        searchTags: Array.from(new Set(group.variants.flatMap((v) => v.tags || []))),
        searchAuthors: Array.from(new Set(group.variants.flatMap((v) => v.authors || []))),
      })
    }
    return out.slice().sort((a, b) => {
      if (a.hasSelectedLanguage !== b.hasSelectedLanguage) {
        return a.hasSelectedLanguage ? -1 : 1
      }
      return byTitle(a, b)
    })
  }, [catalog.groups, selectedLanguage])

  const location = useLocation()
  const navigate = useNavigate()
  const quickAppliedRef = useRef(false)

  useEffect(() => {
    writeSongLanguagePreference(selectedLanguage)
  }, [selectedLanguage])

  // Search (match Setlist semantics).
  const [q, setQ] = useState('')

  const results = useMemo(() => {
    const base = q ? searchSongs(items, q).map((r) => r.item) : items.slice()
    base.sort((a, b) => {
      if (a.hasSelectedLanguage !== b.hasSelectedLanguage) {
        return a.hasSelectedLanguage ? -1 : 1
      }
      return byTitle(a, b)
    })
    return base
  }, [items, q])

  // Selection
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const selectedEntries = useMemo(
    () => Array.from(selectedIds).map((id) => allSongsById.get(id)).filter(Boolean).slice().sort(byTitle),
    [selectedIds, allSongsById]
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
      const tags = ['NATION', 'NATIONS', 'MISSION', 'MISSIONS', 'COMMUNITY']
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
  const [coverName, setCoverName] = useState(null)
  const [coverDragOver, setCoverDragOver] = useState(false)
  const coverDialogRef = useRef(null)
  const coverFileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [isMobile, setIsMobile] = useState(() => { try { return window.innerWidth <= 640 } catch { return false } })
  const [isStacked, setIsStacked] = useState(() => { try { return window.innerWidth <= 900 } catch { return false } })
  const [mobileTab, setMobileTab] = useState(() => {
    try { return localStorage.getItem('songbook:mobileTab') || 'add' } catch { return 'add' }
  })
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false)

  // viewport listener
  useEffect(() => {
    function onResize(){
      try {
        const w = window.innerWidth
        setIsMobile(w <= 640)
        setIsStacked(w <= 900)
      } catch {}
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!isStacked && mobileActionsOpen) setMobileActionsOpen(false)
  }, [isStacked, mobileActionsOpen])

  useEffect(() => {
    try { localStorage.setItem('songbook:mobileTab', mobileTab) } catch {}
  }, [mobileTab])

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
          const doc = parseChordProOrLegacy(it.chordpro_content || '')
          const blocks = (doc.sections || []).map((sec) => ({
            section: sec.label,
            lines: (sec.lines || []).map((ln) => {
              if (ln.instrumental) {
                const rawChords = Array.isArray(ln.instrumental?.chords) ? ln.instrumental.chords : []
                return {
                  instrumental: {
                    chords: rawChords.map(s => formatChord(s, { style: chordStyle })),
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
                chordPositions: (ln.chords || []).map((c) => ({ sym: formatChord(c.sym, { style: chordStyle }), index: c.index })),
              }
            }),
          }))
          const rawKey = doc.meta?.key || doc.meta?.originalkey || it.originalKey || 'C'
          const song = {
            title: doc.meta?.title || it.title,
            key: formatKeyDisplay(rawKey, chordStyle),
            capo: doc.meta?.capo,
            lyricsBlocks: blocks,
          }
          songs.push(song)
        } catch(err) {
          console.error(err)
          showToast(t('setlist.failedProcess', { title: it.title }))
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

  function handleCoverFileObj(f) {
    if (!f) return
    if (f.size > 2 * 1024 * 1024) { showToast(t('songbook.imageTooLarge')); return }
    if (!f.type.startsWith('image/')) { showToast(t('songbook.fileMustBeImage')); return }
    const reader = new FileReader()
    reader.onload = () => {
      setCover(String(reader.result || ''))
      setCoverName(f.name)
      coverDialogRef.current?.close()
    }
    reader.readAsDataURL(f)
  }

  function onCoverFile(e) {
    const f = e.target.files?.[0]
    handleCoverFileObj(f)
    e.target.value = ''
  }

  function clearCover(){
    setCover(null)
    setCoverName(null)
  }

  // Render
  if (items.length === 0) {
    return (
      <div className="container">
        <h1>{t('songbook.noSongsFound')}</h1>
        <p className="Small">{t('songbook.indexEmpty')}</p>
      </div>
    )
  }

  return (
    <PageContainer className="is-songbook">
      <Busy busy={busy} />
      <PageHeader
        title={t('songbook.title')}
        actions={(
          <div className="gc-toolbar__actions">
            {!isStacked ? (
              <Button onClick={clearAll} disabled={!selectedCount} title={t('songbook.clearTooltip')} leftIcon={<ClearIcon />}>
                <span className="text-when-wide">{t('songbook.clear')}</span>
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={handleExport}
              onMouseEnter={prefetchPdf}
              onFocus={prefetchPdf}
              disabled={!selectedEntries.length || busy}
              loading={busy}
              title={!selectedEntries.length ? t('songbook.exportPdfDisabled') : t('songbook.exportPdfTooltip')}
              leftIcon={<DownloadIcon />}
            >
              {isMobile ? t('songbook.exportPdfShort') : <><span className="text-when-wide">{t('songbook.exportPdf')}</span><span className="text-when-narrow">{t('songbook.exportPdfShort')}</span></>}
            </Button>
            {isStacked ? (
              <IconButton
                label={t('songbook.moreActions')}
                title={t('songbook.moreActions')}
                onClick={() => setMobileActionsOpen(true)}
              >
                <SlidersIcon />
              </IconButton>
            ) : null}
          </div>
        )}
      />

      {isStacked ? (
        <MobilePaneTabs
          value={mobileTab}
          onChange={setMobileTab}
          addLabel={t('songbook.addSongsTab')}
          currentLabel={t('songbook.currentTab', { count: selectedEntries.length })}
        />
      ) : null}

      {/* Two-pane region */}
      <div className="BuilderPage gc-overflow-safe" style={{ marginTop: 8 }}>
        <div className="BuilderLeft builder-pane" hidden={isStacked && mobileTab !== 'add'}>
          <section className="setlist-section songbook-add" data-role="add">
            <Card className="setlist-pane">
              <div
                className={['BuilderHeader', 'section-header'].filter(Boolean).join(' ')}
                style={{ display: 'grid', gap: 8 }}
              >
                <div className="builder-search-row">
                  <strong style={{ whiteSpace: 'nowrap' }}>{t('songbook.addSongs')}</strong>
                  <Input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder={t('songbook.search')}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  {!isStacked ? (
                    <Button
                      onClick={selectAllFiltered}
                      disabled={!filteredCount}
                      title={t('songbook.addAllTooltip')}
                      leftIcon={<PlusIcon />}
                      variant="primary"
                      style={{ marginLeft: 'auto' }}
                    >
                      <span className="text-when-wide">{t('songbook.addAll', { count: filteredCount })}</span>
                      <span className="text-when-narrow">{t('songbook.addAllShort')}</span>
                    </Button>
                  ) : null}
                </div>
                {isStacked ? (
                  <div className="builder-options-row">
                    <Button
                      onClick={selectAllFiltered}
                      disabled={!filteredCount}
                      title={t('songbook.addAllTooltip')}
                      leftIcon={<PlusIcon />}
                      variant="primary"
                    >
                      {t('songbook.addAll', { count: filteredCount })}
                    </Button>
                  </div>
                ) : null}
              </div>
              {languageChipCodes.length > 0 ? (
                <div className={['BuilderHeader', 'section-header'].filter(Boolean).join(' ')} style={{ paddingTop: 0, display:'flex', alignItems:'center', gap:8 }}>
                  <span className="meta">{t('songbook.language')}</span>
                  <div className="tagbar">
                    {languageChipCodes.map((code) => (
                      <Chip
                        key={code}
                        variant="filter"
                        selected={selectedLanguage === code}
                        onClick={() => setSelectedLanguage(code)}
                        title={t('songbook.languageTooltip', { language: getLanguageChipLabel(code) })}
                      >
                        {getLanguageChipLabel(code)}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="gc-cover-btn-row">
                {cover ? (
                  <div className="gc-cover-chip">
                    <span className="gc-cover-chip__name" title={coverName}>{coverName}</span>
                    <button type="button" className="gc-cover-chip__remove" aria-label={t('songbook.removeCover')} onClick={clearCover}>
                      <TrashIcon style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                ) : (
                  <Button variant="secondary" size="sm" leftIcon={<CloudUploadIcon />} onClick={() => coverDialogRef.current?.showModal()}>
                    {t('songbook.uploadCover')}
                  </Button>
                )}
              </div>
              <dialog
                ref={coverDialogRef}
                className="gc-cover-dialog"
                onClick={(e) => { if (e.target === coverDialogRef.current) coverDialogRef.current.close() }}
              >
                <div className="gc-cover-dialog__inner">
                  <div className="gc-cover-dialog__header">
                    <strong>{t('songbook.uploadCoverDialogTitle')}</strong>
                    <button type="button" className="gc-cover-dialog__close" aria-label={t('songbook.close')} onClick={() => coverDialogRef.current?.close()}>×</button>
                  </div>
                  <div
                    className={`gc-cover-dropzone${coverDragOver ? ' gc-cover-dropzone--over' : ''}`}
                    onClick={() => coverFileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setCoverDragOver(true) }}
                    onDragLeave={() => setCoverDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setCoverDragOver(false); handleCoverFileObj(e.dataTransfer.files?.[0]) }}
                  >
                    <CloudUploadIcon style={{ width: 36, height: 36, opacity: 0.45 }} />
                    <p>{t('songbook.dropImage')}<br />{t('songbook.or')} <span className="gc-cover-dropzone__link">{t('songbook.clickToBrowse')}</span></p>
                    <p className="gc-cover-dropzone__hint">{t('songbook.coverHint')}</p>
                  </div>
                  <input ref={coverFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onCoverFile} />
                </div>
              </dialog>

              <div
                className={['BuilderScroll', 'setlist-scroll', 'pane--addSongs'].join(' ')}
                style={{ minHeight: 0, flex: '1 1 auto', overflow: 'auto', marginTop: 6 }}
                role="region"
                aria-label={t('songbook.songListAria')}
              >
                <div className="gc-list">
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
                            <IconButton
                              variant="destructive"
                              aria-label={t('songbook.removeAria')}
                              title={t('songbook.removeAria')}
                              onClick={(e) => { e.stopPropagation(); toggleOne(s.id, false) }}
                            >
                              <MinusIcon />
                            </IconButton>
                          ) : (
                            <IconButton
                              variant="primary"
                              aria-label={t('songbook.addAria')}
                              title={t('songbook.addAria')}
                              onClick={(e) => { e.stopPropagation(); toggleOne(s.id, true) }}
                            >
                              <PlusIcon />
                            </IconButton>
                          )
                        }
                        onClick={() => toggleOne(s.id, !checked)}
                      />
                    )
                  })}
                </div>
              </div>
            </Card>
          </section>
        </div>

        {/* Right pane */}
        <div className="BuilderRight builder-pane" style={{ minHeight: 0, display:'flex', flexDirection:'column' }} hidden={isStacked && mobileTab !== 'current'}>
          <section className="setlist-section songbook-current" data-role="current">
            <Card className="setlist-pane">
              <div className="BuilderHeader section-header">
                <strong>{t('songbook.currentSelection', { count: selectedEntries.length })}</strong>
              </div>
              <div
                className="BuilderScroll pane--currentSet"
                role="region"
                aria-label={t('songbook.selectedAria')}
                style={{ minHeight: 0, flex: '1 1 auto', overflow: 'auto', marginTop: 6 }}
              >
                {selectedEntries.length ? (
                  <div className="gc-songbook-selected-list">
                    {selectedEntries.map((s) => (
                      <SongCard
                        key={s.id}
                        title={s.title}
                        subtitle={Array.isArray(s.authors) && s.authors.length ? s.authors.join(', ') : '—'}
                        rightSlot={(
                          <IconButton
                            variant="destructive"
                            aria-label={t('songbook.removeNamed', { title: s.title })}
                            title={t('songbook.removeAria')}
                            onClick={(e) => { e.stopPropagation(); toggleOne(s.id, false) }}
                          >
                            <MinusIcon />
                          </IconButton>
                        )}
                        onClick={() => toggleOne(s.id, false)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="meta" style={{ margin: 0 }}>{t('songbook.noSelected')}</p>
                )}
              </div>
            </Card>
          </section>
        </div>
      </div>

      <MobileActionSheet
        open={mobileActionsOpen}
        onClose={() => setMobileActionsOpen(false)}
        title={t('songbook.actionsTitle')}
      >
        <div className="gc-mobile-actions">
          <Button onClick={() => { clearAll(); setMobileActionsOpen(false) }} disabled={!selectedCount} leftIcon={<ClearIcon />}>{t('songbook.clearTooltip')}</Button>
          <Button onClick={() => { clearCover(); setMobileActionsOpen(false) }} disabled={!cover} leftIcon={<ClearIcon />}>{t('songbook.clearCover')}</Button>
        </div>
      </MobileActionSheet>
    </PageContainer>
  )
}
