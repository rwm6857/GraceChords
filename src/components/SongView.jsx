// src/components/SongView.jsx
import React, { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { parseChordPro, stepsBetween, transposeSym, KEYS } from '../utils/chordpro'
import { downloadSingleSongPdf } from '../utils/pdf'
import indexData from '../data/index.json'
import { DownloadIcon, TransposeIcon, MediaIcon, EyeIcon } from './Icons'
import { fetchTextCached } from '../utils/fetchCache'

export default function SongView(){
  const { id } = useParams()
  const [entry, setEntry] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [toKey, setToKey] = useState('C')
  const [showChords, setShowChords] = useState(true)
  const [showMedia, setShowMedia] = useState(false)
  const [err, setErr] = useState('')

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
        const p = parseChordPro(txt); setParsed(p)
        const baseKey = p?.meta?.key || p?.meta?.originalkey || entry.originalKey || 'C'
        setToKey(baseKey)
        try { setShowMedia(localStorage.getItem(`mediaOpen:${entry.id}`) === '1') } catch {}
      })
      .catch(e => { console.error(e); setErr(e?.message || 'Failed to load song') })
  }, [entry])

  // prefetch neighbor songs (no await here)
  useEffect(() => {
    if (!entry) return
    const items = indexData?.items || []
    const i = items.findIndex(x => x.id === entry.id)
    const neighbors = [items[i-1], items[i+1]].filter(Boolean)
    const base = ((import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/')
    neighbors.forEach(n => {
      const url = `${base}songs/${n.filename}`
      fetchTextCached(url).catch(()=>{})
    })
  }, [entry?.id])

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

  if(!entry){
    return <div className="container"><p>Song not found. <Link to="/">Back</Link></p></div>
  }
  if(err){
    return (
      <div className="container">
        <p style={{color:'#b91c1c'}}>Error: {err}</p>
        <p>Check that <code>public/songs/{entry.filename}</code> exists and is copied to <code>docs/songs/</code> after build.</p>
        <Link to="/">Back</Link>
      </div>
    )
  }
  if(!parsed){
    return <div className="container"><p>Loading… <Link to="/">Back</Link></p></div>
  }

  const title = parsed?.meta?.title || entry.title
  const baseKey = parsed?.meta?.key || parsed?.meta?.originalkey || entry.originalKey || 'C'
  const steps = stepsBetween(baseKey, toKey)

  async function handleDownload(){
    const blocks = (parsed.blocks || []).map(b => ({
      section: b.section,
      lines: (b.lines || []).map(ln => ({
        plain: ln.text,
        chordPositions: (ln.chords || []).map(c => ({ sym: transposeSym(c.sym, steps), index: c.index }))
      }))
    }))
    await downloadSingleSongPdf({ title, key: toKey, lyricsBlocks: blocks }, { lyricSizePt: 16, chordSizePt: 16 })
  }

  return (
    <div className="container">
      <div className="songpage__top">
        <Link to="/" className="back">← Back</Link>
        <div style={{flex:1}}>
          <h1 className="songpage__title">{title}</h1>
          <div className="songpage__meta">Key: <strong>{baseKey}</strong>{entry.tags?.length ? ` • ${entry.tags.join(', ')}` : ''}</div>
        </div>
      </div>

      <div className="toolbar">
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <span title="Transpose"><TransposeIcon /></span>
          <select value={toKey} onChange={e=> setToKey(e.target.value)}>
            {KEYS.map(k=> <option key={k} value={k}>{k}</option>)}
          </select>
          <label style={{display:'inline-flex', alignItems:'center', gap:6}}>
            <input type="checkbox" checked={showChords} onChange={e=> setShowChords(e.target.checked)} />
            <EyeIcon /> Chords
          </label>
        </div>
        <div>
          <button className="btn primary iconbtn" onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); handleDownload() }}>
            <DownloadIcon /> Download PDF
          </button>
        </div>
      </div>

      <div className="songpage__sheet">
        {(parsed.blocks || []).map((block, bi)=> (
          <div key={bi}>
            <div className="section">{block.section ? `[${block.section}]` : ''}</div>
            {(block.lines || []).map((ln, li)=> (
              <MeasuredLine
                key={`${bi}-${li}`}
                plain={ln.text}
                chords={ln.chords || []}
                steps={steps}
                showChords={showChords}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="divider" />

      {(parsed?.meta?.youtube || parsed?.meta?.mp3 || parsed?.meta?.pptx) && (
        <div>
          <button
            className="btn media__toggle"
            onClick={()=>{ const n=!showMedia; setShowMedia(n); try{ localStorage.setItem(`mediaOpen:${entry.id}`, n?'1':'0') }catch{} }}
          >
            {showMedia ? <>Hide media</> : <><MediaIcon /> Show media</>}
          </button>

          <div className={`media__panel ${showMedia ? 'open' : ''}`}>
            {parsed?.meta?.youtube && (
              <div className="media__card" style={{marginTop:10}}>
                <div className="media__label">Reference Video</div>
                <div className="media__frame">
                  {(() => {
                    const ytId = extractYouTubeId(parsed.meta.youtube)
                    return ytId ? (
                      <LiteYouTube id={ytId} />
                    ) : (
                      <a
                        className="btn"
                        href={String(parsed.meta.youtube)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open on YouTube
                      </a>
                    )
                  })()}
                </div>
              </div>
            )}

            {parsed?.meta?.mp3 && (
              <div className="media__card" style={{marginTop:10}}>
                <div className="media__label">Audio</div>
                <audio controls src={parsed.meta.mp3} />
              </div>
            )}

            {parsed?.meta?.pptx && (
              <div className="media__card" style={{marginTop:10}}>
                <div className="media__label">Lyric Slides (PPTX)</div>
                <a className="btn" href={parsed.meta.pptx} download>Download PPTX</a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- Helpers ---------- */

function extractYouTubeId(input = '') {
  const s = String(input).trim()
  const ID = /^[a-zA-Z0-9_-]{11}$/
  if (ID.test(s)) return s

  try {
    const u = new URL(s)
    const host = u.hostname.replace(/^www\./, '')
    // youtu.be/<id>
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0]
      if (ID.test(id)) return id
    }
    // youtube.com
    if (host.endsWith('youtube.com')) {
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
  return ready ? (
    <iframe
      title="YouTube video"
      width="560" height="315"
      src={`https://www.youtube.com/embed/${id}?autoplay=1`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      style={{border:0, width:'100%', aspectRatio:'16/9'}}
    />
  ) : (
    <button className="media__card" onClick={() => setReady(true)} aria-label="Play video" style={{ padding: 0, width:'100%' }}>
      <div className="media__frame">
        <img src={thumb} alt="" style={{position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover'}} loading="lazy" />
        <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:48}}>▶</div>
      </div>
    </button>
  )
}

function MeasuredLine({ plain, chords, steps, showChords }){
  const hostRef = useRef(null)
  const canvasRef = useRef(null)
  const [state, setState] = useState({ offsets: [], padTop: 0, chordTop: 0 })

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

    // Measure pixel offsets for each chord
    const offsets = (showChords ? chords : []).map(c => ({
      left: ctx.measureText(plain.slice(0, c.index)).width,
      sym: transposeSym(c.sym, steps)
    }))

    // Estimate chord ascent to reserve vertical space
    const chordFontFamily = `'Noto Sans Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    const chordFontSize = cs.fontSize // match lyric size
    ctx.font = `${cs.fontStyle} 700 ${chordFontSize} ${chordFontFamily}`
    const chordM = ctx.measureText('Mg')
    const chordAscent = chordM.actualBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8

    const gap = 4
    const padTop = Math.ceil(chordAscent + gap) // reserve space above lyrics
    const chordTop = 0                           // chord layer sits at host top
    setState({ offsets, padTop, chordTop })
  }, [plain, chords, steps, showChords])

  return (
    <div ref={hostRef} style={{position:'relative', marginBottom:10, paddingTop: showChords ? state.padTop : 0}}>
      {showChords && state.offsets.length>0 && (
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
