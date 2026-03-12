import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { createPost, fetchPostById, updatePost } from '../../hooks/usePosts'
import { useAuth } from '../../hooks/useAuth'
import { showToast } from '../../utils/app/toast'
import PostEditor from '../../components/editor/PostEditor'

/* -----------------------------------------------------------------------
 * Derive a slug from a title:
 *   "Hello, World!" → "hello_world"
 * ----------------------------------------------------------------------- */
function slugify(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const BLANK = {
  title: '',
  slug: '',
  excerpt: '',
  featured_image_url: '',
  tags: '',
  status: 'draft',
  content: '',
}

export default function EditPostPage() {
  const { id } = useParams()          // undefined → new post
  const isNew = !id
  const navigate = useNavigate()
  const { session } = useAuth()

  const [form, setForm] = useState(BLANK)
  const [slugManual, setSlugManual] = useState(false) // user has edited slug manually
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [notFound, setNotFound] = useState(false)
  const initialContentRef = useRef('')

  // Load post for editing
  useEffect(() => {
    if (isNew) return
    setLoading(true)
    fetchPostById(id).then(({ data, error }) => {
      if (error || !data) {
        setNotFound(true)
      } else {
        initialContentRef.current = data.content || ''
        setForm({
          title: data.title || '',
          slug: data.slug || '',
          excerpt: data.excerpt || '',
          featured_image_url: data.featured_image_url || '',
          tags: (data.tags || []).join(', '),
          status: data.status || 'draft',
          content: data.content || '',
        })
        setSlugManual(true) // editing existing → slug is fixed
      }
      setLoading(false)
    })
  }, [id, isNew])

  function set(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      // Auto-generate slug from title unless the user has manually edited it
      if (field === 'title' && !slugManual) {
        next.slug = slugify(value)
      }
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!form.title.trim()) {
      showToast('Title is required.')
      return
    }
    if (!form.slug.trim()) {
      showToast('Slug is required.')
      return
    }

    const tagList = form.tags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)

    setSaving(true)
    try {
      if (isNew) {
        const { data, error } = await createPost({
          title: form.title.trim(),
          slug: form.slug.trim(),
          excerpt: form.excerpt.trim() || null,
          content: form.content || null,
          featured_image_url: form.featured_image_url.trim() || null,
          tags: tagList,
          status: form.status,
          author_id: session?.user?.id,
        })
        if (error) throw error
        showToast('Post created.')
        navigate(`/portal/posts/${data.id}/edit`, { replace: true })
      } else {
        const { error } = await updatePost(id, {
          title: form.title.trim(),
          slug: form.slug.trim(),
          excerpt: form.excerpt.trim() || null,
          content: form.content || null,
          featured_image_url: form.featured_image_url.trim() || null,
          tags: tagList,
          status: form.status,
        })
        if (error) throw error
        showToast('Post saved.')
      }
    } catch (err) {
      showToast(err?.message || 'Failed to save post.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleImageError(err) {
    showToast(err?.message || 'Image upload failed.')
  }

  if (loading) {
    return (
      <div className="gc-portal-page">
        <p style={{ color: 'var(--gc-text-secondary)' }}>Loading…</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="gc-portal-page">
        <h1>Post not found</h1>
        <p><a href="/portal/posts" className="gc-btn gc-btn--secondary gc-btn--sm">Back to posts</a></p>
      </div>
    )
  }

  return (
    <div className="gc-portal-page gc-edit-post-page">
      <Helmet>
        <title>{isNew ? 'New Post' : `Edit: ${form.title}`} · GraceChords</title>
      </Helmet>

      <div className="gc-portal-page__header">
        <div>
          <h1>{isNew ? 'New Post' : 'Edit Post'}</h1>
          <p className="gc-portal-page__subtitle">
            {isNew ? 'Create a new post' : form.title}
          </p>
        </div>
        <a href="/portal/posts" className="gc-btn gc-btn--secondary">
          ← Back to posts
        </a>
      </div>

      <form onSubmit={handleSubmit} className="gc-edit-post-form">
        <div className="gc-edit-post-form__cols">
          {/* ---- Left: main content ---- */}
          <div className="gc-edit-post-form__main">
            <div className="gc-portal-section">
              <div className="gc-field">
                <label className="gc-field__label" htmlFor="post-title">Title</label>
                <input
                  id="post-title"
                  className="gc-input"
                  type="text"
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="Post title"
                  required
                />
              </div>

              <div className="gc-field">
                <label className="gc-field__label" htmlFor="post-excerpt">Excerpt</label>
                <textarea
                  id="post-excerpt"
                  className="gc-input gc-input--textarea"
                  value={form.excerpt}
                  onChange={e => set('excerpt', e.target.value)}
                  placeholder="Short summary (optional)"
                  rows={3}
                />
              </div>

              <div className="gc-field">
                <label className="gc-field__label">Content</label>
                <PostEditor
                  content={form.content}
                  onChange={html => set('content', html)}
                  placeholder="Start writing your post…"
                />
              </div>
            </div>
          </div>

          {/* ---- Right: metadata sidebar ---- */}
          <div className="gc-edit-post-form__sidebar">
            {/* Status */}
            <div className="gc-portal-section">
              <h2 className="gc-edit-post-form__sidebar-heading">Publish</h2>

              <div className="gc-field">
                <label className="gc-field__label" htmlFor="post-status">Status</label>
                <div className="gc-edit-post-status-toggle">
                  <label className={`gc-edit-post-status-option${form.status === 'draft' ? ' is-active' : ''}`}>
                    <input
                      type="radio"
                      name="status"
                      value="draft"
                      checked={form.status === 'draft'}
                      onChange={() => set('status', 'draft')}
                    />
                    Draft
                  </label>
                  <label className={`gc-edit-post-status-option${form.status === 'published' ? ' is-active' : ''}`}>
                    <input
                      type="radio"
                      name="status"
                      value="published"
                      checked={form.status === 'published'}
                      onChange={() => set('status', 'published')}
                    />
                    Published
                  </label>
                </div>
              </div>

              <button
                type="submit"
                className="gc-btn gc-btn--primary"
                disabled={saving}
                style={{ width: '100%' }}
              >
                {saving ? 'Saving…' : isNew ? 'Create post' : 'Save changes'}
              </button>
            </div>

            {/* Slug */}
            <div className="gc-portal-section">
              <h2 className="gc-edit-post-form__sidebar-heading">URL</h2>
              <div className="gc-field">
                <label className="gc-field__label" htmlFor="post-slug">Slug</label>
                <input
                  id="post-slug"
                  className="gc-input gc-input--mono"
                  type="text"
                  value={form.slug}
                  onChange={e => {
                    setSlugManual(true)
                    set('slug', e.target.value)
                  }}
                  placeholder="url-slug"
                />
                <span className="gc-field__help">/posts/{form.slug || '…'}</span>
              </div>
            </div>

            {/* Meta */}
            <div className="gc-portal-section">
              <h2 className="gc-edit-post-form__sidebar-heading">Metadata</h2>

              <div className="gc-field">
                <label className="gc-field__label" htmlFor="post-featured-image">Featured image URL</label>
                <input
                  id="post-featured-image"
                  className="gc-input"
                  type="url"
                  value={form.featured_image_url}
                  onChange={e => set('featured_image_url', e.target.value)}
                  placeholder="https://…"
                />
              </div>

              <div className="gc-field">
                <label className="gc-field__label" htmlFor="post-tags">Tags</label>
                <input
                  id="post-tags"
                  className="gc-input"
                  type="text"
                  value={form.tags}
                  onChange={e => set('tags', e.target.value)}
                  placeholder="worship, announcement, …"
                />
                <span className="gc-field__help">Comma-separated</span>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
