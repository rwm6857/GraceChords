import React, { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { transposeChordLine } from '../utils/transpose'
import { useSettings } from '../utils/useSettings'
import { songToPdfDoc, downloadSingleSongPdf } from '../utils/pdf'

export default function SongView({ initialSongs }){
  const { id } = useParams()
  const [song, setSong] = useState(null)
  const [toKey, setToKey] = useState(null)
  const { settings } = useSettings()

  useEffect(()=>{
    const s = initialSongs.find(x=> String(x.id) === String(id))
    if(s){
      setSong(s)
      setToKey(s.key || null)
    }
  },[id, initialSongs])

  const steps = useMemo(()=> computeSteps(song?.key, toKey), [song, toKey])

  if(!song) return <div className="container"><p>Song not found. <Link to='/'>Back</Link></p></div>

  async function handleDownload() {
  try {
    const songInKey = {
      ...song,
      key: toKey,
      lyricsBlocks: song.lyricsBlocks.map(b => ({
        ...b,
        lines: b.lines.map(l => ({
          text: l.text,
          chords: transposeChordLine(l.chords || '', steps),
        })),
      })),
    };

    await downloadSingleSongPdf(songInKey, {
      // optional family names if you added TTFs and fonts.js registers them:
      // lyricFont: 'NotoSans',
      // chordFont: 'NotoSansMono-Bold',
      lyricSizePt: settings.lyricFontSizePt,
      chordSizePt: settings.chordFontSizePt,
      columns: settings.columns,
    });
  } catch (e) {
    alert('PDF export failed. See console for details.');
    console.error(e);
  }
}

  return (
    <div className="container songview">
      <Link to="/" className="back">← Back</Link>
      <div className="header">
        <div>
          <div className="song-number">{song.number ? song.number : ''}</div>
          <h2 className="song-title-main">{song.title}</h2>
          <div className="subtitle">Key: {song.key || '—'} • Tags: {song.tags ? song.tags.join(', ') : ''}</div>
        </div>
        <div className="controls">
          <label>
            Transpose to:
            <select value={toKey} onChange={e=>setToKey(e.target.value)}>
              {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map(k=>(
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleDownload}>Download PDF</button>
        </div>
      </div>

      <div className="media">
        {song.youtube && (
          <iframe title="YouTube" src={`https://www.youtube.com/embed/${song.youtube}`} frameBorder="0" allowFullScreen></iframe>
        )}
        {song.mp3 && (
          <audio controls src={song.mp3}></audio>
        )}
      </div>

      <div className="chordsheet" style={{columnCount: settings.columns === 'auto' ? undefined : Number(settings.columns)}}>
        {song.lyricsBlocks.map((block, bi)=>(
          <div key={bi} className="block">
            <div className="section">{block.section}</div>
            {block.lines.map((ln, li)=>{
              const key = `${bi}-${li}`
              const chordsOrig = ln.chords || ''
              const displayChords = transposeChordLine(chordsOrig, steps)
              return (
                <div key={key} className="linepair">
                  <div className="chords mono" style={{fontSize: settings.chordFontSizePt}}>{displayChords}</div>
                  <div className="lyrics" style={{fontSize: settings.lyricFontSizePt}}>{ln.text}</div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

    </div>
  )
}

function computeSteps(fromKey, toKey){
  if(!fromKey || !toKey) return 0
  const SCALE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
  const norm = k => k && k.replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#')
  const a = SCALE.indexOf(norm(fromKey))
  const b = SCALE.indexOf(norm(toKey))
  if(a === -1 || b === -1) return 0
  return (b - a + 12) % 12
}
