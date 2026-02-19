// src/components/SongView.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { stepsBetween, transposeSymPrefer } from '../utils/chordpro'
import { resolveChordCollisions } from '../utils/chords'
import KeySelector from './KeySelector'
import { transposeInstrumental, formatInstrumental } from '../utils/instrumental'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { normalizeSongInput } from '../utils/pdf/pdfLayout'
import indexData from '../data/index.json'
import { DownloadIcon, MediaIcon, EyeIcon, OneColIcon, TwoColIcon } from './Icons'
import { fetchTextCached } from '../utils/fetchCache'
import { showToast } from '../utils/toast'
import { headOk, clearHeadCache } from '../utils/headCache'
import { smartPreviewAndShareJPG } from '../utils/smartPreviewAndShareJPG'
import Busy from './Busy'
import Panel from './ui/Panel'
import { publicUrl } from '../utils/publicUrl'
import { Button, Card, Chip, IconButton, InsetCard, PageHeader, Toolbar } from './ui/layout-kit'
import {
  buildSongCatalog,
  getEntryById,
  getGroupByEntryId,
  getLanguageChipLabel,
  resolveGroupEntry,
  writeSongLanguagePreference,
} from '../utils/songCatalog'

// Lazy-loaded heavy modules
let pdfLibPromise
let pdfPlanPromise
let imageLibPromise

