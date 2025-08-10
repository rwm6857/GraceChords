import React, { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { parseChordPro, stepsBetween, transposeSym, KEYS } from '../utils/chordpro'
import { downloadSingleSongPdf } from '../utils/pdf'
import indexData from '../data/index.json'
import { DownloadIcon, TransposeIcon, MediaIcon, EyeIcon } from './Icons'
import { fetchTextCached } from '../utils/fetchCache'

// --- helpers ---------------------------------------------------------------
function extractYouTubeId(input) {
  if (!input) return ''
  // Already an 11-char ID?
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input
  try {
    const u = new URL(input, 'https://youtube.com')
    // youtu.be/<id>
    const mShort = u.hostname.includes('youtu.be') && u.pathname.slice(1).match(/^([a-zA-Z0-9_-]{11})/)
    if (mShort) return mShort[1]
    // youtube.com/watch?v=<id>
    const v = u.searchParams.get('v')
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v
  } catch {}
  return ''
}

function resolveMedia(url) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  const base = ((import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/')
  return url.startsWith('/') ? base + url.replace(/^\//, '') : base + url
}

// --- component -------------------------------------------------------------
export default function SongView(){
  const { id } = useParams()
  const [entry, setEntry] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [toKey, setToKey] = useState('C')
  const [showChords, setShowChords] = useState(true)
  const [showMedia, setShowMedia] = useState(false)
  const [err, setErr] = useState('')

  // find index entry
  useEffect(()=>{
    const it = (indexData?.items || []).find(x => String(x.id) === String(id)) || null
    setEntry(it)
  }, [id])

  // load chordpro text & parse
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

  // prefetch neighbor songs (simple heuristic)
  useEffect(() => {
    if (!entry) return
    const items = indexData?.items || []
    const i = items.findIndex(x => x.id === entry.id)
    const neighbors = [items[i-1], items[i+1]].filter(Boolean)
    neighbors.forEach(n => {
      const url = `${(import.meta.env.BASE_URL || '/').replace(/\/+$/, '')}/songs/${n.filename}`
      fetchTextCached(url).catch(()=>{})
    })
  }, [entry?.id])

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

  // keyboard shortcuts: c = toggle chords, [ / ] transpose
  useEffect(() => {
    function onKey(e){
      const tag = (e.target && e.target.tagName) || ''
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return

      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        setShowChords(v => !v)
        return
      }
      if (e.key === '[') { // down
        e.preventDefault()
        setToKey(k => {
          const i = Math.max(0, KEYS.indexOf(k))
          return KEYS[(i - 1 + KEYS.length) % KEYS.length]
        })
      }
      if (e.key === ']') { // up
        e.preventDefault()
        setToKey(k => {
          const i = Math.max(0, KEYS.indexOf(k))
          return KEYS[(i + 1) % KEYS.length]
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const youTubeId = extractYouTubeId(parsed.meta.youtube)
  const mp3Src = resolveMedia(parsed.meta.mp3)
  const pptxHref = resolveMedia(parsed.meta.pptx)

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

      {(youTubeId || mp3Src || pptxHref) && (
        <div>
          <button
            className="btn media__toggle"
            onClick={()=>{ const n=!showMedia; setShowMedia(n); try{ localStorage.setItem(`mediaOpen:${entry.id}`, n?'1':'0') }catch{} }}
          >
            {showMedia ? <>Hide media</> : <><MediaIcon /> Show media</>}
          </button>
          <div className={`media__panel ${showMedia ? 'open' : ''}`}>
            {youTubeId && (
              <div className="media__card" style={{marginTop:10}}>
                <div className="media__label">Reference Video</div>
                <div className="media__frame">
                  <LiteYouTube id={youTubeId} />
                </div>
              </div>
            )}
            {mp3Src && (
              <div className="media__card" style={{marginTop:10}}>
                <div className="media__label">Audio</div>
                <audio controls src={mp3Src} />
              </div>
            )}
            {pptxHref && (
              <div className="media__card" style={{marginTop:10}}>
                <div className="media__label">Lyric Slides (PPTX)</div>
                <a className="btn" href={pptxHref} download>Download PPTX</a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
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
    <button className="media__card" onClick={() => setReady(true)} aria-label="Play video" style={{width:'100%'}}>
      <div className="media__frame">
        <img src={thumb} alt="" style={{position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover'}} />
        <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'48px'}}>▶</div>
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

    if(!canvasRef.current){
      const cv = document.createElement('canvas')
      cv.width = 1; cv.height = 1
      canvasRef.current = cv
    }
    const ctx = canvasRef.current.getContext('2d')

    // measure using the LYRICS font (critical alignment rule)
    const lyr = hostRef.current.querySelector('.lyrics')
    const cs = window.getComputedStyle(lyr)
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`

    const offsets = (showChords ? chords : []).map(c => ({
      left: ctx.measureText(plain.slice(0, c.index)).width,
      sym: transposeSym(c.sym, steps)
    }))

    // compute ascent for padding using chord mono/bold
    const chordFontFamily = `'Noto Sans Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    const chordFontSize = cs.fontSize
    ctx.font = `${cs.fontStyle} 700 ${chordFontSize} ${chordFontFamily}`
    const chordM = ctx.measureText('Mg')
    const chordAscent = chordM.actualBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8

    const gap = 4
    setState({ offsets, padTop: Math.ceil(chordAscent + gap), chordTop: 0 })
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
