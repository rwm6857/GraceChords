import React from 'react'
import { Routes, Route, Link, Outlet } from 'react-router-dom'
import HomeDashboard from './pages/HomeDashboardPage'
import Songs from './pages/SongsPage'
import SongView from './pages/SongViewPage'
import Admin from './pages/AdminPage'
const Editor = React.lazy(() => import('./pages/EditorPage'))
const Setlist = React.lazy(() => import('./pages/SetlistPage'))
const ReadingsPage = React.lazy(() => import('./pages/ReadingsPage'))
import Bundle from './pages/BundlePage'
const Songbook = React.lazy(() => import('./pages/SongbookPage'))
const About = React.lazy(() => import('./pages/AboutPage'))
const Resources = React.lazy(() => import('./pages/ResourcesPage'))
const ResourcePost = React.lazy(() => import('./pages/ResourcePostPage'))
const AdminResources = React.lazy(() => import('./pages/AdminResourcesPage'))
import NavBar from './components/ui/Navbar'
import WorshipMode from './pages/WorshipModePage'
import ErrorBoundary from './components/ErrorBoundary'
import WorshipSetRoute from './pages/WorshipSetRoutePage'
import Toast from './components/Toast'
import SiteDisclaimer from './components/SiteDisclaimer'
import EditorFab from './components/EditorFab'

export default function App(){
  return (
    <ErrorBoundary>
      <React.Suspense fallback={<div className="container"><h3>Loading...</h3></div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomeDashboard />} />
            <Route path="/songs" element={<Songs />} />
            <Route path="/about" element={<About />} />
            <Route path="/song/:id" element={<SongView />} />
            <Route path="/songs/:id" element={<SongView />} />
            <Route path="/setlist" element={<Setlist />} />
            <Route path="/setlist/:songIds" element={<Setlist />} />
            <Route path="/set/:code" element={<Setlist />} />
            <Route path="/reading" element={<ReadingsPage />} />
            <Route path="/bundle" element={<Bundle />} />
            <Route path="/songbook" element={<Songbook />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/resources/:slug" element={<ResourcePost />} />
          </Route>
          <Route path="/worship/:songIds?" element={<WorshipMode />} />
          <Route path="/worship/set/:code" element={<WorshipSetRoute />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/resources" element={<AdminResources />} />
          <Route path="/editor" element={<Editor />} />
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
      <EditorFab />
    </div>
  )
}
