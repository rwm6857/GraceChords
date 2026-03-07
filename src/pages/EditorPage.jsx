import React from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function EditorPage() {
  const { profile, role } = useAuth()

  return (
    <div className="gc-portal-page container">
      <Helmet><title>Editor Portal – GraceChords</title></Helmet>

      <h1>Editor Portal</h1>
      <p className="gc-portal-page__subtitle">
        Welcome, {profile?.display_name || 'Editor'}. Use this portal to manage songs and content.
      </p>

      <section className="gc-portal-section">
        <h2>Editor Tools</h2>
        <p style={{ color: 'var(--gc-text-secondary)', fontSize: 'var(--gc-font-sub)', margin: 0 }}>
          As an <strong>Editor</strong>, you can add and edit songs &amp; posts directly,
          approve or reject collaborator suggestions, and request deletions.
        </p>
        <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Link to="/songs" className="gc-btn gc-btn--primary">
            Browse Songs
          </Link>
          <Link to="/resources" className="gc-btn gc-btn--secondary">
            Blog Posts
          </Link>
        </div>
      </section>
    </div>
  )
}
