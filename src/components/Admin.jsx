import React, { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { KEYS, parseChordPro } from '../utils/chordpro'

const PASSWORD = '10401040'

export default function Admin(){
  const [ok, setOk] = useState(false)
  const [pw, setPw] = useState('')

  if(!ok){
    return (
      <div className="container" style={{maxWidth:480}}>
        <h2>Admin</h2>
        <p>Enter password to continue.</p>
        <input
          type="password"
          value={pw}
          onChange={e=> setPw(e.target.value)}
          placeholder="Password"
        />
        <button className="btn primary" style={{marginLeft:8}} onClick={()=> setOk(pw===PASSWORD)}>
          Enter
        </button>
      </div>
    )
  }
  return <AdminPanel />
}

function AdminPanel(){
  const [text, setText] = useState(`{title: }\n{key: }\n{authors: }\n{country: }\n{tags: Fast, Slow, Hymn, Holiday}\n{youtube: }\n{mp3: }\n{pptx: }\n\nVerse 1\n[]`)
  const [meta, setMeta] = useState({})
  useEffect(()=>{ setMeta(parseMeta(text)) },[text])

  const id = (meta.id || (meta.title||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')).replace(/(^-|-$)/g,'')
  const filename = `${id||'untitled'}.chordpro`
  const parsed = useMemo(()=> parseChordPro(text||''), [text])

  async function downloadBundle(){
    const zip = new JSZip()
    const folder = zip.folder('songs')
    folder.file(filename, text)
    const items = [{
      id,
      title: meta.title || 'Untitled',
      filename,
      originalKey: meta.key || '',
      tags: (meta.tags||'').split(',').map(s=>s.trim()).filter(Boolean),
      authors: meta.authors||'',
      country: meta.country||''
    }]
    zip.file('src/data/index.json', JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2))
    const blob = await zip.generateAsync({ type:'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'song_data_bundle.zip'
    a.click()
  }

  return (
    <div className="container">
      <h2>Admin</h2>

      <div className="card" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
        <label>Title
          <input value={meta.title||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'title', e.target.value))}
          />
        </label>

        <label>Original Key
          <select value={meta.key||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'key', e.target.value))}
          >
            <option value=""></option>
            {KEYS.map(k=> <option key={k} value={k}>{k}</option>)}
          </select>
        </label>

        <label>Authors
          <input value={meta.authors||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'authors', e.target.value))}
          />
        </label>

        <label>Country
          <input value={meta.country||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'country', e.target.value))}
          />
        </label>

        <label>Tags
          <input value={meta.tags||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'tags', e.target.value))}
            placeholder="Fast, Slow, Hymn, Holiday"
          />
        </label>

        <label>YouTube ID
          <input value={meta.youtube||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'youtube', e.target.value))}
          />
        </label>

        <label>MP3 URL or /media/&lt;id&gt;
          <input value={meta.mp3||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'mp3', e.target.value))}
          />
        </label>

        <label>PPTX URL or /media/&lt;id&gt;
          <input value={meta.pptx||''}
            onChange={e=> setText(t=> setOrInsertMeta(t, 'pptx', e.target.value))}
          />
        </label>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10}}>
        <textarea
          value={text}
          onChange={e=> setText(e.target.value)}
          style={{width:'100%', minHeight:'60vh', fontFamily:'ui-monospace, Menlo, Consolas, monospace'}}
        />
        <div className='card' style={{minHeight:'60vh', overflow:'auto'}}>
          <strong>Preview</strong>
          <div style={{marginTop:8}}>
            {(parsed.blocks||[]).map((b,bi)=>(
              <div key={bi}>
                <div className="section">{b.section ? `[${b.section}]` : ''}</div>
                {(b.lines||[]).map((ln,li)=>(
                  <MeasuredPreviewLine
                    key={`${bi}-${li}`}
                    plain={ln.text}
                    chords={ln.chords || []}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{display:'flex', gap:8, marginTop:10}}>
        <button className="btn primary" onClick={downloadBundle}>Download bundle</button>
        <div className="card">
          <strong>Publish (docs/ Pages):</strong>
          <ol>
            <li>Unzip bundle.</li>
            <li>Copy <code>songs/*.chordpro</code> to <code>public/songs/</code>.</li>
            <li>Merge entries into <code>src/data/index.json</code> (or run <code>npm run build-index</code>).</li>
            <li><code>npm run build</code> → outputs to <code>docs/</code>.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

/** Preview line with pixel-measured chord overlay (matches Song View) */
function MeasuredPreviewLine({ plain, chords }){
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

    const lyr = hostRef.current.querySelector('.lyrics')
    const cs = window.getComputedStyle(lyr)

    // Measure with lyrics font
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const offsets = (chords || []).map(c => ({
      left: ctx.measureText(plain.slice(0, c.index)).width,
      sym: c.sym
    }))

    const lyrM = ctx.measureText('Mg')
    const lyrAscent = lyrM.actualBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8
    // Estimate chord ascent with chord font
    const chordFontFamily = `'Noto Sans Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    const chordFontSize = cs.fontSize
    ctx.font = `${cs.fontStyle} 700 ${chordFontSize} ${chordFontFamily}`
    const chordM = ctx.measureText('Mg')
    const chordAscent = chordM.actualBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8

    const gap = 4
    const padTop = Math.ceil(chordAscent + gap)     // space above lyrics
    const chordTop = -Math.ceil(chordAscent + gap)  // chord baseline = -gap above lyric baseline
    setState({ offsets, padTop, chordTop })

  }, [plain, chords])

  return (
    <div ref={hostRef} style={{position:'relative', marginBottom:10, paddingTop: state.padTop}}>
      {state.offsets.length>0 && (
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

// Insert or update a {key: value} meta line in the ChordPro text
function setOrInsertMeta(text, key, value){
  const re = new RegExp(`\\{\\s*${key}\\s*:[^}]*\\}`, 'i')
  if(re.test(text)) return text.replace(re, `{${key}: ${value}}`)
  if(/\{\s*title\s*:[^}]*\}/i.test(text)){
    return text.replace(/\{\s*title\s*:[^}]*\}\s*/, m => m + `\n{${key}: ${value}}\n`)
  }
  return `{${key}: ${value}}\n` + text
}

function parseMeta(t){
  const m = {}
  const re = /^\{\s*([^:}]+)\s*:\s*([^}]*)\s*\}\s*$/gm
  let x
  while((x = re.exec(t))){ m[x[1].trim().toLowerCase()] = x[2].trim() }
  return m
}
