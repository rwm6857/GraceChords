import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { fetchPosts } from '../hooks/usePosts'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function PostCard({ post }) {
  return (
    <article className="gc-post-card">
      {post.featured_image_url && (
        <Link to={`/posts/${post.slug}`} className="gc-post-card__img-link" tabIndex={-1} aria-hidden="true">
          <img
            src={post.featured_image_url}
            alt=""
            className="gc-post-card__img"
            loading="lazy"
          />
        </Link>
      )}
      <div className="gc-post-card__body">
        {(post.tags || []).length > 0 && (
          <div className="gc-post-card__tags" aria-label="Tags">
            {post.tags.map(t => (
              <span key={t} className="gc-posts-tag">{t}</span>
            ))}
          </div>
        )}
        <h2 className="gc-post-card__title">
          <Link to={`/posts/${post.slug}`}>{post.title}</Link>
        </h2>
        {post.excerpt && (
          <p className="gc-post-card__excerpt">{post.excerpt}</p>
        )}
        <div className="gc-post-card__meta">
          {post.published_at && (
            <time dateTime={post.published_at} className="gc-post-card__date">
              {formatDate(post.published_at)}
            </time>
          )}
        </div>
      </div>
    </article>
  )
}

export default function PostsPage() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPosts({ status: 'published' }).then(({ data, error }) => {
      if (!error) setPosts(data || [])
      setLoading(false)
    })
  }, [])

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

      {loading ? (
        <p className="gc-posts-empty">Loading…</p>
      ) : posts.length === 0 ? (
        <p className="gc-posts-empty">No posts published yet.</p>
      ) : (
        <div className="gc-posts-grid">
          {posts.map(post => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}
