import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useRole } from '../hooks/useRole'

export default function EditorFab() {
  const { isAtLeast } = useRole()
  const location = useLocation()

  // Only render for Collaborator+
  if (!isAtLeast('collaborator')) return null

  const pathname = location.pathname

  // Hide on portal/editor pages
  if (pathname.startsWith('/portal/editor')) return null

  // Detect song pages: /song/:slug or /songs/:slug
  const songMatch = pathname.match(/^\/songs?\/([^/]+)$/)
  if (!songMatch) return null

  const slug = songMatch[1]

  return (
    <Link
      to={`/portal/editor/${slug}`}
      className="gc-editor-fab"
      aria-label="Edit this song"
    >
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M13.5 2.5l4 4L6 18H2v-4L13.5 2.5z"/>
      </svg>
      Edit
    </Link>
  )
}
