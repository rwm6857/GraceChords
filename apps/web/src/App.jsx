import React from 'react'
import { Routes, Route, Link, Outlet } from 'react-router-dom'
import lazyRoute from './utils/app/lazyRoute'
import HomeDashboard from './pages/HomeDashboardPage'
import Songs from './pages/SongsPage'
import SongView from './pages/SongViewPage'
const Setlist = lazyRoute(() => import('./pages/SetlistPage'))
const ReadingsPage = lazyRoute(() => import('./pages/ReadingsPage'))
import Bundle from './pages/BundlePage'
const Songbook = lazyRoute(() => import('./pages/SongbookPage'))
const About = lazyRoute(() => import('./pages/AboutPage'))
const PrivacyPage = lazyRoute(() => import('./pages/PrivacyPage'))
const TermsPage = lazyRoute(() => import('./pages/TermsPage'))
const LicensesPage = lazyRoute(() => import('./pages/LicensesPage'))
const DeleteAccountPage = lazyRoute(() => import('./pages/DeleteAccountPage'))
const LoginPage = lazyRoute(() => import('./pages/LoginPage'))
const SignupPage = lazyRoute(() => import('./pages/SignupPage'))
const ProfilePage = lazyRoute(() => import('./pages/ProfilePage'))
const AuthCallbackPage = lazyRoute(() => import('./pages/AuthCallbackPage'))
const ResetPasswordPage = lazyRoute(() => import('./pages/ResetPasswordPage'))
const ForgotPasswordPage = lazyRoute(() => import('./pages/ForgotPasswordPage'))
const AdminPage = lazyRoute(() => import('./pages/AdminPage'))
const EditorPage = lazyRoute(() => import('./pages/EditorPage'))
const PortalEditorPage = lazyRoute(() => import('./pages/portal/EditorPage'))
const AuditLogPage = lazyRoute(() => import('./components/editor/AuditLogPanel'))
const DownloadPage = lazyRoute(() => import('./pages/DownloadPage'))
const PostsPage = lazyRoute(() => import('./pages/PostsPage'))
const PostDetailPage = lazyRoute(() => import('./pages/PostDetailPage'))
const SessionViewer = lazyRoute(() => import('./pages/SessionViewerPage'))
const ManagePostsPage = lazyRoute(() => import('./pages/portal/ManagePostsPage'))
const EditPostPage = lazyRoute(() => import('./pages/portal/EditPostPage'))
import NavBar from './components/ui/Navbar'
import RoleGuard from './components/auth/RoleGuard'
import WorshipMode from './pages/WorshipModePage'
import ErrorBoundary from './components/ErrorBoundary'
import WorshipSetRoute from './pages/WorshipSetRoutePage'
import Toast from './components/Toast'
import AnnouncementStrip from './components/AnnouncementStrip'
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
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/licenses" element={<LicensesPage />} />
            <Route path="/delete-account" element={<DeleteAccountPage />} />
            <Route path="/download" element={<DownloadPage />} />
            <Route path="/song/:id" element={<SongView />} />
            <Route path="/songs/:id" element={<SongView />} />
            <Route path="/setlist" element={<Setlist />} />
            <Route path="/setlist/:songIds" element={<Setlist />} />
            <Route path="/set/:code" element={<Setlist />} />
            <Route path="/reading" element={<ReadingsPage />} />
            <Route path="/bundle" element={<Bundle />} />
            <Route path="/songbook" element={<Songbook />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/admin" element={<RoleGuard minRole="admin"><AdminPage /></RoleGuard>} />
            <Route path="/editor" element={<RoleGuard minRole="editor"><EditorPage /></RoleGuard>} />
            <Route path="/portal/editor" element={<RoleGuard minRole="user"><PortalEditorPage /></RoleGuard>} />
            <Route path="/portal/editor/:slug" element={<RoleGuard minRole="user"><PortalEditorPage /></RoleGuard>} />
            <Route path="/portal/audit" element={<RoleGuard minRole="admin"><AuditLogPage /></RoleGuard>} />
            <Route path="/portal/posts" element={<RoleGuard minRole="editor"><ManagePostsPage /></RoleGuard>} />
            <Route path="/portal/posts/new" element={<RoleGuard minRole="editor"><EditPostPage /></RoleGuard>} />
            <Route path="/portal/posts/:id/edit" element={<RoleGuard minRole="editor"><EditPostPage /></RoleGuard>} />
            <Route path="/posts" element={<PostsPage />} />
            <Route path="/posts/:slug" element={<PostDetailPage />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/worship/:songIds?" element={<WorshipMode />} />
          <Route path="/worship/set/:code" element={<WorshipSetRoute />} />
          <Route path="/s/:code" element={<SessionViewer />} />
          <Route path="*" element={<div className="container"><h1>Not found</h1><Link to="/">Back</Link></div>} />
        </Routes>
      </React.Suspense>
      <SiteDisclaimer />
      <Toast />
      <EditorFab />
    </ErrorBoundary>
  )
}

function Layout(){
  return (
    <div className="App">
      {/* Above the sticky navbar and not sticky itself, so it scrolls away and
          the nav keeps its top:0 anchor. */}
      <AnnouncementStrip />
      <NavBar />
      <main id="main" className="Route">
        <Outlet />
      </main>
    </div>
  )
}
