import React from 'react'
import { Routes, Route, Link, Outlet } from 'react-router-dom'
import Home from './components/Home'
import SongView from './components/SongView'
import Admin from './components/Admin'
import Setlist from './components/Setlist'
import Bundle from './components/Bundle'
import Songbook from './components/Songbook'
import NavBar from './components/NavBar'
import ErrorBoundary from './components/ErrorBoundary'
import Toast from './components/Toast'
import './styles.css'

export default function App(){
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/song/:id" element={<SongView />} />
          <Route path="/setlist" element={<Setlist />} />
          <Route path="/bundle" element={<Bundle />} />
          <Route path="/songbook" element={<Songbook />} />
        </Route>
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<div className="container"><h3>Not found</h3><Link to="/">Back</Link></div>} />
      </Routes>
      <Toast />
    </ErrorBoundary>
  )
}

function Layout(){
  return (
    <div className="App">
      <NavBar />
      <main id="main" className="Route">
        <Outlet />
      </main>
    </div>
  )
}
