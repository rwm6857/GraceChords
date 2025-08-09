import React from 'react'
import { Routes, Route } from 'react-router-dom'
import SongList from './components/SongList'
import SongView from './components/SongView'
import Admin from './components/Admin'
import indexData from './data/index.json'
import './styles.css'

export default function App(){
  return (
    <Routes>
      <Route path="/" element={<SongList indexData={indexData} />} />
      <Route path="/song/:id" element={<SongView indexData={indexData} />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  )
}
