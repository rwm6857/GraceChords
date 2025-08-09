import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { makeFuseIndex, runSearch } from '../utils/search'
import { downloadMultiSongPdf } from '../utils/pdf'
import { useSettings } from '../utils/useSettings'

export default function SongList({ initialSongs }){
  const [query, setQuery] = useState('')
  const [list, setList] = useState([])

  const [transposeFor, setTransposeFor] = useState({}) // id -> target key

  function setSongKey(id, key){
    setTransposeFor(prev=> ({...prev, [id]: key}))
  }

  function computeSteps(fromKey, toKey){
    if(!fromKey || !toKey) return 0
    const SCALE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    const toSharp = k => k && k.replace('Db','C#').replace('Eb','D#').replace('Gb','F#').replace('Ab','G#').replace('Bb','A#')
    const a = SCALE.indexOf(toSharp(fromKey)); const b = SCALE.indexOf(toSharp(toKey))
    if(a === -1 || b === -1) return 0
    return (b - a + 12) % 12
  }

  const [selected, setSelected] = useState(new Set())
  const { settings } = useSettings()

  useEffect(()=>{
    const copy = [...initialSongs].sort((a,b)=> a.title.localeCompare(b.title))
    setList(copy)
  },[initialSongs])

  const fuse = useMemo(()=> makeFuseIndex(list), [list])
  const filtered = useMemo(()=> runSearch(fuse, query, list), [fuse, query, list])

  function toggle(id){
    setSelected(prev=>{
      const n = new Set(prev)
      if(n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  return (
    <div className="container">
      <div className="sidebar">
        <h2>Song Directory</h2>
        <input placeholder="Search title, lyrics, tags..." value={query} onChange={e=>setQuery(e.target.value)} className="search" />
        <div className="list">
          {filtered.map(s=>(
            <div key={s.id} className="song-row">
              <input type="checkbox" checked={selected.has(s.id)} onChange={()=>toggle(s.id)} />
              <Link to={`/song/${s.id}`} className="song-item flex1">
                <div className="song-title">{s.title}</div>
                <div className="song-meta">{s.key ? s.key : ''} {s.tags ? ' • ' + s.tags.join(', ') : ''}</div>
              </Link>\n              <select onChange={e=> setSongKey(s.id, e.target.value)} defaultValue={s.key || 'G'}>\n                {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map(k=> <option key={k} value={k}>{k}</option>)}\n              </select>
            </div>
          ))}
        </div>
        <div className="actions">
          <button onClick={()=>{
            const ids = Array.from(selected);
            if(ids.length===0){ alert('Select one or more songs first.'); return; }
            // build songs data currently in original keys
            const chosenOrig = list.filter(s=> ids.includes(s.id));
            // apply per-song transpose override
            const chosen = chosenOrig.map(s=>{
              const target = transposeFor[s.id] || s.key
              const steps = computeSteps(s.key, target)
              const lyricsBlocks = s.lyricsBlocks.map(b=>({...b, lines: b.lines.map(l=>({
                text: l.text, chords: l.chords ? l.chords.replace(/([A-G][#b]?(?:maj|min|m|sus|add|dim|aug)?[0-9]*(?:\([^)]+\))?(?:\/[A-G][#b]?)?)/g, (m)=>{
                  // simple transpose inline
                  const FLAT = {'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#'}
                  function norm(n){ return FLAT[n] || n }
                  function transTok(tok){
                    if(tok.includes('/')){
                      const [a,b] = tok.split('/')
                      return transTok(a) + '/' + transTok(b)
                    }
                    const mm = tok.match(/^([A-G][#b]?)(.*)$/)
                    if(!mm) return tok
                    const root = norm(mm[1]); const suffix = mm[2] || ''
                    const SCALE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
                    const idx = SCALE.indexOf(root); if(idx === -1) return tok
                    const out = SCALE[(idx + steps + 12) % 12]
                    return out + suffix
                  }
                  return transTok(m)
                }) : '' }))}))
              return { ...s, key: target, lyricsBlocks }
            })
            downloadMultiSongPdf(chosen, { lyricSizePt: 16, chordSizePt: 16, columns: 'auto' });
          }}>Download Selected PDF</button>
        </div>
      </div>
      <div className="explainer">
        <h3>Instructions</h3>
        <p>Click a song to view its chords & lyrics. Change the key on the song page to transpose.</p>
        <p>Use the checkboxes to prepare a multi-song PDF (coming soon as vector text).</p>
        <div className="note">PDF exports use current settings: {settings.lyricFontSizePt}pt lyrics, bold chords, {String(settings.columns)} columns.</div>
      </div>
    </div>
  )
}
