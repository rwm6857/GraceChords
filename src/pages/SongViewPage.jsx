import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import StarButton from '../components/song/StarButton'
import { Helmet } from 'react-helmet-async'
import { stepsBetween, transposeSymPrefer } from '../utils/chordpro'
import { appendDisclaimerIfMissing } from '../utils/chordpro/disclaimer'
import KeySelector from '../components/KeySelector'
import { transposeInstrumental, formatInstrumental } from '../utils/songs/instrumental'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { normalizeSongInput } from '../utils/media/jpgPlanner'
// src/data/index.json is deprecated as a songs source; data now comes from Supabase via useSongs.
import { useSongs } from '../hooks/useSongs'
import { useRole } from '../hooks/useRole'
import { DownloadIcon, MediaIcon, EyeIcon, OneColIcon, TwoColIcon } from '../components/Icons'
import { showToast } from '../utils/app/toast'
import { headOk, clearHeadCache } from '../utils/network/headCache'
import { smartPreviewAndShareJPG } from '../utils/media/smartPreviewAndShareJPG'
import Busy from '../components/Busy'
import { publicUrl } from '../utils/network/publicUrl'
import { Button, Card, Chip, IconButton, PageHeader, Toolbar } from '../components/ui/layout-kit'
import MobileActionSheet from '../components/ui/mobile/MobileActionSheet'
import MobileDock from '../components/ui/mobile/MobileDock'
import { buildChordRowsLayout } from '../utils/songs/chordLineLayout'
import {
  buildSongCatalog,
  getEntryById,
  getGroupByEntryId,
  getLanguageChipLabel,
  resolveGroupEntry,
  writeSongLanguagePreference,
} from '../utils/songs/songCatalog'

// Lazy-loaded heavy modules
let pdfLibPromise
let imageLibPromise

const SITE_URL = 'https://gracechords.com'
const OG_IMAGE_URL = `${SITE_URL}/favicon.ico`

function buildSongSeo(entry, parsed, id){
  const slugFromFile = entry?.filename ? entry.filename.replace(/\.chordpro$/, '') : ''
  const routeSlug = entry?.id || id || slugFromFile || 'song'
  const titleRaw = (parsed?.meta?.title || entry?.title || routeSlug || 'Song') || 'Song'
  const title = String(titleRaw).trim() || 'Song'
  const pageTitle = `${title} – Chord Sheet & Lyrics | GraceChords`
  const tags = Array.isArray(entry?.tags) ? entry.tags : []
  const isIcpSong = tags.some(t => (String(t || '')).toLowerCase() === 'icp')
  const descriptionBase = `Free worship chord sheet and lyrics for "${title}". Transposable, printable, and formatted for worship teams at GraceChords.`
  const description = isIcpSong
    ? `${descriptionBase} Frequently used in InterCP International (ICP) worship and missions contexts.`
    : descriptionBase
  const keywordParts = [
    `${title} chords`,
    `${title} lyrics`,
    'worship chord chart',
    'GraceChords'
  ]
  if (isIcpSong) {
    keywordParts.push(
      `${title} ICP`,
      `${title} InterCP`,
      `${title} Intercorp`,
      `${title} InterCP International`,
      'InterCP worship',
      'ICP worship song'
    )
  }
  const keywords = keywordParts.join(', ')
  const url = `${SITE_URL}/songs/${encodeURIComponent(routeSlug)}`
  const authors = Array.isArray(entry?.authors) ? entry.authors.filter(Boolean) : []
  const names = authors.length ? authors.join(', ') : ''
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'MusicComposition',
    name: title,
    inLanguage: entry?.language || 'en',
    url,
    isFamilyFriendly: true,
    publisher: 'GraceChords'
  }
  if (names) {
    ld.lyricist = names
    ld.composer = names
  }
  if (isIcpSong) {
    ld.isPartOf = {
      '@type': 'Organization',
      name: 'InterCP International',
      alternateName: ['InterCP', 'Intercorp', 'ICP']
    }
  }
  return { pageTitle, description, keywords, url, ld, ogImage: OG_IMAGE_URL, isIcpSong }
}

