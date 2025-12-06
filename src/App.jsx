import React from 'react'
import { Routes, Route, Link, Outlet } from 'react-router-dom'
import Home from './components/Home'
import Songs from './components/Songs'
import SongView from './components/SongView'
import Admin from './components/Admin'
const Setlist = React.lazy(() => import('./components/Setlist'))
import Bundle from './components/Bundle'
const Songbook = React.lazy(() => import('./components/Songbook'))
const About = React.lazy(() => import('./components/About'))
const Resources = React.lazy(() => import('./components/Resources'))
const ResourcePost = React.lazy(() => import('./components/ResourcePost'))
const AdminResources = React.lazy(() => import('./components/AdminResources'))
import NavBar from './components/ui/Navbar'
import WorshipMode from './pages/WorshipMode'
import ErrorBoundary from './components/ErrorBoundary'
import WorshipSetRoute from './pages/WorshipSetRoute'
import Toast from './components/Toast'
import SiteDisclaimer from './components/SiteDisclaimer'
import './styles.css'

export default function App(){
  return (
    <ErrorBoundary>
      <React.Suspense fallback={<div className="container"><h3>Loading...</h3></div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/songs" element={<Songs />} />
            <Route path="/about" element={<About />} />
            <Route path="/song/:id" element={<SongView />} />
            <Route path="/setlist" element={<Setlist />} />
            <Route path="/setlist/:songIds" element={<Setlist />} />
            <Route path="/set/:code" element={<Setlist />} />
            <Route path="/bundle" element={<Bundle />} />
            <Route path="/songbook" element={<Songbook />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/resources/:slug" element={<ResourcePost />} />
          </Route>
          <Route path="/worship/:songIds?" element={<WorshipMode />} />
          <Route path="/worship/set/:code" element={<WorshipSetRoute />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/resources" element={<AdminResources />} />
          <Route path="*" element={<div className="container"><h1>Not found</h1><Link to="/">Back</Link></div>} />
        </Routes>
      </React.Suspense>
      <SiteDisclaimer />
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
