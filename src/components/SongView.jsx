import React, { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { parseChordPro, makeMonospaceChordLine, stepsBetween, transposeSym, KEYS } from '../utils/chordpro'
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

  // find entry by id
  useEffect(()=>{
    const it = (indexData?.items || []).find(x => String(x.id) === String(id)) || null
    setEntry(it)
  }, [id])

  // load and parse chordpro, derive defaults
  useEffect(()=>{
    if(!entry) return
    setErr('')
    setParsed(null)

    // Normalize base for GitHub Pages + HashRouter
    const base = ((import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/')
    const url = `${base}songs/${entry.filename}`

    fetch(url)
      .then(r => {
        if(!r.ok) throw new Error(`Song file not found: ${entry.filename}`)
        return r.text()
      })
      .then(txt => {
        const p = parseChordPro(txt)
        setParsed(p)
        const baseKey = p?.meta?.key || p?.meta?.originalkey || entry.originalKey || 'C'
        setToKey(baseKey)
        try { setShowMedia(localStorage.getItem(`mediaOpen:${entry.id}`) === '1') } catch {}
      })
      .catch(e => {
        console.error(e)
        setErr(e?.message || 'Failed to load song')
      })
  }, [entry])

  // early states
  if(!entry){
    return (
      <div className="container">
        <p>Song not found. <Link to="/">Back</Link></p>
      </div>
    )
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
    return (
      <div className="container">
        <p>Loading… <Link to="/">Back</Link></p>
      </div>
    )
  }

  // safe accessors
  const title = parsed?.meta?.title || entry.title
  const baseKey = parsed?.meta?.key || parsed?.meta?.originalkey || entry.originalKey || 'C'
  const steps = useMemo(()=> stepsBetween(baseKey, toKey), [baseKey, toKey])
  const media = {
    youtube: parsed?.meta?.youtube || '',
    mp3: parsed?.meta?.mp3 || '',
    pptx: parsed?.meta?.pptx || ''
  }
  const safeBlocks = Array.isArray(parsed?.blocks) ? parsed.blocks : []

  function transposePositions(arr){
    return (arr || []).map(c => ({ sym: transposeSym(c.sym, steps), index: c.index }))
  }

  async function handleDownload(){
    const blocks = safeBlocks.map(b => ({
      section: b.section,
      lines: (b.lines || []).map(ln => ({
        plain: ln.text,
        chordPositions: transposePositions(ln.chords)
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
          <div className="songpage__meta">
            Key: <strong>{baseKey}</strong>
            {entry.tags?.length ? ` • ${entry.tags.join(', ')}` : ''}
          </div>
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
          <button
            className="btn primary iconbtn"
            onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); handleDownload() }}
          >
            <DownloadIcon /> Download PDF
          </button>
        </div>
      </div>

      <div className="songpage__sheet">
        {safeBlocks.map((block, bi)=> (
          <div key={bi}>
            <div className="section">{block.section ? `[${block.section}]` : ''}</div>
            {(block.lines || []).map((ln, li)=>{
              const positions = transposePositions(ln.chords)
              const mono = makeMonospaceChordLine(ln.text, positions)
              return (
                <div key={`${bi}-${li}`} className="linepair">
                  {showChords && <div className="chords mono">{mono}</div>}
                  <div className="lyrics">{ln.text}</div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="divider" />

      {(media.youtube || media.mp3 || media.pptx) && (
        <div>
          <button
            className="btn media__toggle"
            onClick={()=>{ const n=!showMedia; setShowMedia(n); try{ localStorage.setItem(`mediaOpen:${entry.id}`, n?'1':'0') }catch{} }}
          >
            {showMedia ? <>Hide media</> : <><MediaIcon /> Show media</>}
          </button>
          <div className={`media__panel ${showMedia ? 'open' : ''}`}>
            {media.youtube && (
              <div className="media__card" style={{marginTop:10}}>
                <div className="media__label">Reference Video</div>
                <div className="media__frame">
                  <iframe title="YouTube" src={`https://www.youtube.com/embed/${media.youtube}`} allowFullScreen />
                </div>
              </div>
            )}
            {media.mp3 && (
              <div className="media__card" style={{marginTop:10}}>
                <div className="media__label">Audio</div>
                <audio controls src={media.mp3} />
              </div>
            )}
            {media.pptx && (
              <div className="media__card" style={{marginTop:10}}>
                <div className="media__label">Lyric Slides (PPTX)</div>
                <a className="btn" href={media.pptx} download>Download PPTX</a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
