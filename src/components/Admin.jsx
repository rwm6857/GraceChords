import React, { useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import { KEYS, parseChordPro, makeMonospaceChordLine } from '../utils/chordpro'

const PASSWORD = '10401040'

export default function Admin(){
  // Only the gate’s hooks live here (always same order)
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

  // After gate passes, render a separate component (its hooks start fresh and aren’t conditional)
  return <AdminPanel />
}

function AdminPanel(){
  const [text, setText] = useState(`{title: }\n{key: }\n{authors: }\n{country: }\n{tags: Fast, Slow, Hymn, Holiday}\n{youtube: }\n{mp3: }\n{pptx: }\n\nVerse 1\n[]`)
  const [meta, setMeta] = useState({})

  useEffect(()=>{ setMeta(parseMeta(text)) },[text])

  function parseMeta(t){
    const m = {}
    const re = /^\{\s*([^:}]+)\s*:\s*([^}]*)\s*\}\s*$/gm
    let x
    while((x = re.exec(t))){ m[x[1].trim().toLowerCase()] = x[2].trim() }
    return m
  }

  const id = (meta.id || (meta.title||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')).replace(/(^-|-$)/g,'')
  const filename = `${id||'untitled'}.chordpro`

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

  const parsed = useMemo(()=> parseChordPro(text||''), [text])

  return (
    <div className="container">
      <h2>Admin</h2>

      <div className="card" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
        <label>Title
          <input value={meta.title||''}
            onChange={e=> setText(t=> t.replace(/\{\s*title\s*:[^}]*\}/i, `{title: ${e.target.value}}`))}
          />
        </label>

        <label>Original Key
          <select value={meta.key||''}
            onChange={e=> setText(t=> t.replace(/\{\s*key\s*:[^}]*\}/i, `{key: ${e.target.value}}`))}
          >
            <option value=""></option>
            {KEYS.map(k=> <option key={k} value={k}>{k}</option>)}
          </select>
        </label>

        <label>Authors
          <input value={meta.authors||''}
            onChange={e=> setText(t=> t.replace(/\{\s*authors\s*:[^}]*\}/i, `{authors: ${e.target.value}}`))}
          />
        </label>

        <label>Country
          <input value={meta.country||''}
            onChange={e=> setText(t=> t.replace(/\{\s*country\s*:[^}]*\}/i, `{country: ${e.target.value}}`))}
          />
        </label>

        <label>Tags
          <input value={meta.tags||''}
            onChange={e=> setText(t=> t.replace(/\{\s*tags\s*:[^}]*\}/i, `{tags: ${e.target.value}}`))}
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
                {(b.lines||[]).map((ln,li)=>{
                  const mono = makeMonospaceChordLine(ln.text, ln.chords)
                  return (
                    <div key={bi+'-'+li} className="linepair">
                      <div className="chords mono">{mono}</div>
                      <div className="lyrics">{ln.text}</div>
                    </div>
                  )
                })}
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

// Insert or update a {key: value} meta line in the ChordPro text
function setOrInsertMeta(text, key, value){
  const re = new RegExp(`\\{\\s*${key}\\s*:[^}]*\\}`, 'i')
  if(re.test(text)) return text.replace(re, `{${key}: ${value}}`)
  // Insert after title or at top
  if(/\{\s*title\s*:[^}]*\}/i.test(text)){
    return text.replace(/\{\s*title\s*:[^}]*\}\s*/, m => m + `\n{${key}: ${value}}\n`)
  }
  return `{${key}: ${value}}\n` + text
}