const SITE_URL = 'https://gracechords.com'
const OG_IMAGE_URL = `${SITE_URL}/favicon.ico`
const SONG_CATALOG = buildSongCatalog(indexData?.items || [])

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
  const entry = useMemo(() => getEntryById(SONG_CATALOG, id), [id])
  const translationGroup = useMemo(() => getGroupByEntryId(SONG_CATALOG, id), [id])
  const translationLanguages = translationGroup?.languages || []
  const [parsed, setParsed] = useState(null)
  const [toKey, setToKey] = useState('C')
  const [showChords, setShowChords] = useState(true)
  const [showMedia, setShowMedia] = useState(false)
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
  const [pdfLibPromiseState, setPdfLibPromiseState] = useState(pdfLibPromise)
  const [imageLibPromiseState, setImageLibPromiseState] = useState(imageLibPromise)
  const [pdfPlanPromiseState, setPdfPlanPromise] = useState(pdfPlanPromise)
  const jpgAlerted = useRef(false)
  const [busy, setBusy] = useState(false)
  const lastPlan = useRef(null)
  const [isNarrow, setIsNarrow] = useState(() => {
    try { return window.innerWidth < 600 } catch { return false }
  })
  const songSeo = buildSongSeo(entry, parsed, id)
  const songLdJson = JSON.stringify(songSeo.ld || {})
  const isIcpSong = !!songSeo.isIcpSong
  const mediaYoutube = parsed?.meta?.youtube || parsed?.meta?.meta?.youtube || entry?.youtube || ''
  const mediaMp3 = parsed?.meta?.mp3 || parsed?.meta?.meta?.mp3 || entry?.mp3 || ''

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

  const loadPdfLib = () => {
    if (!pdfLibPromise) {
      pdfLibPromise = import('../utils/pdf')
      setPdfLibPromiseState(pdfLibPromise)
    }
    return pdfLibPromise
  }
  const loadImageLib = () => {
    if (!imageLibPromise) {
      imageLibPromise = import('../utils/image')
      setImageLibPromiseState(imageLibPromise)
    }
    return imageLibPromise
  }

  const loadPdfPlan = () => {
    if (!pdfPlanPromise) {
      pdfPlanPromise = import('../utils/pdf/pdfLayout.js')
      setPdfPlanPromise(pdfPlanPromise)
    }
    return pdfPlanPromise
  }

  // load & parse chordpro
  useEffect(()=>{
    if(!entry) return
    setErr('')
    setParsed(null)
    fetch(publicUrl(`songs/${entry.filename}`))
      .then(r => { if(!r.ok) throw new Error(`Song file not found: ${entry.filename}`); return r.text() })
      .then(txt => {
        try {
          const doc = parseChordProOrLegacy(txt)
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
          if (needsCheck) Promise.all([loadPdfPlan(), loadImageLib()])
          try { setShowMedia(localStorage.getItem(`mediaOpen:${entry.id}`) === '1') } catch {}
        } catch(err){
          console.error(err)
          showToast(`Parse error in ${entry.filename}. Check ChordPro syntax.`)
          setErr('Failed to parse song')
        }
      })
      .catch(e => { console.error(e); showToast(`Failed to load ${entry.filename}`); setErr(e?.message || 'Failed to load song') })
  }, [entry])

  // prefetch neighbor songs (no await here)
  useEffect(() => {
    if (!entry) return
    const items = SONG_CATALOG.items || []
    const i = items.findIndex(x => x.id === entry.id)
    const neighbors = [items[i-1], items[i+1]].filter(Boolean)
    neighbors.forEach((n) => {
      const url = publicUrl(`songs/${n.filename}`)
      fetchTextCached(url).catch((err) => {
        console.error(err)
        showToast(`Failed to load ${n.filename}`)
      })
    })
  }, [entry?.id])

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

  // keyboard shortcuts: c toggle chords, [ down, ] up
  useEffect(() => {
    function onKey(e){
      const tag = (e.target && e.target.tagName) || ''
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        setShowChords(v => !v)
        return
      }
      if (e.key === '[') { e.preventDefault(); setToKey(k => transposeSymPrefer(k, -1, /b/.test(String(baseKey)))) }
      if (e.key === ']') { e.preventDefault(); setToKey(k => transposeSymPrefer(k, +1, /b/.test(String(baseKey)))) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  

  // JPG single-page guard – only runs once layout/image libs are loaded
  useEffect(() => {
    if (!parsed) return
    if (!pdfPlanPromiseState || !imageLibPromiseState) return
    let cancelled = false
    async function check() {
      const ok = await checkJpgSupport()
      if (cancelled) return
      setJpgDisabled(!ok)
    }
    check()
    return () => { cancelled = true }
  }, [parsed, toKey, pdfPlanPromiseState, pdfLibPromiseState, imageLibPromiseState])

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
    const [{ chooseBestLayout }, { ensureCanvasFonts }] = await Promise.all([
      loadPdfPlan(),
      loadImageLib()
    ])
    const fonts = await ensureCanvasFonts()
    const ctx = document.createElement('canvas').getContext('2d')
    const makeLyric = (pt) => (text) => { ctx.font = `${pt}px ${fonts.lyricFamily}`; return ctx.measureText(text || '').width }
    const makeChord = (pt) => (text) => { ctx.font = `bold ${pt}px ${fonts.chordFamily}`; return ctx.measureText(text || '').width }
    const res = chooseBestLayout(song, { lyricFamily: fonts.lyricFamily, chordFamily: fonts.chordFamily }, makeLyric, makeChord)
    lastPlan.current = res.plan
    const ok = res.plan.layout.pages.length <= 1
    if (!ok && showAlert && !jpgAlerted.current) {
      alert('JPG export supports single-page songs only for now.')
      jpgAlerted.current = true
    }
    return ok
  }

  function prefetchPdf() { loadPdfLib() }
  function prefetchJpg() {
    Promise.all([loadPdfPlan(), loadImageLib()]).then(() => {
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

  function handleLanguageSelect(language){
    if (!translationGroup) return
    const next = resolveGroupEntry(translationGroup, language)
    if (!next) return
    writeSongLanguagePreference(language)
    if (next.id !== entry?.id) {
      navigate(`/song/${encodeURIComponent(next.id)}`)
    }
  }

  

  return (
    <div className="container" style={isNarrow ? { paddingBottom: 'calc(84px + var(--safe-b))' } : undefined}>
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
          </div>
        }
        subtitle={`Key: ${baseKey}${parsed?.meta?.capo ? ` • Capo: ${parsed.meta.capo}` : ''}`}
        actions={!isNarrow ? (
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
                onClick={() => {
                  const next = !twoColsView
                  setTwoColsView(next)
                  try { localStorage.setItem('songView:twoCols', next ? '1' : '0') } catch {}
                }}
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
              <Button
                variant="primary"
                leftIcon={<DownloadIcon />}
                onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); handleDownloadPdf() }}
                onMouseEnter={prefetchPdf}
                onFocus={prefetchPdf}
                loading={busy}
                title="Download PDF"
              >
                <span className="text-when-wide">Download PDF</span>
                <span className="text-when-narrow">PDF</span>
              </Button>
              <Button
                leftIcon={<DownloadIcon />}
                disabled={jpgDisabled}
                onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); handleDownloadJpg() }}
                onMouseEnter={prefetchJpg}
                onFocus={prefetchJpg}
                title={jpgDisabled ? 'JPG only supports single-page songs' : 'Download JPG'}
              >
                <span className="text-when-wide">Download JPG</span>
                <span className="text-when-narrow">JPG</span>
              </Button>
              {hasPptx && (
                <Button
                  href={pptxUrl}
                  download
                  leftIcon={<DownloadIcon />}
                  aria-label="Download PPTX"
                  title="Download PPTX"
                >
                  <span className="text-when-wide">Download PPTX</span>
                  <span className="text-when-narrow">PPTX</span>
                </Button>
              )}
              <Button
                as={Link}
                to={`/worship/${entry.id}?toKey=${encodeURIComponent(toKey)}`}
                leftIcon={<MediaIcon />}
                title="Open in Worship Mode"
              >
                <span className="text-when-wide">Open in Worship Mode</span>
              </Button>
            </div>
          </Toolbar>
        ) : null}
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

      {(mediaYoutube || mediaMp3) && (
        <Card className="gc-media-panel" style={{ marginTop: 12 }}>
          <Panel
            title={<span style={{ display:'inline-flex', alignItems:'center', gap:8 }}><MediaIcon /> Media</span>}
            open={showMedia}
            onToggle={()=>{ const n=!showMedia; setShowMedia(n); try{ localStorage.setItem(`mediaOpen:${entry.id}`, n?'1':'0') }catch{} }}
          >
            <div className="media__stack">
              {mediaYoutube && (
                <InsetCard className="media__card">
                  <div className="media__label">Reference Video</div>
                  {(() => {
                   const ytId = extractYouTubeId(mediaYoutube)
                   return ytId ? (
                      <div style={{ marginTop: 12 }}>
                        <LiteYouTube id={ytId} />
                      </div>
                    ) : (
                      <Button
                        href={String(mediaYoutube)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ marginTop: 12 }}
                      >
                        Open on YouTube
                      </Button>
                     )
                  })()}
                </InsetCard>
              )}

              {mediaMp3 && (
                <InsetCard className="media__card">
                  <div className="media__label">Audio</div>
                  <audio className="media__audio" controls src={mediaMp3} />
                </InsetCard>
              )}
            </div>
          </Panel>
        </Card>
      )}
      {/* Mobile action bar */}
      {isNarrow && (
        <div className="mobilebar" role="group" aria-label="Song actions" style={{ display:'flex', gap:8 }}>
          <KeySelector
            baseKey={baseKey}
            valueKey={toKey}
            onChange={(full) => setToKey(full)}
            title="Key"
            style={{ flex:'1 0 0', padding:'6px 8px', borderRadius:6 }}
          />
          <IconButton label="Toggle chords" onClick={()=> setShowChords(v=>!v)} title="Toggle chords"><EyeIcon /></IconButton>
          <Button variant="primary" leftIcon={<DownloadIcon />} onClick={(e)=>{ e.preventDefault(); handleDownloadPdf() }} title="Download PDF"><span className="text-when-narrow">PDF</span></Button>
          <Button variant="primary" leftIcon={<DownloadIcon />} disabled={jpgDisabled} onClick={(e)=>{ e.preventDefault(); handleDownloadJpg() }} title={jpgDisabled ? 'JPG only supports single-page songs' : 'Download JPG'}><span className="text-when-narrow">JPG</span></Button>
          {hasPptx && (
            <Button variant="primary" leftIcon={<DownloadIcon />} href={pptxUrl} download aria-label="Download PPTX" title="Download PPTX"><span className="text-when-narrow">PPTX</span></Button>
          )}
          <Button as={Link} to={`/worship/${entry.id}?toKey=${encodeURIComponent(toKey)}`} leftIcon={<MediaIcon />} title="Open in Worship Mode"><span className="text-when-narrow">Worship</span></Button>
        </div>
      )}
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

