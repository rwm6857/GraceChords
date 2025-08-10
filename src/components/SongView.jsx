import React, { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { parseChordPro, stepsBetween, transposeSym, KEYS } from '../utils/chordpro'
import { downloadSingleSongPdf } from '../utils/pdf'
import indexData from '../data/index.json'
import { DownloadIcon, TransposeIcon, MediaIcon, EyeIcon } from './Icons'

export default function SongView(){
  const { id } = useParams()
  const [entry, setEntry] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [toKey, setToKey] = useState('C')
  const [showChords, setShowChords] = useState(true)
  const [showMedia, setShowMedia] = useState(false)
  const [err, setErr] = useState('')

  useEffect(()=>{
    const it = (indexData?.items || []).find(x => String(x.id) === String(id)) || null
    setEntry(it)
  }, [id])

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
            {parsed.meta.youtube && (
              <div className="media__card" style={{marginTop:10}}>
                <div className="media__label">Reference Video</div>
                <div className="media__frame">
                  <iframe title="YouTube" src={`https://www.youtube.com/embed/${parsed.meta.youtube}`} allowFullScreen />
                </div>
              </div>
            )}
            {parsed.meta.mp3 && (
              <div className="media__card" style={{marginTop:10}}>
                <div className="media__label">Audio</div>
                <audio controls src={parsed.meta.mp3} />
              </div>
            )}
            {parsed.meta.pptx && (
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

    // Get font metrics to place chords above baseline
    // actualBoundingBoxAscent/Descent are supported in modern browsers; provide fallback.
    const lyrM = ctx.measureText('Mg')
    const lyrAscent = lyrM.actualBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8

    // Switch to chord font to estimate its ascent (for padding)
    const chordFontFamily = `'Noto Sans Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    const chordFontSize = cs.fontSize // keep same size as lyrics for consistent spacing
    ctx.font = `${cs.fontStyle} 700 ${chordFontSize} ${chordFontFamily}`
    const chordM = ctx.measureText('Mg')
    const chordAscent = chordM.actualBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8

    const gap = 4
    const padTop = Math.ceil(chordAscent + gap)     // space above lyrics
    const chordTop = -Math.ceil(chordAscent + gap)  // chord baseline = -gap above lyric baseline
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
