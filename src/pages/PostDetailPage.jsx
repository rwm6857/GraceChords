import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { fetchPostBySlug } from '../hooks/usePosts'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function isUpdated(publishedAt, updatedAt) {
  if (!publishedAt || !updatedAt) return false
  const diff = new Date(updatedAt) - new Date(publishedAt)
  // Only show "Updated" if updated more than 5 minutes after publish
  return diff > 5 * 60 * 1000
}

export default function PostDetailPage() {
  const { slug } = useParams()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) return
    fetchPostBySlug(slug).then(({ data, error }) => {
      if (error || !data || data.status !== 'published') {
        setNotFound(true)
      } else {
        setPost(data)
      }
      setLoading(false)
    })
  }, [slug])

  if (loading) {
    return (
      <div className="gc-post-detail container">
        <p style={{ color: 'var(--gc-text-secondary)' }}>Loading…</p>
      </div>
    )
  }

  if (notFound || !post) {
    return (
      <div className="gc-post-detail container">
        <h1>Post not found</h1>
        <Link to="/posts" className="gc-btn gc-btn--secondary gc-btn--sm">← Back to Posts</Link>
      </div>
    )
  }

  const authorName = post.users?.display_name || null
  const showUpdated = isUpdated(post.published_at, post.updated_at)
  const dateLabel = showUpdated
    ? `Updated ${formatDate(post.updated_at)}`
    : formatDate(post.published_at)
  const dateIso = showUpdated ? post.updated_at : post.published_at

  return (
    <div className="gc-post-detail container">
      <Helmet>
        <title>{post.title} · GraceChords</title>
        {post.excerpt && <meta name="description" content={post.excerpt} />}
        {post.featured_image_url && <meta property="og:image" content={post.featured_image_url} />}
      </Helmet>

      <div className="gc-post-detail__back">
        <Link to="/posts">← All Posts</Link>
      </div>

      <header className="gc-post-detail__header">
        {(post.tags || []).length > 0 && (
          <div className="gc-post-detail__tags" aria-label="Tags">
            {post.tags.map(t => (
              <span key={t} className="gc-posts-tag">{t}</span>
            ))}
          </div>
        )}
        <h1 className="gc-post-detail__title">{post.title}</h1>
        {post.excerpt && (
          <p className="gc-post-detail__excerpt">{post.excerpt}</p>
        )}
        {(authorName || post.published_at) && (
          <p className="gc-post-detail__meta">
            {authorName && <span className="gc-post-detail__author">{authorName}</span>}
            {authorName && dateIso && <span className="gc-post-detail__meta-sep"> • </span>}
            {dateIso && (
              <time dateTime={dateIso} className="gc-post-detail__date">
                {dateLabel}
              </time>
            )}
          </p>
        )}
      </header>

      {post.featured_image_url && (
        <div className="gc-post-detail__hero">
          <img
            src={post.featured_image_url}
            alt=""
            className="gc-post-detail__hero-img"
          />
        </div>
      )}

      <div
        className="gc-post-detail__content gc-prose"
        dangerouslySetInnerHTML={{ __html: post.content || '' }}
      />
    </div>
  )
}
