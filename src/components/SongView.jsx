import React, { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { downloadSingleSongPdf } from '../utils/pdf'
import { parseChordPro, makeMonospaceChordLine } from '../utils/chordpro'

export default function SongView({ indexData }){
  const { id } = useParams()
  const [entry, setEntry] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [toKey, setToKey] = useState(null)
  const [showMedia, setShowMedia] = useState(false)

  useEffect(()=>{
    const e = (indexData?.items||[]).find(x=> String(x.id) === String(id))
    setEntry(e || null)
  },[id, indexData])

  useEffect(()=>{
    if(!entry) return
    fetch(`${import.meta.env.BASE_URL}songs/${entry.filename}`).then(r=>r.text()).then(txt=>{
      const p = parseChordPro(txt)
      setParsed(p)
      setToKey(p.meta.key || p.meta.originalkey || 'C')
      try{ const saved = localStorage.getItem(`mediaOpen:${entry.id}`); setShowMedia(saved === '1') }catch{}
    })
  },[entry])

  if(!entry || !parsed) return <div className="container"><p>Loading… <Link to='/'>Back</Link></p></div>

  const title = parsed.meta.title || entry.title
  const tags = (parsed.meta.tags||'').split(',').map(s=>s.trim()).filter(Boolean)
  const songKey = parsed.meta.key || parsed.meta.originalkey || 'C'

  function transposeSteps(fromKey, toKey){
    if(!fromKey || !toKey) return 0
    const SCALE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    const norm = k => k && k.replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#')
    const a = SCALE.indexOf(norm(fromKey)); const b = SCALE.indexOf(norm(toKey))
    if(a===-1||b===-1) return 0
    return (b - a + 12) % 12
  }
  const steps = useMemo(()=> transposeSteps(songKey, toKey), [songKey, toKey])

  function transposeSym(sym, steps){
    const FLAT = {'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#'}
    const SCALE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    function norm(n){ return FLAT[n] || n }
    if(sym.includes('/')){
      const [a,b] = sym.split('/'); return transposeSym(a,steps) + '/' + transposeSym(b,steps)
    }
    const m = sym.match(/^([A-G][#b]?)(.*)$/); if(!m) return sym
    const i = SCALE.indexOf(norm(m[1])); if(i===-1) return sym
    return SCALE[(i+steps+12)%12] + (m[2]||'')
  }

  async function handleDownload(){
    const blocks = parsed.blocks.map(b => ({
      section: b.section,
      lines: b.lines.map(ln => {
        const plain = ln.text
        const chords = (ln.chords||[]).map(c => ({ sym: transposeSym(c.sym, steps), index: c.index }))
        return { plain, chordPositions: chords }
      })
    }))
    await downloadSingleSongPdf({ title, key: toKey, tags, lyricsBlocks: blocks }, {
      lyricSizePt: 16,
      chordSizePt: 16,
      columns: 'auto',
      chordPlacement: 'positioned'
    })
  }

  const mediaCount = (parsed.meta.youtube ? 1 : 0) + (parsed.meta.mp3 ? 1 : 0)

  return (
    <div className="songpage container">
      <div className="songpage__top">
        <Link to="/" className="back">← Back</Link>
        <div className="songpage__titlewrap">
          <div className="song-number">{entry.number || ''}</div>
          <h1 className="songpage__title">{title}</h1>
          <div className="songpage__meta">
            Key: <strong>{songKey}</strong>
            {tags.length ? <> • {tags.join(', ')}</> : null}
          </div>
        </div>
      </div>

      <div className="songpage__toolbar">
        <div className="toolbar__left">
          <label className="toolbar__field">
            Transpose to:
            <select value={toKey} onChange={e=> setToKey(e.target.value)}>
              {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map(k=> <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
        </div>
        <div className="toolbar__right">
          <button type="button" className="btn primary" onClick={(e)=>{e.preventDefault(); e.stopPropagation(); handleDownload();}}>Download PDF</button>
        </div>
      </div>

      <div className="songpage__sheet">
        {parsed.blocks.map((block, bi)=> (
          <div key={bi} className="block">
            <div className="section">{block.section}</div>
            {block.lines.map((ln, li)=>{
              const key = `${bi}-${li}`
              const mono = makeMonospaceChordLine(ln.text, (ln.chords||[]).map(c=> ({ sym: transposeSym(c.sym, steps), index: c.index })))
              return (
                <div key={key} className="linepair">
                  <div className="chords mono">{mono}</div>
                  <div className="lyrics">{ln.text}</div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {(parsed.meta.youtube || parsed.meta.mp3) && (
        <div className="songpage__mediaContainer">
          <button
            type="button"
            className="btn toggle"
            onClick={()=>{ const next=!showMedia; setShowMedia(next); try{ localStorage.setItem(`mediaOpen:${entry.id}`, next?'1':'0') }catch{} }}
            aria-expanded={showMedia}
            aria-controls="mediaPanel"
          >
            <span className={`chev ${showMedia ? 'open' : ''}`} aria-hidden>▸</span>
            {showMedia ? 'Hide media' : 'Show media'}
            {mediaCount ? ` (${mediaCount})` : ''}
          </button>

          <div id="mediaPanel" className={`songpage__media ${showMedia ? 'open' : 'closed'}`} aria-hidden={!showMedia}>
            {parsed.meta.youtube && (
              <div className="media__card">
                <div className="media__label">Reference Video</div>
                <div className="media__frame">
                  <iframe title="YouTube" src={`https://www.youtube.com/embed/${parsed.meta.youtube}`} allowFullScreen />
                </div>
              </div>
            )}
            {parsed.meta.mp3 && (
              <div className="media__card">
                <div className="media__label">Audio</div>
                <audio controls src={parsed.meta.mp3} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
