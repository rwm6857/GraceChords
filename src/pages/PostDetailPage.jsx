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

export default function PostDetailPage() {
  const { slug } = useParams()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) return
    fetchPostBySlug(slug).then(({ data, error }) => {
      if (error || !data) {
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

      {post.featured_image_url && (
        <div className="gc-post-detail__hero">
          <img
            src={post.featured_image_url}
            alt=""
            className="gc-post-detail__hero-img"
          />
        </div>
      )}

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
        {post.published_at && (
          <time dateTime={post.published_at} className="gc-post-detail__date">
            {formatDate(post.published_at)}
          </time>
        )}
      </header>

      <div
        className="gc-post-detail__content gc-prose"
        dangerouslySetInnerHTML={{ __html: post.content || '' }}
      />
    </div>
  )
}
