// src/components/SongView.jsx
import React, { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { stepsBetween, transposeSym, KEYS } from '../utils/chordpro'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { normalizeSongInput } from '../utils/pdf/pdfLayout'
import indexData from '../data/index.json'
import { DownloadIcon, TransposeIcon, MediaIcon, EyeIcon, PlusIcon, MinusIcon } from './Icons'
import { fetchTextCached } from '../utils/fetchCache'
import { showToast } from '../utils/toast'
import { headOk, clearHeadCache } from '../utils/headCache'
import Busy from './Busy'
import Panel from './ui/Panel'

// Lazy-loaded heavy modules
let pdfLibPromise
let pdfPlanPromise
let imageLibPromise

export default function SongView(){
  const { id } = useParams()
  const [entry, setEntry] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [toKey, setToKey] = useState('C')
  const [showChords, setShowChords] = useState(true)
  const [showMedia, setShowMedia] = useState(false)
  const [twoColsView, setTwoColsView] = useState(() => {
    try { return localStorage.getItem('songView:twoCols') === '1' } catch { return false }
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

  // find the index item
  useEffect(()=>{
    const it = (indexData?.items || []).find(x => String(x.id) === String(id)) || null
    setEntry(it)
  }, [id])

  // load & parse chordpro
  useEffect(()=>{
    if(!entry) return
    setErr('')
    setParsed(null)
    const base = ((import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/')
    fetch(`${base}songs/${entry.filename}`)
      .then(r => { if(!r.ok) throw new Error(`Song file not found: ${entry.filename}`); return r.text() })
      .then(txt => {
        try {
          const doc = parseChordProOrLegacy(txt)
          const blocks = (doc.sections || []).map(sec => ({
            section: sec.label,
            lines: (sec.lines || []).map(ln => ({
              text: ln.comment || ln.lyrics || '',
              chords: ln.chords || [],
              comment: !!ln.comment
            }))
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
    const items = indexData?.items || []
    const i = items.findIndex(x => x.id === entry.id)
    const neighbors = [items[i-1], items[i+1]].filter(Boolean)
    const base = ((import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/')
    neighbors.forEach((n) => {
      const url = `${base}songs/${n.filename}`
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
    const base = ((import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/')
    const url = `${base}pptx/${slug}.pptx`
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
      if (e.key === '[') { e.preventDefault(); setToKey(k => transposeSym(k, -1)) }
      if (e.key === ']') { e.preventDefault(); setToKey(k => transposeSym(k, +1)) }
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

if(!entry){
    return <div className="container"><p>Song not found. <Link to="/">Back</Link></p></div>
  }
  if(err){
    return (
      <div className="container">
        <p style={{color:'#b91c1c'}}>Error: {err}</p>
        <p>Check that <code>public/songs/{entry.filename}</code> exists and is copied to <code>docs/songs/</code> after build.</p>
      </div>
    )
  }
  if(!parsed){
    return <div className="container"><p>Loading…</p></div>
  }

  const slug = entry.filename.replace(/\.chordpro$/, '')
  const title = parsed?.meta?.title || entry.title || slug
  const baseKey = parsed?.meta?.key || parsed?.meta?.originalkey || entry.originalKey || 'C'
  const steps = stepsBetween(baseKey, toKey)

  const pptxButton = hasPptx ? (
    <a className="btn" href={pptxUrl} download>
      Download PPTX
    </a>
  ) : null

  const buildSong = () => normalizeSongInput({
    title,
    key: toKey,
    capo: parsed?.meta?.capo,
    lyricsBlocks: (parsed.blocks || []).map(b => ({
      section: b.section,
      lines: (b.lines || []).map(ln => ({
        plain: ln.text,
        chordPositions: (ln.chords || []).map(c => ({ sym: transposeSym(c.sym, steps), index: c.index })),
        comment: ln.comment ? ln.text : undefined
      }))
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
    await downloadSingleSongJpg(buildSong(), { slug: entry.filename.replace(/\.chordpro$/, ''), plan: lastPlan.current })
  }

  

  return (
    <div className="container" style={isNarrow ? { paddingBottom: 'calc(84px + var(--safe-b))' } : undefined}>
      <Busy busy={busy} />
      <div className="songpage__top">
        <div style={{flex:1}}>
          <h1 className="songpage__title">{title}</h1>
          <div className="songpage__meta">Key: <strong>{baseKey}</strong>{parsed?.meta?.capo ? ` • Capo: ${parsed.meta.capo}` : ''}{entry.tags?.length ? ` • ${entry.tags.join(', ')}` : ''}</div>
        </div>
      </div>

      {!isNarrow && (
      <div className="toolbar card">
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <span title="Transpose"><TransposeIcon /></span>
          <select value={toKey} onChange={e=> setToKey(e.target.value)}>
            {KEYS.map(k=> <option key={k} value={k}>{k}</option>)}
          </select>
          <label style={{display:'inline-flex', alignItems:'center', gap:6}} title="Toggle chords">
            <input type="checkbox" checked={showChords} onChange={e=> setShowChords(e.target.checked)} />
            <EyeIcon /> <span className="text-when-wide">Chords</span>
          </label>
          <label style={{display:'inline-flex', alignItems:'center', gap:6}} title="Toggle two-column reading view">
            <input
              type="checkbox"
              checked={twoColsView}
              onChange={e=> {
                const v = e.target.checked
                setTwoColsView(v)
                try { localStorage.setItem('songView:twoCols', v ? '1' : '0') } catch {}
              }}
            />
            View: {twoColsView ? '2 columns' : '1 column'}
          </label>
        </div>
        <div style={{display:'flex', gap:10}}>
          <button
            className="btn primary iconbtn"
            onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); handleDownloadPdf() }}
            onMouseEnter={prefetchPdf}
            onFocus={prefetchPdf}
            disabled={busy}
            title="Download PDF"
          >
            {busy ? 'Exporting…' : <>
              <DownloadIcon /> <span className="text-when-wide">Download PDF</span>
              <span className="text-when-narrow">PDF</span>
            </>}
          </button>
          <button
            className="btn iconbtn"
            disabled={jpgDisabled}
            onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); handleDownloadJpg() }}
            onMouseEnter={prefetchJpg}
            onFocus={prefetchJpg}
            title={jpgDisabled ? 'JPG only supports single-page songs' : 'Download JPG'}
          >
            <DownloadIcon /> <span className="text-when-wide">Download JPG</span>
            <span className="text-when-narrow">JPG</span>
          </button>
          <Link
            className="btn iconbtn"
            to={`/worship/${entry.id}?toKey=${encodeURIComponent(toKey)}`}
            title="Open in Worship Mode"
          >
            <MediaIcon /> <span className="text-when-wide">Open in Worship Mode</span>
          </Link>
        </div>
      </div>
      )}

      <div
        className="songpage__sheet"
        style={!isNarrow && twoColsView ? { columnCount: 2, columnGap: '24px' } : undefined}
      >
        {(parsed.blocks || []).map((block, bi)=> (
          <div key={bi} style={!isNarrow && twoColsView ? { breakInside: 'avoid' } : undefined}>
            <div className="section">{block.section ? `[${block.section}]` : ''}</div>
                        {(block.lines || []).map((ln, li) => {
                                const key = `${bi}-${li}`
                                const plain = ln.text || ''
                                if (ln.comment) {
                                        return <div key={key} className="comment" style={{fontStyle:'italic', fontSize:'0.85em', opacity:0.75}}>{plain}</div>
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
                                        />
                                )
                        })}
          </div>
        ))}
      </div>

      <div className="divider" />

      {(() => {
        const metaYoutube = parsed?.meta?.youtube || parsed?.meta?.meta?.youtube
        const metaMp3 = parsed?.meta?.mp3 || parsed?.meta?.meta?.mp3
        return (metaYoutube || metaMp3 || hasPptx)
      })() && (
        <div style={{ marginTop: 12 }}>
          <Panel
            title={<span style={{ display:'inline-flex', alignItems:'center', gap:8 }}><MediaIcon /> Media</span>}
            open={showMedia}
            onToggle={()=>{ const n=!showMedia; setShowMedia(n); try{ localStorage.setItem(`mediaOpen:${entry.id}`, n?'1':'0') }catch{} }}
          >
            {pptxButton && (
              <div className="media__card" style={{marginTop:10}}>
                <div className="media__label">Lyric Slides (PPTX)</div>
                <div style={{ marginTop: 12 }}>
                  {pptxButton}
                </div>
              </div>
            )}

            {(() => {
              const metaYoutube = parsed?.meta?.youtube || parsed?.meta?.meta?.youtube
              return metaYoutube
            })() && (
              <div className="media__card" style={{marginTop:10}}>
                <div className="media__label">Reference Video</div>
                {(() => {
                 const metaYoutube = parsed?.meta?.youtube || parsed?.meta?.meta?.youtube
                 const ytId = extractYouTubeId(metaYoutube)
                 return ytId ? (
                    <div style={{ marginTop: 12 }}>
                      <LiteYouTube id={ytId} />
                    </div>
                  ) : (
                    <a
                      style={{ marginTop: 12, display: 'inline-block' }}
                      className="btn"
                      href={String(metaYoutube)}
                      target="_blank"
                      rel="noopener noreferrer"
                     >
                      Open on YouTube
                    </a>
                   )
                })()}
              </div>
            )}

            {(() => {
              const metaMp3 = parsed?.meta?.mp3 || parsed?.meta?.meta?.mp3
              return metaMp3
            })() && (
              <div className="media__card" style={{marginTop:10}}>
                <div className="media__label">Audio</div>
                <audio controls src={(parsed?.meta?.mp3 || parsed?.meta?.meta?.mp3)} />
              </div>
            )}
          </Panel>
        </div>
      )}
      {/* Mobile action bar */}
      {isNarrow && (
        <div className="mobilebar" role="group" aria-label="Song actions" style={{ display:'flex', gap:8 }}>
          <button className="gc-btn" style={{ flex:'1 0 0' }} onClick={()=> setToKey(k => transposeSym(k, -1))} title="Transpose down"><MinusIcon /></button>
          <select value={toKey} onChange={e=> setToKey(e.target.value)} title="Key" style={{ flex:'1 0 0', padding:'6px 8px', borderRadius:6 }}>
            {KEYS.map(k=> <option key={k} value={k}>{k}</option>)}
          </select>
          <button className="gc-btn" style={{ flex:'1 0 0' }} onClick={()=> setShowChords(v=>!v)} title="Toggle chords"><EyeIcon /></button>
          <button className="gc-btn" style={{ flex:'1 0 0' }} onClick={()=> setToKey(k => transposeSym(k, +1))} title="Transpose up"><PlusIcon /></button>
          <button className="gc-btn gc-btn--primary" onClick={(e)=>{ e.preventDefault(); handleDownloadPdf() }} title="Download PDF"><DownloadIcon /><span className="text-when-narrow">PDF</span></button>
          <button className="gc-btn gc-btn--primary" disabled={jpgDisabled} onClick={(e)=>{ e.preventDefault(); handleDownloadJpg() }} title={jpgDisabled ? 'JPG only supports single-page songs' : 'Download JPG'}><DownloadIcon /><span className="text-when-narrow">JPG</span></button>
          <Link className="gc-btn" to={`/worship/${entry.id}?toKey=${encodeURIComponent(toKey)}`} title="Open in Worship Mode"><MediaIcon /><span className="text-when-narrow">Worship</span></Link>
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


function MeasuredLine({ plain, chords, steps, showChords }){
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
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const hostW = hostRef.current.getBoundingClientRect().width || 0

    // Measure pixel offsets for each chord; clamp to container to avoid spill
    let offsets = (showChords ? chords : []).map(c => ({
      left: ctx.measureText(plain.slice(0, c.index)).width,
      sym: transposeSym(c.sym, steps)
    }))

    // Estimate chord ascent to reserve vertical space
    const chordFontFamily = `'Fira Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    const chordFontSize = cs.fontSize // match lyric size
    ctx.font = `${cs.fontStyle} 700 ${chordFontSize} ${chordFontFamily}`
    const chordM = ctx.measureText('Mg')
    const chordAscent = chordM.actualBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8

    // Clamp chords near line end (2px safety)
    offsets = offsets.map(o => {
      const w = ctx.measureText(o.sym).width
      const maxLeft = Math.max(0, hostW - w - 2)
      return { ...o, left: Math.min(o.left, maxLeft) }
    })

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
