import React from 'react'
import { Routes, Route, Link, Outlet } from 'react-router-dom'
import Home from './components/Home'
import SongView from './components/SongView'
import Admin from './components/Admin'
import Setlist from './components/Setlist'
import Bundle from './components/Bundle'
import NavBar from './components/NavBar'
import './styles.css'

export default function App(){
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/song/:id" element={<SongView />} />
        <Route path="/setlist" element={<Setlist />} />
        <Route path="/bundle" element={<Bundle />} />
      </Route>
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<div className="container"><h3>Not found</h3><Link to="/">Back</Link></div>} />
    </Routes>
  )
}

function Layout(){
  return (
    <>
      <NavBar />
      <main id="main">
        <Outlet />
      </main>
    </>
  )
}