function LiteYouTube({ id }) {
  const [ready, setReady] = React.useState(false)
  const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
  return (
    <div className="media__frame">
      {ready ? (
        <iframe
          title="YouTube video"
          src={`https://www.youtube.com/embed/${id}?autoplay=1`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{position:'absolute', inset:0, width:'100%', height:'100%', border:0}}
        />
      ) : (
        <button
          onClick={() => setReady(true)}
          aria-label="Play video"
          style={{position:'absolute', inset:0, width:'100%', height:'100%', padding:0, border:0, background:'none', cursor:'pointer'}}
        >
          <img src={thumb} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}} loading="lazy" />
          <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:48}}>▶</div>
        </button>
      )}
    </div>
  )
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
  const [state, setState] = useState({ offsets: [], padTop: 0, chordTop: 0 })
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
    const cs = window.getComputedStyle(lyr)

    // Lyrics font for width measurement
    const lyricFont = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    ctx.font = lyricFont
    const hostW = hostRef.current.getBoundingClientRect().width || 0
    const spaceW = ctx.measureText(' ').width || 0

    // Measure pixel offsets for each chord and resolve collisions
    const chordFamilyRaw = window.getComputedStyle(hostRef.current).getPropertyValue('--gc-font-chords')
    const chordFontFamily = chordFamilyRaw?.trim() || `'Fira Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    const chordFontSize = cs.fontSize // match lyric size
    const chordFont = `${cs.fontStyle} 700 ${chordFontSize} ${chordFontFamily}`

    const chordEntries = (showChords ? chords : []).map(c => ({
      x: ctx.measureText(plain.slice(0, c.index)).width,
      sym: transposeSymPrefer(c.sym, steps, preferFlat),
      w: 0,
    }))
    ctx.font = chordFont
    chordEntries.forEach(entry => { entry.w = ctx.measureText(entry.sym || '').width })
    resolveChordCollisions(chordEntries, spaceW)
    // Special-case triple overlaps: keep center fixed, nudge outer two
    chordEntries.sort((a,b)=> a.x - b.x)
    for (let i = 1; i < chordEntries.length - 1; i++) {
      const L = chordEntries[i-1], M = chordEntries[i], R = chordEntries[i+1]
      const gapLM = M.x - (L.x + L.w)
      const gapMR = R.x - (M.x + M.w)
      if (gapLM < spaceW && gapMR < spaceW) {
        L.x = Math.min(L.x, M.x - spaceW - L.w)
        R.x = Math.max(R.x, M.x + M.w + spaceW)
      }
    }

    const offsets = chordEntries.map(c => ({
      left: hostW > 0 ? Math.min(Math.max(0, c.x), Math.max(0, hostW - c.w - 2)) : Math.max(0, c.x),
      sym: c.sym
    }))

    // Estimate chord ascent to reserve vertical space
    ctx.font = chordFont
    const chordM = ctx.measureText('Mg')
    const chordAscent = chordM.actualBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8

    const gap = 4
    const padTop = Math.ceil(chordAscent + gap) // reserve space above lyrics
    const chordTop = 0                           // chord layer sits at host top
    setState({ offsets, padTop, chordTop })
  }, [plain, chords, steps, showChords, measureKey])

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
    <div ref={hostRef} style={{position:'relative', marginBottom:10, paddingTop: (showChords && state.offsets.length>0) ? state.padTop : 0}}>
      {showChords && state.offsets.length>0 && (
        <div aria-hidden className="chord-layer" style={{position:'absolute', left:0, right:0, top: state.chordTop}}>
          {state.offsets.map((c, i)=>(
            <span key={i} style={{
              position:'absolute',
              left: `${c.left}px`,
              fontFamily: 'var(--gc-font-chords)',
              fontWeight: 700
            }}>{c.sym}</span>
          ))}
        </div>
      )}
      <div className="lyrics">{plain}</div>
    </div>
  )
}

/* TitleStrip was used only for SongView; removed per request. */
