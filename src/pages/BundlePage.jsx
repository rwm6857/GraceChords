import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import indexData from '../data/index.json'
import { stepsBetween, transposeSymPrefer, KEYS } from '../utils/chordpro'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { transposeInstrumental } from '../utils/songs/instrumental'
import { normalizeSongInput } from '../utils/pdf/pdfLayout'
import { showToast } from '../utils/app/toast'
import { publicUrl } from '../utils/network/publicUrl'

export default function Bundle(){
  const navigate = useNavigate()
  const [selection, setSelection] = useState({})
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(()=>{
    try{ const raw = localStorage.getItem('bundleSelection'); setSelection(raw? JSON.parse(raw):{}) }catch{}
  },[])

  useEffect(()=>{
    const ids = Object.keys(selection)
    setEntries((indexData?.items||[]).filter(it=> ids.includes(it.id)))
  },[selection])

  let pdfLibPromise
  const loadPdfLib = () => pdfLibPromise || (pdfLibPromise = import('../utils/pdf'))

  async function handleDownload(){
    setLoading(true)
    setProgress(0)
    try{
      const promises = entries.map(it =>
        (async () => {
          const toKey = selection[it.id]?.toKey || it.originalKey || 'C'
          const res = await fetch(publicUrl(`songs/${it.filename}`))
          if(!res.ok) throw new Error(`Missing file ${it.filename}`)
          const text = await res.text()
          const doc = parseChordProOrLegacy(text)
          const baseKey = doc.meta?.key || doc.meta?.originalkey || it.originalKey || 'C'
          const steps = stepsBetween(baseKey, toKey)
          const baseRootRaw = (String(baseKey).match(/^([A-G][#b]?)/) || [,''])[1]
          const preferFlat = !!(baseRootRaw && /b$/.test(baseRootRaw))
          const blocks = (doc.sections || []).map(sec => ({
            section: sec.label,
            lines: (sec.lines || []).map(ln => {
              if (ln.instrumental) {
                return { instrumental: transposeInstrumental(ln.instrumental, steps, preferFlat) }
              }
              if (ln.comment) {
                return { plain: ln.comment, chordPositions: [], comment: ln.comment }
              }
              return {
                plain: ln.lyrics || '',
                chordPositions: (ln.chords || []).map(c => ({ sym: transposeSymPrefer(c.sym, steps, preferFlat), index: c.index }))
              }
            })
          }))
          return normalizeSongInput({
            title: doc.meta?.title || it.title,
            key: toKey,
            capo: doc.meta?.capo,
            lyricsBlocks: blocks,
          })
        })()
          .catch(err => {
            console.error(err)
            showToast(`Failed to process ${it.filename}`)
            throw err
          })
          .finally(() => setProgress(p => p + 1))
      )

      const results = await Promise.allSettled(promises)
      const songs = results.filter(r => r.status === 'fulfilled').map(r => r.value)
      if(songs.length){
        const { downloadMultiSongPdf } = await loadPdfLib()
        await downloadMultiSongPdf(songs, { lyricSizePt: 16, chordSizePt: 16 })
      }
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }

  if(entries.length===0){
    return <div className="container"><h1>Bundle</h1><p>No songs selected.</p></div>
  }

  return (
    <div className="container">
      <div className="songpage__top">
        {/* Back link removed; use navbar Home */}
        <h1 style={{margin:0}}>Build PDF Bundle</h1>
      </div>
      <div className="gc-card" style={{display:'grid', gap:10}}>
        {entries.map(it=>{
          const toKey = selection[it.id]?.toKey || it.originalKey || 'C'
          return (
            <div key={it.id} className="row">
              <div style={{flex:1}}>
                <div style={{fontWeight:600}}>{it.title}</div>
                <div className="meta">Original: {it.originalKey || '—'}{it.tags?.length ? ` • ${it.tags.join(', ')}` : ''}</div>
              </div>
              <label>Key:{' '}
                <select value={toKey} onChange={(e)=> setSelection(prev=> ({...prev, [it.id]: { toKey: e.target.value }}))}>
                  {KEYS.map(k=> <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
            </div>
          )
        })}
      </div>
      <div style={{display:'flex', gap:8, marginTop:10}}>
        <button className="gc-btn" onClick={()=>{ localStorage.removeItem('bundleSelection'); navigate('/') }}>Clear</button>
        <button className="btn primary" disabled={loading} onClick={handleDownload}>{loading? `Preparing ${progress}/${entries.length}…`:'Download PDF ('+entries.length+')'}</button>
      </div>
    </div>
  )
}
