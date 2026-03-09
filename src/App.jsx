import React from 'react'
import { Routes, Route, Link, Outlet } from 'react-router-dom'
import HomeDashboard from './pages/HomeDashboardPage'
import Songs from './pages/SongsPage'
import SongView from './pages/SongViewPage'
const Setlist = React.lazy(() => import('./pages/SetlistPage'))
const ReadingsPage = React.lazy(() => import('./pages/ReadingsPage'))
import Bundle from './pages/BundlePage'
const Songbook = React.lazy(() => import('./pages/SongbookPage'))
const About = React.lazy(() => import('./pages/AboutPage'))
const Resources = React.lazy(() => import('./pages/ResourcesPage'))
const ResourcePost = React.lazy(() => import('./pages/ResourcePostPage'))
const LoginPage = React.lazy(() => import('./pages/LoginPage'))
const SignupPage = React.lazy(() => import('./pages/SignupPage'))
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'))
const AuthCallbackPage = React.lazy(() => import('./pages/AuthCallbackPage'))
const ResetPasswordPage = React.lazy(() => import('./pages/ResetPasswordPage'))
const AdminPage = React.lazy(() => import('./pages/AdminPage'))
const EditorPage = React.lazy(() => import('./pages/EditorPage'))
import NavBar from './components/ui/Navbar'
import RoleGuard from './components/auth/RoleGuard'
import WorshipMode from './pages/WorshipModePage'
import ErrorBoundary from './components/ErrorBoundary'
import WorshipSetRoute from './pages/WorshipSetRoutePage'
import Toast from './components/Toast'
import SiteDisclaimer from './components/SiteDisclaimer'

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
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/admin" element={<RoleGuard minRole="admin"><AdminPage /></RoleGuard>} />
            <Route path="/editor" element={<RoleGuard minRole="editor"><EditorPage /></RoleGuard>} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/worship/:songIds?" element={<WorshipMode />} />
          <Route path="/worship/set/:code" element={<WorshipSetRoute />} />
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
