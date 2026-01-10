import React, { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PencilIcon } from './Icons'

export default function EditorFab(){
  const location = useLocation()
  const path = location.pathname || ''

  const hide = useMemo(() => {
    const prefixes = ['/editor', '/admin', '/admin/resources', '/worship', '/readings']
    return prefixes.some(p => path.startsWith(p))
  }, [path])

  const to = useMemo(() => {
    const songMatch = /^\/song\/([^/]+)/.exec(path)
    const resMatch = /^\/resources\/([^/]+)/.exec(path)
    if (songMatch) return `/editor?song=${encodeURIComponent(songMatch[1])}`
    if (resMatch) return `/editor?resource=${encodeURIComponent(resMatch[1])}&tab=posts`
    if (path === '/songs') return '/editor?newSong=1'
    if (path === '/resources') return '/editor?tab=posts&newResource=1'
    return '/editor?newSong=1'
  }, [path])

  if (hide) return null

  return (
    <Link className="gc-editor-fab" to={to} aria-label="Open editor">
      <PencilIcon size={20} />
    </Link>
  )
}
