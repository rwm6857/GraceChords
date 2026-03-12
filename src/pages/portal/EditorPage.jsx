import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useRole } from '../../hooks/useRole'
import { showToast } from '../../utils/app/toast'
import SongEditorForm from '../../components/editor/SongEditorForm'
import ChordProEditor from '../../components/editor/ChordProEditor'
import LivePreviewModal from '../../components/editor/LivePreviewModal'
import ChordProGuideDrawer from '../../components/editor/ChordProGuideDrawer'
import SuggestionReviewPanel from '../../components/editor/SuggestionReviewPanel'

const BLANK_FORM = {
  title: '',
  artist: '',
  default_key: '',
  tempo: '',
  time_signature: '',
  country: '',
  youtube_id: '',
  language: '',
  pptx_url: '',
  tags: [],
  chordpro_content: '',
}

// Derive a URL-safe slug from a title
function slugify(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function ConfirmDialog({ title, body, confirmLabel, confirmVariant = 'destructive', onConfirm, onCancel }) {
  return (
    <div className="gc-unsaved-dialog">
      <div className="gc-unsaved-dialog__box">
        <h3 className="gc-unsaved-dialog__title">{title}</h3>
        <p className="gc-unsaved-dialog__body">{body}</p>
        <div className="gc-unsaved-dialog__actions">
          <button type="button" className="gc-btn gc-btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={`gc-btn gc-btn--${confirmVariant}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PortalEditorPage() {
  const { slug: slugParam } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { role, isAtLeast } = useRole()
  const editorRef = useRef(null)

  const [song, setSong] = useState(null)
  const [formValues, setFormValues] = useState(BLANK_FORM)
  const [savedFormValues, setSavedFormValues] = useState(BLANK_FORM)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [loadingError, setLoadingError] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  // Modals / overlays
  const [showPreview, setShowPreview] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState(null) // { title, body, confirmLabel, onConfirm }

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const searchTimeout = useRef(null)
  const [showDropdown, setShowDropdown] = useState(false)

  // ---- Load song ----
  useEffect(() => {
    setNotFound(false)
    setLoadingError(null)

    if (!slugParam) {
      setSong(null)
      setFormValues(BLANK_FORM)
      setSavedFormValues(BLANK_FORM)
      setIsDirty(false)
      setSubmitted(false)
      return
    }

    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('songs')
        .select('*')
        .eq('slug', slugParam)
        .eq('is_deleted', false)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        setLoadingError(error.message)
        showToast(`Error loading song: ${error.message}`)
        return
      }

      if (!data) {
        setNotFound(true)
        return
      }

      const loaded = {
        title: data.title || '',
        artist: data.artist || '',
        default_key: data.default_key || '',
        tempo: data.tempo || '',
        time_signature: data.time_signature || '',
        country: data.country || '',
        youtube_id: data.youtube_id || '',
        language: data.language || '',
        pptx_url: data.pptx_url || '',
        tags: data.tags || [],
        chordpro_content: data.chordpro_content || '',
      }
      setSong(data)
      setFormValues(loaded)
      setSavedFormValues(loaded)
      setIsDirty(false)
      setSubmitted(false)
    }

    load()
    return () => { cancelled = true }
  }, [slugParam])

  // ---- Debounced search ----
  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) { setSearchResults([]); setShowDropdown(false); return }

    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      const { data, error } = await supabase
        .from('songs')
        .select('id, slug, title, artist')
        .or(`title.ilike.%${q}%,artist.ilike.%${q}%`)
        .eq('is_deleted', false)
        .limit(10)

      if (!error) { setSearchResults(data || []); setShowDropdown(true) }
    }, 300)

    return () => clearTimeout(searchTimeout.current)
  }, [searchQuery])

  // ---- Validation ----
  const validationErrors = {}
  if (submitted) {
    if (!formValues.title?.trim()) validationErrors.title = 'Title is required'
    if (!formValues.default_key) validationErrors.default_key = 'Key is required'
    if (!Array.isArray(formValues.tags) || formValues.tags.length === 0) {
      validationErrors.tags = 'At least one tag is required'
    }
  }
  const hasErrors = Object.keys(validationErrors).length > 0

  function handleFormChange(newValues) {
    setFormValues(newValues)
    setIsDirty(true)
  }

  function navigateWithGuard(path) {
    if (isDirty) {
      setConfirmDialog({
        title: 'Unsaved changes',
        body: 'You have unsaved changes. Leave without saving?',
        confirmLabel: 'Leave',
        onConfirm: () => { setConfirmDialog(null); setIsDirty(false); navigate(path) },
      })
    } else {
      navigate(path)
    }
  }

  function selectSearchResult(result) {
    setShowDropdown(false)
    setSearchQuery('')
    navigateWithGuard(`/portal/editor/${result.slug}`)
  }

  async function writeAuditLog(action, songId, songSlug, songTitle, payload, note) {
    const { error } = await supabase.from('editor_audit_log').insert({
      actor_id: session?.user?.id,
      action,
      song_id: songId || null,
      song_slug: songSlug || null,
      song_title: songTitle || null,
      payload_snapshot: payload || null,
      note: note || null,
    })
    if (error) console.error('Audit log error:', error.message)
  }

  // Derive a slug that doesn't conflict with other songs
  async function deriveUniqueSlug(title, currentId) {
    const base = slugify(title)
    if (!base) return ''
    let candidate = base
    let n = 2
    while (true) {
      const { data } = await supabase
        .from('songs')
        .select('id')
        .eq('slug', candidate)
        .maybeSingle()
      if (!data || data.id === currentId) return candidate
      candidate = `${base}_${n++}`
    }
  }

  // ---- Save ----
  async function handleSave() {
    setSubmitted(true)

    // Validate required fields
    const errors = {}
    if (!formValues.title?.trim()) errors.title = 'Title is required'
    if (!formValues.default_key) errors.default_key = 'Key is required'
    if (!Array.isArray(formValues.tags) || formValues.tags.length === 0) {
      errors.tags = 'At least one tag is required'
    }
    if (Object.keys(errors).length > 0) return

    if (saving) return
    setSaving(true)

    const isNew = !song
    const payload = { ...formValues }

    try {
      if (role === 'collaborator') {
        const { error } = await supabase.from('song_suggestions').insert({
          song_id: song?.id || null,
          suggested_by: session?.user?.id,
          change_type: isNew ? 'addition' : 'edit',
          payload,
          status: 'pending',
        })
        if (error) { showToast(`Error submitting suggestion: ${error.message}`); setSaving(false); return }
        await writeAuditLog('suggestion_submitted', song?.id, song?.slug, formValues.title, payload, null)
        showToast('Suggestion submitted for review')
        setIsDirty(false)
        setSavedFormValues(formValues)

      } else if (isAtLeast('editor')) {
        // Derive slug silently
        const slug = await deriveUniqueSlug(payload.title, song?.id)

        const upsertPayload = {
          title: payload.title,
          artist: payload.artist || null,
          default_key: payload.default_key || null,
          tempo: payload.tempo || null,
          time_signature: payload.time_signature || null,
          country: payload.country || null,
          youtube_id: payload.youtube_id || null,
          language: payload.language || null,
          pptx_url: payload.pptx_url || null,
          slug,
          tags: payload.tags || [],
          chordpro_content: payload.chordpro_content || null,
          is_deleted: false,
          updated_at: new Date().toISOString(),
        }
        if (isNew) upsertPayload.created_at = new Date().toISOString()

        const { data: savedSong, error } = await supabase
          .from('songs')
          .upsert(upsertPayload, { onConflict: 'slug' })
          .select()
          .single()

        if (error) { showToast(`Error saving song: ${error.message}`); setSaving(false); return }

        await writeAuditLog('direct_save', savedSong.id, savedSong.slug, savedSong.title, upsertPayload, null)
        showToast('Song saved')
        setIsDirty(false)
        setSong(savedSong)
        setSavedFormValues(formValues)

        if (isNew && savedSong.slug) {
          navigate(`/portal/editor/${savedSong.slug}`, { replace: true })
        }
      }

    } catch (err) {
      showToast(`Unexpected error: ${err.message}`)
    }

    setSaving(false)
  }

  // ---- Discard ----
  function handleDiscard() {
    if (!isDirty) return
    setConfirmDialog({
      title: 'Discard changes',
      body: 'Reset all changes back to the last saved state?',
      confirmLabel: 'Discard',
      onConfirm: () => {
        setConfirmDialog(null)
        setFormValues(savedFormValues)
        setIsDirty(false)
        setSubmitted(false)
      },
    })
  }

  // ---- Delete ----
  function handleDelete() {
    if (!song) return

    if (role === 'editor') {
      setConfirmDialog({
        title: 'Request deletion',
        body: `Submit a deletion request for "${song.title}"? An admin will need to approve it.`,
        confirmLabel: 'Submit Request',
        onConfirm: async () => {
          setConfirmDialog(null)
          const { error } = await supabase.from('song_suggestions').insert({
            song_id: song.id,
            suggested_by: session?.user?.id,
            change_type: 'deletion',
            payload: { slug: song.slug, title: song.title },
            status: 'pending',
          })
          if (error) { showToast(`Error submitting deletion request: ${error.message}`); return }
          await writeAuditLog('suggestion_submitted', song.id, song.slug, song.title, null, 'Deletion request')
          showToast('Deletion request submitted for Admin review')
        },
      })
    } else if (isAtLeast('admin')) {
      setConfirmDialog({
        title: 'Delete song',
        body: `Permanently delete "${song.title}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        onConfirm: async () => {
          setConfirmDialog(null)
          const { error } = await supabase
            .from('songs')
            .update({ is_deleted: true })
            .eq('id', song.id)
          if (error) { showToast(`Error deleting song: ${error.message}`); return }
          await writeAuditLog('deleted', song.id, song.slug, song.title, null, null)
          showToast('Song deleted')
          navigate('/portal/editor', { replace: true })
        },
      })
    }
  }

  function handleTouchUp(suggestion) {
    const payload = suggestion.payload || {}
    setFormValues(prev => ({ ...prev, ...payload }))
    setIsDirty(true)
    showToast('Suggestion loaded into editor. Edit and save to apply.')
  }

  const saveLabel = role === 'collaborator' ? 'Submit Suggestion' : 'Save'
  const deleteLabel = isAtLeast('admin') ? 'Delete Song' : 'Request Deletion'

  return (
    <div className="gc-editor-page container">
      <Helmet>
        <title>
          {song ? `Edit: ${song.title} – GraceChords` : 'Song Editor – GraceChords'}
        </title>
      </Helmet>

      {/* Confirm dialog (discard / delete / nav guard) */}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          body={confirmDialog.body}
          confirmLabel={confirmDialog.confirmLabel}
          confirmVariant={confirmDialog.confirmVariant || 'destructive'}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* Live preview modal */}
      {showPreview && (
        <LivePreviewModal
          content={formValues.chordpro_content}
          metadata={{ title: formValues.title, currentKey: formValues.default_key }}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* ChordPro guide drawer */}
      <ChordProGuideDrawer open={showGuide} onClose={() => setShowGuide(false)} />

      {/* Page header */}
      <div className="gc-editor-page__header">
        <h1 className="gc-editor-page__title">
          {song ? 'Edit Song' : 'Song Editor'}
        </h1>

        {/* Search */}
        <div className="gc-editor-page__search-wrap">
          <span className="gc-editor-page__search-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="9" r="6"/>
              <path d="M15 15l3 3"/>
            </svg>
          </span>
          <input
            className="gc-editor-page__search"
            type="search"
            placeholder="Search songs by title or artist…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          />
          {showDropdown && searchResults.length > 0 && (
            <div className="gc-editor-page__search-results">
              {searchResults.map(r => (
                <div
                  key={r.id}
                  className="gc-editor-page__search-result"
                  onMouseDown={() => selectSearchResult(r)}
                  role="option"
                  tabIndex={-1}
                >
                  <span className="gc-editor-page__search-result-title">{r.title}</span>
                  {r.artist && <span className="gc-editor-page__search-result-artist">{r.artist}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {song && (
          <button
            type="button"
            className="gc-btn gc-btn--secondary gc-btn--sm"
            onClick={() => navigateWithGuard('/portal/editor')}
          >
            New Song
          </button>
        )}
      </div>

      {/* Song info bar */}
      {song && (
        <div className="gc-editor-song-bar">
          <div className="gc-editor-song-bar__info">
            <div className="gc-editor-song-bar__title">{song.title}</div>
            {song.artist && <div className="gc-editor-song-bar__artist">{song.artist}</div>}
          </div>
          {isDirty && <span className="gc-editor-page__dirty-badge">Unsaved changes</span>}
        </div>
      )}

      {/* Not found */}
      {notFound && (
        <div className="gc-editor-page__empty">
          <h2>Song not found</h2>
          <p>No song with slug <strong>{slugParam}</strong> exists, or it has been deleted.</p>
          <button type="button" className="gc-btn gc-btn--primary" onClick={() => navigate('/portal/editor')}>
            Back to Editor
          </button>
        </div>
      )}

      {loadingError && !notFound && (
        <p style={{ color: 'var(--gc-danger)' }}>Error: {loadingError}</p>
      )}

      {/* Editor layout */}
      {!notFound && (
        <>
          <div className="gc-editor-page__columns">
            {/* Left: metadata */}
            <div className="gc-editor-page__panel gc-editor-page__panel--meta">
              <div className="gc-editor-page__panel-title">Metadata</div>
              <SongEditorForm
                values={formValues}
                onChange={handleFormChange}
                disabled={saving}
                validationErrors={validationErrors}
              />
            </div>

            {/* Right: ChordPro editor */}
            <div className="gc-editor-page__panel gc-editor-page__panel--editor">
              <div className="gc-editor-page__panel-title">ChordPro Content</div>
              <ChordProEditor
                ref={editorRef}
                value={formValues.chordpro_content}
                onChange={v => handleFormChange({ ...formValues, chordpro_content: v })}
                currentKey={formValues.default_key}
                readOnly={saving}
                onGuideOpen={() => setShowGuide(true)}
              />
            </div>
          </div>

          {/* Suggestion review panel (Editor+) */}
          {song && isAtLeast('editor') && (
            <SuggestionReviewPanel
              songId={song.id}
              currentSong={song}
              onApproved={() => {}}
              onRejected={() => {}}
              onTouchUp={handleTouchUp}
            />
          )}
        </>
      )}

      {/* Fixed action bar */}
      <div className="gc-editor-action-bar">
        <button
          type="button"
          className={`gc-btn gc-btn--primary${hasErrors ? ' gc-btn--soft-disabled' : ''}`}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : saveLabel}
        </button>

        <button
          type="button"
          className="gc-btn gc-btn--secondary"
          onClick={handleDiscard}
          disabled={!isDirty || saving}
        >
          Discard
        </button>

        {/* Delete — hidden for collaborator */}
        {song && role !== 'collaborator' && (
          <button
            type="button"
            className="gc-btn gc-btn--destructive"
            onClick={handleDelete}
            disabled={saving}
          >
            {deleteLabel}
          </button>
        )}

        <div className="gc-editor-action-bar__spacer" />

        {song && (
          <a
            href={`/songs/${song.slug}`}
            className="gc-btn gc-btn--secondary"
            target="_blank"
            rel="noopener noreferrer"
          >
            View ↗
          </a>
        )}

        <button
          type="button"
          className="gc-btn gc-btn--secondary"
          onClick={() => setShowPreview(true)}
        >
          Preview
        </button>
      </div>
    </div>
  )
}
