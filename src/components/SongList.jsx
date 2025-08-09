import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

export default function SongList({ indexData }){
  const [list, setList] = useState([])
  useEffect(()=>{
    const items = (indexData?.items||[]).map(it=> ({ id: it.id, title: it.title, key: it.originalKey, tags: it.tags, number: it.number }))
    setList(items)
  },[indexData])
  return (
    <div className="container">
      <h1>GraceChords</h1>
      <div style={{display:'flex', gap:8, marginBottom:10}}>
        <Link to="/admin" className="btn">Open Admin</Link>
      </div>
      <div className="list">
        {list.map(s => (
          <div key={s.id} className="song-row" style={{display:'flex', alignItems:'center', gap:8}}>
            <Link to={`/song/${s.id}`} className="song-item" style={{flex:1}}>
              <div className="song-title">{s.title}</div>
              <div className="song-meta" style={{color:'#6b7280', fontSize:12}}>{s.key || ''}{s.tags?.length ? ` • ${s.tags.join(', ')}` : ''}</div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
