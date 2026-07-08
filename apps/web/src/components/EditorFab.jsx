import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { PencilIcon } from './Icons'

export default function EditorFab() {
  const { isLoggedIn } = useAuth()
  const location = useLocation()

  // Any signed-in user can open the editor (to submit for review; editor+ save
  // directly). Hidden for anonymous visitors.
  if (!isLoggedIn) return null

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
      title="Edit this song"
    >
      <PencilIcon size={20} aria-hidden />
    </Link>
  )
}
