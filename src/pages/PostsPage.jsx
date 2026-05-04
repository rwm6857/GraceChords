import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { fetchPublishedPostsWithAuthors } from '../hooks/usePosts'
import Button from '../components/ui/layout-kit/Button'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatTime(date) {
  if (!date) return ''
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function PostCard({ post }) {
  const { t } = useTranslation('pages')
  const authorName = post.users?.display_name

  return (
    <Link to={`/posts/${post.slug}`} className="gc-post-card">
      <div className="gc-post-card__body">
        {(post.tags || []).length > 0 && (
          <div className="gc-post-card__tags" aria-label={t('posts.tagsAria')}>
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
  const { t } = useTranslation('pages')
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState('All')

  const loadPosts = useCallback(async () => {
    const { data, error } = await fetchPublishedPostsWithAuthors()
    if (error) console.error('[PostsPage] Failed to load posts:', error)
    else setPosts(data || [])
    setLastUpdated(new Date())
  }, [])

  useEffect(() => {
    let cancelled = false
    loadPosts().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [loadPosts])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadPosts()
    setRefreshing(false)
  }, [loadPosts])

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
        <h1 className="gc-posts-page__title">{t('posts.title')}</h1>
        <p className="gc-posts-page__lead">{t('posts.subtitle')}</p>
        {!loading && (
          <div className="gc-posts-page__refresh" style={{ display: 'flex', alignItems: 'center', gap: 'var(--gc-space-3)', marginTop: 'var(--gc-space-2)' }}>
            <Button
              size="sm"
              variant="secondary"
              loading={refreshing}
              onClick={handleRefresh}
              aria-label={t('posts.refreshAria')}
            >
              {t('posts.refresh')}
            </Button>
            {lastUpdated && (
              <span style={{ color: 'var(--gc-text-secondary)', fontSize: 'var(--gc-text-sm)' }}>
                {t('posts.updated', { time: formatTime(lastUpdated) })}
              </span>
            )}
          </div>
        )}
      </header>

      {!loading && (
        <div className="gc-posts-controls">
          <input
            type="search"
            className="gc-input gc-posts-search__input"
            placeholder={t('posts.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label={t('posts.searchAria')}
          />
          {allTags.length > 0 && (
            <div className="gc-posts-filter" role="group" aria-label={t('posts.filterAria')}>
              <button
                type="button"
                className={`gc-posts-filter__chip${activeTag === 'All' ? ' is-active' : ''}`}
                onClick={() => setActiveTag('All')}
              >
                {t('posts.all')}
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
        <p className="gc-posts-empty">{t('posts.loading')}</p>
      ) : filtered.length === 0 ? (
        <p className="gc-posts-empty">{t('posts.empty')}</p>
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
