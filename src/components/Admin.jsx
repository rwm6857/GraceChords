import React, { useEffect, useState } from 'react'
import JSZip from 'jszip'

export default function Admin(){
  const [index, setIndex] = useState({ items: [] })
  const [selected, setSelected] = useState(null)
  const [text, setText] = useState('')

  useEffect(()=>{
    fetch(`${import.meta.env.BASE_URL}src/data/index.json`).then(r=>r.json()).then(setIndex).catch(()=> setIndex({items:[]}))
  }, [])

  useEffect(()=>{
    if(selected){
      fetch(`${import.meta.env.BASE_URL}songs/${selected}`).then(r=>r.text()).then(setText)
    } else {
      setText('')
    }
  }, [selected])

  function parseMeta(t){
    const m = {}; const re = /^\{\s*([^:}]+)\s*:\s*([^}]*)\s*\}\s*$/gm
    let x; while((x = re.exec(t))){ m[x[1].trim().toLowerCase()] = x[2].trim() }
    return m
  }

  const meta = parseMeta(text)
  const id = (meta.id || (meta.title||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')).replace(/(^-|-$)/g,'')
  const filename = `${id||'untitled'}.chordpro`

  async function downloadBundle(){
    const zip = new JSZip()
    const folder = zip.folder('songs')
    if(text.trim()) folder.file(filename, text)
    for(const it of index.items){
      const data = await fetch(`${import.meta.env.BASE_URL}songs/${it.filename}`).then(r=>r.text()).catch(()=>null)
      if(data) folder.file(it.filename, data)
    }
    const items = [...index.items.filter(it=> it.filename !== filename)]
    items.push({
      id,
      title: meta.title || 'Untitled',
      filename,
      originalKey: meta.key || meta.originalkey || '',
      tags: (meta.tags || '').split(',').map(s=>s.trim()).filter(Boolean),
      authors: meta.authors || '',
      country: meta.country || '',
      number: meta.number ? Number(meta.number) : undefined
    })
    items.sort((a,b)=> a.title.localeCompare(b.title, undefined, {sensitivity:'base'}))
    zip.file('src/data/index.json', JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2))
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'song_data_bundle.zip'; a.click()
  }

  return (
    <div className="container" style={{display:'grid', gridTemplateColumns:'280px 1fr', gap:16}}>
      <div>
        <h2>Admin</h2>
        <button className="btn" onClick={()=>{ setSelected(null); setText(`{title: }
{key: }
{authors: }
{country: }
{tags: }
{number: }

Verse 1
[]`)}}>+ New Song</button>
        <div style={{marginTop:8}}>
          {index.items.map(it=> (
            <div key={it.id} style={{margin:'6px 0'}}>
              <button className="btn" style={{width:'100%'}} onClick={()=> setSelected(it.filename)}>
                {it.title}
              </button>
            </div>
          ))}
        </div>
        <div style={{marginTop:12, fontSize:13, color:'#6b7280'}}>
          <strong>Publish steps:</strong>
          <ol>
            <li>Click <em>Download bundle</em> (below) and unzip.</li>
            <li>Copy <code>songs/*.chordpro</code> to <code>public/songs/</code> in your repo.</li>
            <li>Replace <code>src/data/index.json</code> with the bundled one.</li>
            <li>Commit, then <code>npm run deploy</code>.</li>
          </ol>
          Offline bulk: add many <code>.chordpro</code> to <code>public/songs/</code>, then run <code>npm run build-index</code> locally.
        </div>
      </div>
      <div>
        <textarea value={text} onChange={e=> setText(e.target.value)} placeholder="Write ChordPro here…" style={{width:'100%', minHeight:'60vh', fontFamily:'ui-monospace, Menlo, Consolas, monospace'}} />
        <div style={{display:'flex', gap:8, marginTop:8}}>
          <button className="btn primary" onClick={downloadBundle}>Download bundle (songs + index.json)</button>
        </div>
      </div>
    </div>
  )
}