export default function SongView(){
  const { id } = useParams()
  const navigate = useNavigate()
  const { songs } = useSongs()
  const { isAtLeast } = useRole()
  const SONG_CATALOG = useMemo(() => buildSongCatalog(songs), [songs])
  const entry = useMemo(() => getEntryById(SONG_CATALOG, id), [SONG_CATALOG, id])
  const translationGroup = useMemo(() => getGroupByEntryId(SONG_CATALOG, id), [SONG_CATALOG, id])
  const translationLanguages = translationGroup?.languages || []
  const [parsed, setParsed] = useState(null)
  const [toKey, setToKey] = useState('C')
  const [showChords, setShowChords] = useState(true)
  const [twoColsView, setTwoColsView] = useState(() => {
    try {
      const saved = localStorage.getItem('songView:twoCols')
      if (saved === null) return true
      return saved === '1'
    } catch {
      return true
    }
  })
  const [err, setErr] = useState('')
  const [hasPptx, setHasPptx] = useState(false)
  const [pptxUrl, setPptxUrl] = useState('')
  const [jpgDisabled, setJpgDisabled] = useState(false)
  const [imageLibPromiseState, setImageLibPromiseState] = useState(imageLibPromise)
  const jpgAlerted = useRef(false)
  const [busy, setBusy] = useState(false)
  const lastPlan = useRef(null)
  const [isNarrow, setIsNarrow] = useState(() => {
    try { return window.innerWidth < 600 } catch { return false }
  })
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false)
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false)
  const mobileDockRef = useRef(null)
  const [mobileDockHeight, setMobileDockHeight] = useState(96)
  const songSeo = buildSongSeo(entry, parsed, id)
  const songLdJson = JSON.stringify(songSeo.ld || {})
  const isIcpSong = !!songSeo.isIcpSong
  const mediaYoutube = parsed?.meta?.youtube || parsed?.meta?.meta?.youtube || entry?.youtube || ''

  useEffect(() => {
    if (!entry?.language) return
    writeSongLanguagePreference(entry.language)
  }, [entry?.id, entry?.language])


  useEffect(() => {
    function onResize(){
      try { setIsNarrow(window.innerWidth < 600) } catch {}
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!isNarrow && mobileActionsOpen) setMobileActionsOpen(false)
  }, [isNarrow, mobileActionsOpen])

  useEffect(() => {
    if (!isNarrow) return
    const el = mobileDockRef.current
    if (!el) return
    const update = () => {
      try { setMobileDockHeight(el.offsetHeight || 96) } catch {}
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isNarrow])

  const loadPdfLib = () => {
    if (!pdfLibPromise) {
      pdfLibPromise = import('../utils/pdf_mvp')
    }
    return pdfLibPromise
  }
  const loadImageLib = () => {
    if (!imageLibPromise) {
      imageLibPromise = import('../utils/media/image')
      setImageLibPromiseState(imageLibPromise)
    }
    return imageLibPromise
  }

  // parse chordpro content from DB (no static-file fetch needed)
  useEffect(()=>{
    if(!entry?.chordpro_content) return
    setErr('')
    setParsed(null)
    try {
      const doc = parseChordProOrLegacy(entry.chordpro_content)
      const blocks = (doc.sections || []).map((sec) => ({
        section: sec.label,
        lines: (sec.lines || []).map((ln) => {
          if (ln.instrumental) {
            return {
              type: 'instrumental',
              text: '',
              chords: [],
              comment: false,
              instrumental: ln.instrumental,
            };
          }
          if (ln.comment) {
            return {
              type: 'comment',
              text: ln.comment,
              chords: [],
              comment: true,
            };
          }
          return {
            type: 'lyric',
            text: ln.lyrics || '',
            chords: ln.chords || [],
            comment: false,
          };
        }),
      }))
      const p = { meta: doc.meta, blocks }
      setParsed(p)
      const baseKey = p?.meta?.key || p?.meta?.originalkey || entry.originalKey || 'C'
      setToKey(baseKey)
      const lineCount = blocks.reduce((s,b)=> s + (b.lines?.length || 0), 0)
      const needsCheck = blocks.length > 1 && lineCount > 40
      setJpgDisabled(needsCheck)
      if (needsCheck) loadImageLib()
    } catch(err){
      console.error(err)
      showToast(`Parse error in "${entry.title}". Check ChordPro syntax.`)
      setErr('Failed to parse song')
    }
  }, [entry?.chordpro_content, entry?.title, entry?.originalKey])

  // Neighbor-song content is already in the useSongs() cache — no HTTP prefetch needed.

  // check for PPTX slides
  useEffect(() => {
    if (!entry) return
    setHasPptx(false)
    const slug = entry.filename.replace(/\.chordpro$/, '')
    const url = publicUrl(`pptx/${slug}.pptx`)
    setPptxUrl(url)
    let cancelled = false
    async function check(){
      const ok = await headOk(url, entry.id)
      if (cancelled || !ok) return
      setHasPptx(true)
    }
    check()
    return () => { cancelled = true; clearHeadCache(entry.id) }
  }, [entry])

  // keyboard shortcuts: [ down, ] up
  useEffect(() => {
    function onKey(e){
      const tag = (e.target && e.target.tagName) || ''
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return
      if (e.key === '[') { e.preventDefault(); setToKey(k => transposeSymPrefer(k, -1, /b/.test(String(baseKey)))) }
      if (e.key === ']') { e.preventDefault(); setToKey(k => transposeSymPrefer(k, +1, /b/.test(String(baseKey)))) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [baseKey])



  // JPG single-page guard – only runs once layout/image libs are loaded
  useEffect(() => {
    if (!parsed) return
    if (!imageLibPromiseState) return
    let cancelled = false
    async function check() {
      const ok = await checkJpgSupport()
      if (cancelled) return
      setJpgDisabled(!ok)
    }
    check()
    return () => { cancelled = true }
    // checkJpgSupport closes over buildSong/loadImageLib which are recreated each render;
    // refire is gated by parsed/toKey/imageLibPromiseState only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, toKey, imageLibPromiseState])

  const helmet = (
    <Helmet>
      <title>{songSeo.pageTitle}</title>
      <meta name="description" content={songSeo.description} />
      {songSeo.keywords ? <meta name="keywords" content={songSeo.keywords} /> : null}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="GraceChords" />
      <meta property="og:title" content={songSeo.pageTitle} />
      <meta property="og:description" content={songSeo.description} />
      <meta property="og:url" content={songSeo.url} />
      <meta property="og:image" content={songSeo.ogImage} />
      <link rel="canonical" href={songSeo.url} />
      <script type="application/ld+json">{songLdJson}</script>
    </Helmet>
  )

  if(!entry){
    return (
      <div className="container">
        {helmet}
        <p>Song not found. <Link to="/">Back</Link></p>
      </div>
    )
  }
  if(err){
    return (
      <div className="container">
        {helmet}
        <p style={{color:'#b91c1c'}}>Error: {err}</p>
        <p>Check that <code>public/songs/{entry.filename}</code> exists and is copied to <code>docs/songs/</code> after build.</p>
      </div>
    )
  }
  if(!parsed){
    return (
      <div className="container">
        {helmet}
        <p>Loading…</p>
      </div>
    )
  }

  const slug = entry.filename.replace(/\.chordpro$/, '')
  const title = parsed?.meta?.title || entry.title || slug
  const baseKey = parsed?.meta?.key || parsed?.meta?.originalkey || entry.originalKey || 'C'
  const steps = stepsBetween(baseKey, toKey)
  const baseRootRaw = (String(baseKey).match(/^([A-G][#b]?)/) || [,''])[1]
  const preferFlat = !!(baseRootRaw && /b$/.test(baseRootRaw))

  const buildSong = () => normalizeSongInput({
    title,
    key: toKey,
    capo: parsed?.meta?.capo,
    lyricsBlocks: (parsed.blocks || []).map(b => ({
      section: b.section,
      lines: (b.lines || []).map(ln => {
        if (ln.instrumental) {
          return {
            instrumental: transposeInstrumental(ln.instrumental, steps, preferFlat),
          }
        }
        if (ln.comment) {
          return {
            plain: ln.text,
            chordPositions: [],
            comment: ln.text,
          }
        }
        return {
          plain: ln.text,
          chordPositions: (ln.chords || []).map(c => ({ sym: transposeSymPrefer(c.sym, steps, preferFlat), index: c.index })),
        }
      })
    }))
  })

  async function checkJpgSupport(showAlert = false) {
    const song = buildSong()
    const { planSongForJpg, ensureCanvasFonts } = await loadImageLib()
    const fonts = await ensureCanvasFonts()
    const res = planSongForJpg(song, { fonts, lyricFamily: fonts.lyricFamily, chordFamily: fonts.chordFamily })
    lastPlan.current = res?.plan || null
    const pages = res?.summary?.pages ?? res?.plan?.layout?.pages?.length ?? 99
    const ok = res?.error !== 'MULTI_PAGE' && pages <= 1
    if (!ok && showAlert && !jpgAlerted.current) {
      alert('JPG export supports single-page songs only for now.')
      jpgAlerted.current = true
    }
    return ok
  }

  function prefetchPdf() { loadPdfLib() }
  function prefetchJpg() {
    loadImageLib().then(() => {
      if (parsed) checkJpgSupport(false).then(ok => setJpgDisabled(!ok))
    })
  }

  async function handleDownloadPdf(){
    setBusy(true)
    try {
      const { downloadSingleSongPdf } = await loadPdfLib()
      const res = await downloadSingleSongPdf(buildSong(), { lyricSizePt: 16 })
      lastPlan.current = res?.plan || null
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadJpg(){
    const ok = await checkJpgSupport(true)
    if (!ok) return
    const { downloadSingleSongJpg } = await loadImageLib()
    const slug = entry.filename.replace(/\.chordpro$/, '')
    try {
      const res = await downloadSingleSongJpg(buildSong(), { slug, plan: lastPlan.current })
      if (res?.plan) {
        lastPlan.current = res.plan
      }
      if (res?.error === 'MULTI_PAGE') {
        return
      }
      if (res?.blob) {
        await smartPreviewAndShareJPG(res.blob, res.filename || `${slug}.jpg`)
      }
    } catch (err) {
      console.error(err)
      showToast('Failed to prepare JPG export.')
    }
  }

  function handleDownloadChordPro() {
    const raw = entry?.chordpro_content || ''
    const content = appendDisclaimerIfMissing(raw)
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}.pro`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleDownloadPptx() {
    if (!pptxUrl) return
    try {
      const res = await fetch(pptxUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${slug}.pptx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      console.error('PPTX download failed', err)
      showToast('Failed to download PPTX')
    }
  }

  function handleLanguageSelect(language){
    if (!translationGroup) return
    const next = resolveGroupEntry(translationGroup, language)
    if (!next) return
    writeSongLanguagePreference(language)
    if (next.id !== entry?.id) {
      navigate(`/song/${encodeURIComponent(next.id)}`)
    }
  }

  function toggleColumns(){
    const next = !twoColsView
    setTwoColsView(next)
    try { localStorage.setItem('songView:twoCols', next ? '1' : '0') } catch {}
  }

  const desktopToolbar = !isNarrow ? (
    <Toolbar className="gc-song-toolbar">
      <div className="gc-toolbar__group">
        <KeySelector
          baseKey={baseKey}
          valueKey={toKey}
          onChange={(full) => setToKey(full)}
        />
        <IconButton
          variant={twoColsView ? 'primary' : 'secondary'}
          aria-label={twoColsView ? 'Use 1 column' : 'Use 2 columns'}
          title={twoColsView ? 'Use 1 column' : 'Use 2 columns'}
          onClick={toggleColumns}
        >
          {twoColsView ? <OneColIcon /> : <TwoColIcon />}
        </IconButton>
        <IconButton
          variant={showChords ? 'primary' : 'secondary'}
          aria-label="Toggle chords"
          title="Toggle chords"
          aria-pressed={showChords}
          onClick={() => setShowChords(v => !v)}
        >
          <EyeIcon />
        </IconButton>
      </div>
      <div className="gc-toolbar__actions">
        <div className="gc-download-menu">
          <Button
            variant="primary"
            leftIcon={<DownloadIcon />}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDownloadMenuOpen(v => !v) }}
            onMouseEnter={prefetchPdf}
            onFocus={prefetchPdf}
            loading={busy}
            title="Download"
            aria-haspopup="true"
            aria-expanded={downloadMenuOpen}
          >
            Download
          </Button>
          {downloadMenuOpen && (
            <>
              <button
                type="button"
                className="gc-download-menu__backdrop"
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => setDownloadMenuOpen(false)}
              />
              <div className="gc-download-menu__panel" role="menu" aria-label="Download options">
                <button
                  type="button"
                  role="menuitem"
                  className="gc-download-menu__item"
                  onClick={(e) => { e.preventDefault(); handleDownloadPdf(); setDownloadMenuOpen(false) }}
                  onMouseEnter={prefetchPdf}
                >
                  <DownloadIcon /> PDF
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="gc-download-menu__item"
                  disabled={jpgDisabled}
                  title={jpgDisabled ? 'JPG only supports single-page songs' : undefined}
                  onClick={(e) => { e.preventDefault(); handleDownloadJpg(); setDownloadMenuOpen(false) }}
                  onMouseEnter={prefetchJpg}
                >
                  <DownloadIcon /> JPG
                </button>
                {hasPptx && (
                  <button
                    type="button"
                    role="menuitem"
                    className="gc-download-menu__item"
                    onClick={(e) => { e.preventDefault(); handleDownloadPptx(); setDownloadMenuOpen(false) }}
                  >
                    <DownloadIcon /> PPTX
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="gc-download-menu__item"
                  onClick={(e) => { e.preventDefault(); handleDownloadChordPro(); setDownloadMenuOpen(false) }}
                >
                  <DownloadIcon /> ChordPro
                </button>
              </div>
            </>
          )}
        </div>
        <Button
          variant="primary"
          as={Link}
          to={`/worship/${entry.id}?toKey=${encodeURIComponent(toKey)}`}
          leftIcon={<MediaIcon />}
          title="Worship Mode"
        >
          Worship Mode
        </Button>
        {entry?.gracetracks_url && (
          <a
            href={entry.gracetracks_url}
            target="_blank"
            rel="noopener noreferrer"
            className="gc-btn gc-btn--ghost"
          >
            🎚 Practice on GraceTracks
          </a>
        )}
      </div>
    </Toolbar>
  ) : null

  return (
    <div className="container" style={isNarrow ? { paddingBottom: `calc(${mobileDockHeight}px + var(--space-2))` } : undefined}>
      {helmet}
      <Busy busy={busy} />
      <PageHeader
        title={
          <div className="gc-song-title-row">
            <span>{title}</span>
            {translationLanguages.length > 1 ? (
              <span className="gc-song-language-chips" aria-label="Song language">
                {translationLanguages.map((code) => (
                  <Chip
                    key={code}
                    variant="filter"
                    selected={entry?.language === code}
                    onClick={() => handleLanguageSelect(code)}
                    title={`Switch to ${getLanguageChipLabel(code)}`}
                  >
                    {getLanguageChipLabel(code)}
                  </Chip>
                ))}
              </span>
            ) : null}
            <StarButton songId={entry?.dbId} />
          </div>
        }
        subtitle={`Key: ${baseKey}${parsed?.meta?.capo ? ` • Capo: ${parsed.meta.capo}` : ''}`}
      >
        {(isIcpSong || entry?.tags?.length) && (
          <div className="gc-song-tags">
            {isIcpSong ? (
              <Chip variant="tag" selected className="gc-chip--indigo">InterCP All Nations Worship</Chip>
            ) : null}
            {(entry?.tags || []).map(t => (
              <Chip key={t} variant="tag">{t}</Chip>
            ))}
          </div>
        )}
        {desktopToolbar}
      </PageHeader>

      <Card
        className={`songpage__sheet ${(!isNarrow && twoColsView) ? 'songpage__sheet--two' : ''}`.trim()}
      >
        {(parsed.blocks || []).map((block, bi)=> (
          <div key={bi} className="songpage__block">
            <div className="section">{block.section ? `[${block.section}]` : ''}</div>
                        {(block.lines || []).map((ln, li) => {
                                const key = `${bi}-${li}`
                                if (ln.instrumental) {
                                        if (!showChords) return null
                                        return (
                                                <InstrumentalLine
                                                        key={key}
                                                        spec={ln.instrumental}
                                                        steps={steps}
                                                        preferFlat={preferFlat}
                                                        split={!isNarrow && twoColsView}
                                                />
                                        )
                                }
                                const plain = ln.text || ''
                                if (ln.comment) {
                                        return <div key={key} className="comment">{plain}</div>
                                }
                                const hasChords = !!(ln.chords && ln.chords.length)
                                if (!hasChords && isSectionLabel(plain)) {
                                        return <div key={key} className="section">[{plain.toUpperCase()}]</div>
                                }
                                return (
                                        <MeasuredLine
                                                key={key}
                                                plain={plain}
                                                chords={ln.chords || []}
                                                steps={steps}
                                                showChords={showChords}
                                                preferFlat={preferFlat}
                                        />
                                )
                        })}
          </div>
        ))}
      </Card>

      {(() => {
        const ytId = mediaYoutube ? extractYouTubeId(mediaYoutube) : null
        if (!ytId) return null
        return (
          <div className="gc-ref-video">
            <div className="media__label">Reference Video</div>
            <div className="media__frame">
              <iframe
                title="Reference Video"
                src={`https://www.youtube.com/embed/${ytId}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          </div>
        )
      })()}
      {/* Mobile action bar */}
      {isNarrow && (
        <MobileDock ref={mobileDockRef} role="group" aria-label="Song actions">
          <KeySelector
            baseKey={baseKey}
            valueKey={toKey}
            onChange={(full) => setToKey(full)}
            title="Key"
            style={{ minWidth: 76, padding:'6px 8px', borderRadius:6 }}
          />
          <IconButton label="Toggle chords" onClick={()=> setShowChords(v=>!v)} title="Toggle chords"><EyeIcon /></IconButton>
          <Button variant="primary" leftIcon={<DownloadIcon />} onClick={() => setMobileActionsOpen(true)} title="Download">Download</Button>
          <Button variant="primary" as={Link} to={`/worship/${entry.id}?toKey=${encodeURIComponent(toKey)}`} leftIcon={<MediaIcon />} title="Worship Mode">Worship</Button>
          {isAtLeast('collaborator') && (
            <Button
              variant="secondary"
              as={Link}
              to={`/portal/editor/${entry.id}`}
              title="Edit this song"
              aria-label="Edit this song"
            >
              Edit
            </Button>
          )}
        </MobileDock>
      )}
      <MobileActionSheet
        open={mobileActionsOpen}
        onClose={() => setMobileActionsOpen(false)}
        title="Download"
      >
        <div className="gc-mobile-actions">
          <Button
            variant="primary"
            leftIcon={<DownloadIcon />}
            onClick={(e)=>{ e.preventDefault(); handleDownloadPdf(); setMobileActionsOpen(false) }}
            title="Download PDF"
          >
            PDF
          </Button>
          <Button
            leftIcon={<DownloadIcon />}
            disabled={jpgDisabled}
            onClick={(e)=>{ e.preventDefault(); handleDownloadJpg(); setMobileActionsOpen(false) }}
            title={jpgDisabled ? 'JPG only supports single-page songs' : 'Download JPG'}
          >
            JPG
          </Button>
          {hasPptx ? (
            <Button
              onClick={(e) => { e.preventDefault(); handleDownloadPptx(); setMobileActionsOpen(false) }}
              leftIcon={<DownloadIcon />}
              aria-label="Download PPTX"
              title="Download PPTX"
            >
              PPTX
            </Button>
          ) : null}
          <Button
            leftIcon={<DownloadIcon />}
            onClick={(e) => { e.preventDefault(); handleDownloadChordPro(); setMobileActionsOpen(false) }}
            title="Download ChordPro"
          >
            ChordPro
          </Button>
        </div>
      </MobileActionSheet>
    </div>
  )
}

/* ---------- Helpers ---------- */

// Extract a canonical 11-char YouTube video ID from common URL forms.
// Accepts:
//  - youtu.be/<id>
//  - (subdomain.)youtube.com/watch?v=<id>
//  - (subdomain.)youtube.com/{embed|shorts|live}/<id>
// Rejects lookalike hosts (e.g., notyoutube.com) and overlong inputs.
function extractYouTubeId(input = '') {
  const raw = String(input)
  if (raw.length > 200) return null
  const s = raw.trim()
  const ID = /^[a-zA-Z0-9_-]{11}$/
  if (ID.test(s)) return s

  try {
    const u = new URL(s)
    const host = u.hostname.toLowerCase()
    const h = host.replace(/^www\./, '')
    const isYouTube = (h === 'youtube.com') || h.endsWith('.youtube.com')
    const isYoutuBe = (h === 'youtu.be')
    // youtu.be/<id>
    if (isYoutuBe) {
      const id = u.pathname.split('/').filter(Boolean)[0]
      if (ID.test(id)) return id
    }
    // youtube.com (and subdomains)
    if (isYouTube) {
      // /watch?v=<id>
      const v = u.searchParams.get('v')
      if (ID.test(v)) return v
      // /embed/<id>  /shorts/<id>  /live/<id>
      const parts = u.pathname.split('/').filter(Boolean)
      const ix = parts.findIndex(p => ['embed', 'shorts', 'live'].includes(p))
      if (ix >= 0 && ID.test(parts[ix + 1])) return parts[ix + 1]
    }
  } catch { /* not a URL */ }

  return null
}


function isSectionLabel(text = '') {
  const s = String(text).trim()
  return /^(?:verse(?:\s*\d+)?|chorus|bridge|tag|pre[-\s]?chorus|intro|outro|ending|refrain)\s*\d*$/i.test(s)
}


function InstrumentalLine({ spec, steps, split, preferFlat }) {
  const inst = transposeInstrumental(spec, steps, preferFlat)
  const rows = formatInstrumental(inst, { split })
  if (!rows.length) return null
  return (
    <div style={{ marginBottom: 10 }}>
      {rows.map((line, idx) => (
        <div
          key={idx}
          style={{
            whiteSpace: 'pre',
            fontFamily: 'var(--gc-font-chords)',
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


function MeasuredLine({ plain, chords, steps, showChords, preferFlat }){
  const hostRef = useRef(null)
  const canvasRef = useRef(null)
  const [state, setState] = useState({ rows: [{ text: '', offsets: [] }], padTop: 0 })
  const [measureKey, setMeasureKey] = useState(0)

  useEffect(()=>{
    if(!hostRef.current) return

    // Ensure canvas
    if(!canvasRef.current){
      const cv = document.createElement('canvas')
      cv.width = 1; cv.height = 1
      canvasRef.current = cv
    }
    const ctx = canvasRef.current.getContext('2d')

    // Grab computed styles from the visible lyrics node
    const lyr = hostRef.current.querySelector('.lyrics')
    if (!ctx || !lyr) {
      setState({ rows: [{ text: plain || '', offsets: [] }], padTop: 0 })
      return
    }
    const cs = window.getComputedStyle(lyr)

    // Lyrics font for width measurement
    const lyricFont = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const hostW = hostRef.current.getBoundingClientRect().width || 0

    // Measure pixel offsets for each chord and resolve collisions
    const chordFamilyRaw = window.getComputedStyle(hostRef.current).getPropertyValue('--gc-font-chords')
    const chordFontFamily = chordFamilyRaw?.trim() || `'Fira Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    const chordFontSize = cs.fontSize // match lyric size
    const chordFont = `${cs.fontStyle} 700 ${chordFontSize} ${chordFontFamily}`
    const measureLyric = (text = '') => {
      ctx.font = lyricFont
      return ctx.measureText(text).width
    }
    const measureChord = (text = '') => {
      ctx.font = chordFont
      return ctx.measureText(text).width
    }
    const rows = buildChordRowsLayout({
      plain,
      chords: showChords ? chords : [],
      width: hostW,
      measureLyric,
      measureChord,
      transposeSym: (sym) => transposeSymPrefer(sym, steps, preferFlat),
      spaceWidth: measureLyric(' ') || 0,
    })

    // Estimate chord ascent to reserve vertical space
    ctx.font = chordFont
    const chordM = ctx.measureText('Mg')
    const chordAscent = chordM.actualBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8

    const gap = 4
    const padTop = Math.ceil(chordAscent + gap) // reserve space above lyrics
    setState({ rows, padTop })
  }, [plain, chords, steps, showChords, preferFlat, measureKey])

  // Recalculate on container resize (orientation/viewport changes)
  useEffect(() => {
    const el = hostRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setMeasureKey(k => k + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fallback: window resize
  useEffect(() => {
    function onResize(){ setMeasureKey(k => k + 1) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div ref={hostRef} style={{ marginBottom: 10 }}>
      {(state.rows || []).map((row, rowIndex) => (
        <div
          key={`${rowIndex}-${row.text}`}
          style={{ position:'relative', paddingTop: (showChords && row.offsets.length > 0) ? state.padTop : 0 }}
        >
          {showChords && row.offsets.length > 0 && (
            <div aria-hidden className="chord-layer" style={{position:'absolute', left:0, right:0, top:0}}>
              {row.offsets.map((c, i)=>(
                <span key={i} style={{
                  position:'absolute',
                  left: `${c.left}px`,
                  fontFamily: 'var(--gc-font-chords)',
                  fontWeight: 700
                }}>{c.sym}</span>
              ))}
            </div>
          )}
          <div className="lyrics" style={{ whiteSpace: 'pre' }}>{row.text || '\u00a0'}</div>
        </div>
      ))}
    </div>
  )
}

/* TitleStrip was used only for SongView; removed per request. */
