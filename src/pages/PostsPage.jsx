import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { fetchPublishedPostsWithAuthors } from '../hooks/usePosts'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function PostCard({ post }) {
  const authorName = post.users?.display_name

  return (
    <Link to={`/posts/${post.slug}`} className="gc-post-card">
      <div className="gc-post-card__body">
        {(post.tags || []).length > 0 && (
          <div className="gc-post-card__tags" aria-label="Tags">
            {post.tags.map(t => (
              <span key={t} className="gc-posts-tag">{t}</span>
            ))}
          </div>
        )}
        <h2 className="gc-post-card__title">{post.title}</h2>
        {post.excerpt && (
          <p className="gc-post-card__excerpt">{post.excerpt}</p>
        )}
        <div className="gc-post-card__meta">
          {authorName && (
            <span className="gc-post-card__author">{authorName}</span>
          )}
          {post.published_at && (
            <time dateTime={post.published_at} className="gc-post-card__date">
              {formatDate(post.published_at)}
            </time>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function PostsPage() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState('All')

  useEffect(() => {
    fetchPublishedPostsWithAuthors().then(({ data, error }) => {
      if (!error) setPosts(data || [])
      setLoading(false)
    })
  }, [])

  const allTags = useMemo(() => {
    const set = new Set()
    posts.forEach(p => (p.tags || []).forEach(t => set.add(t)))
    return Array.from(set).sort()
  }, [posts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return posts.filter(p => {
      const matchesSearch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        (p.excerpt || '').toLowerCase().includes(q)
      const matchesTag =
        activeTag === 'All' || (p.tags || []).includes(activeTag)
      return matchesSearch && matchesTag
    })
  }, [posts, search, activeTag])

  return (
    <div className="gc-posts-page container">
      <Helmet>
        <title>Posts · GraceChords</title>
        <meta name="description" content="News, announcements and worship resources from GraceChords." />
      </Helmet>

      <header className="gc-posts-page__header">
        <h1 className="gc-posts-page__title">Posts</h1>
        <p className="gc-posts-page__lead">News, announcements and worship resources</p>
      </header>

      {!loading && (
        <div className="gc-posts-controls">
          <input
            type="search"
            className="gc-input gc-posts-search__input"
            placeholder="Search posts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search posts"
          />
          {allTags.length > 0 && (
            <div className="gc-posts-filter" role="group" aria-label="Filter by tag">
              <button
                type="button"
                className={`gc-posts-filter__chip${activeTag === 'All' ? ' is-active' : ''}`}
                onClick={() => setActiveTag('All')}
              >
                All
              </button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  type="button"
                  className={`gc-posts-filter__chip${activeTag === tag ? ' is-active' : ''}`}
                  onClick={() => setActiveTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="gc-posts-empty">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="gc-posts-empty">No posts found.</p>
      ) : (
        <div className="gc-posts-grid">
          {filtered.map(post => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}
