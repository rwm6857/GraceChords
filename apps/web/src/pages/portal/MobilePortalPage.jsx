import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useSongs } from '../../hooks/useSongs'
import '../../styles/mobile-editor.css'

export default function MobilePortalPage() {
  const { songs } = useSongs()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!songs) return []
    const q = search.trim().toLowerCase()
    const list = q
      ? songs.filter(s =>
          s.title?.toLowerCase().includes(q) ||
          (s.authors || []).join(' ').toLowerCase().includes(q)
        )
      : songs
    return list.slice(0, 150)
  }, [songs, search])

  return (
    <div className="gc-me-portal">
      <Helmet>
        <title>Song Editor – GraceChords</title>
      </Helmet>

      <div className="gc-me-portal__header">
        <h1 className="gc-me-portal__title">Song Editor</h1>
      </div>

      <div className="gc-me-portal__search-wrap">
        <input
          className="gc-me-portal__search"
          type="search"
          placeholder="Search songs…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="gc-me-portal__list">
        {filtered.length === 0 && search && (
          <p className="gc-me-portal__empty">No songs found for "{search}"</p>
        )}
        {filtered.length === 0 && !search && songs && (
          <p className="gc-me-portal__empty">No songs yet. Tap + to add one.</p>
        )}
        {filtered.map(s => (
          <Link
            key={s.id}
            to={`/portal/editor/${s.id}`}
            className="gc-me-portal__row"
          >
            <span className="gc-me-portal__row-title">{s.title}</span>
            <span className="gc-me-portal__row-meta">
              {s.originalKey && (
                <span className="gc-me-portal__row-key">{s.originalKey}</span>
              )}
            </span>
            <svg
              className="gc-me-portal__row-arrow"
              width="8"
              height="14"
              viewBox="0 0 8 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M1 1l6 6-6 6"/>
            </svg>
          </Link>
        ))}
      </div>

      <Link to="/portal/editor/_new_" className="gc-me-portal__fab" aria-label="New Song">
        +
      </Link>
    </div>
  )
}
