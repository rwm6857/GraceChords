import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { fetchPosts, deletePost } from '../../hooks/usePosts'
import { useAuth } from '../../hooks/useAuth'
import { showToast } from '../../utils/app/toast'

function StatusBadge({ status }) {
  return (
    <span className={`gc-posts-badge gc-posts-badge--${status}`}>
      {status}
    </span>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function ManagePostsPage() {
  const { session, hasMinRole } = useAuth()
  const navigate = useNavigate()

  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(null) // post object

  const canDelete = hasMinRole('admin')

  useEffect(() => {
    loadPosts()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadPosts() {
    setLoading(true)
    const { data, error } = await fetchPosts()
    if (error) {
      showToast('Failed to load posts.')
      console.error(error)
    } else {
      setPosts(data || [])
    }
    setLoading(false)
  }

  async function handleDelete(post) {
    const { error } = await deletePost(post.id)
    if (error) {
      showToast('Failed to delete post.')
      console.error(error)
    } else {
      showToast(`"${post.title}" deleted.`)
      setPosts(prev => prev.filter(p => p.id !== post.id))
    }
    setConfirmDelete(null)
  }

  return (
    <div className="gc-portal-page">
      <Helmet><title>Manage Posts · GraceChords</title></Helmet>

      <div className="gc-portal-page__header">
        <div>
          <h1>Posts</h1>
          <p className="gc-portal-page__subtitle">Manage blog posts and announcements</p>
        </div>
        <Link to="/portal/posts/new" className="gc-btn gc-btn--primary">
          New post
        </Link>
      </div>

      <div className="gc-portal-section">
        {loading ? (
          <p className="gc-posts-empty">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="gc-posts-empty">No posts yet. <Link to="/portal/posts/new">Create the first one.</Link></p>
        ) : (
          <div className="gc-user-table-wrap">
            <table className="gc-user-table gc-posts-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Published</th>
                  <th>Tags</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {posts.map(post => (
                  <tr key={post.id}>
                    <td>
                      <span className="gc-posts-table__title">{post.title}</span>
                      <span className="gc-posts-table__slug">{post.slug}</span>
                    </td>
                    <td><StatusBadge status={post.status} /></td>
                    <td>{formatDate(post.published_at)}</td>
                    <td>
                      {(post.tags || []).length > 0
                        ? post.tags.map(t => (
                            <span key={t} className="gc-posts-tag">{t}</span>
                          ))
                        : <span className="gc-posts-table__none">—</span>}
                    </td>
                    <td className="gc-posts-table__actions">
                      {post.status === 'published' && (
                        <Link
                          to={`/posts/${post.slug}`}
                          className="gc-btn gc-btn--secondary gc-btn--sm"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View
                        </Link>
                      )}
                      <Link
                        to={`/portal/posts/${post.id}/edit`}
                        className="gc-btn gc-btn--secondary gc-btn--sm"
                      >
                        Edit
                      </Link>
                      {canDelete && (
                        <button
                          type="button"
                          className="gc-btn gc-btn--destructive gc-btn--sm"
                          onClick={() => setConfirmDelete(post)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="gc-unsaved-dialog">
          <div className="gc-unsaved-dialog__box">
            <h3 className="gc-unsaved-dialog__title">Delete post?</h3>
            <p className="gc-unsaved-dialog__body">
              "{confirmDelete.title}" will be permanently deleted and removed from the public site.
            </p>
            <div className="gc-unsaved-dialog__actions">
              <button
                type="button"
                className="gc-btn gc-btn--secondary"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gc-btn gc-btn--destructive"
                onClick={() => handleDelete(confirmDelete)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
