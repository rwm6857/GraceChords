import React, { useMemo, useState } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import SongList from './components/SongList'
import SongView from './components/SongView'
import songs from './data/songs.json'
import { SettingsContext } from './utils/settings'

export default function App(){
  const [settings, setSettings] = useState({
    lyricFontFamily: 'Arial',
    chordFontFamily: 'Courier New',
    lyricFontSizePt: 16,
    chordFontSizePt: 16,
    columns: 'auto' // 'auto' | 1 | 2
  })

  const value = useMemo(()=>({settings, setSettings}), [settings])

  return (
    <SettingsContext.Provider value={value}>
      <div className="app">
        <header className="topbar">
          <Link to="/" className="brand">Youth Songbook</Link>
          <div className="toolbar">
            <label>Lyrics size:
              <select value={settings.lyricFontSizePt}
                      onChange={e=>setSettings(s=>({...s, lyricFontSizePt: Number(e.target.value)}))}>
                {[14,16,18,20].map(n=> <option key={n} value={n}>{n} pt</option>)}
              </select>
            </label>
            <label>Columns:
              <select value={settings.columns}
                      onChange={e=>setSettings(s=>({...s, columns: e.target.value}))}>
                <option value="auto">Auto</option>
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </label>
          </div>
        </header>
        <main className="main">
          <Routes>
            <Route path="/" element={<SongList initialSongs={songs} />} />
            <Route path="/song/:id" element={<SongView initialSongs={songs} />} />
          </Routes>
        </main>
        <footer className="footer">Edit songs in <code>src/data/songs.json</code>. Vector PDF export uses current transpose & font sizes.</footer>
      </div>
    </SettingsContext.Provider>
  )
}
