import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useRole } from '../../hooks/useRole'
import { showToast } from '../../utils/app/toast'
import SongEditorForm from '../../components/editor/SongEditorForm'
import ChordProEditor from '../../components/editor/ChordProEditor'
import LivePreview from '../../components/editor/LivePreview'
import SuggestionReviewPanel from '../../components/editor/SuggestionReviewPanel'

const BLANK_FORM = {
  title: '',
  artist: '',
  default_key: '',
  tempo: '',
  time_signature: '',
  country: '',
  youtube_id: '',
  mp3_url: '',
  pptx_url: '',
  slug: '',
  tags: [],
  chordpro_content: '',
}

function UnsavedDialog({ onStay, onLeave }) {
  return (
    <div className="gc-unsaved-dialog">
      <div className="gc-unsaved-dialog__box">
        <h3 className="gc-unsaved-dialog__title">Unsaved changes</h3>
        <p className="gc-unsaved-dialog__body">
          You have unsaved changes. Are you sure you want to leave without saving?
        </p>
        <div className="gc-unsaved-dialog__actions">
          <button type="button" className="gc-btn gc-btn--secondary" onClick={onStay}>
            Stay
          </button>
          <button type="button" className="gc-btn gc-btn--destructive" onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PortalEditorPage() {
  const { slug: slugParam } = useParams()
  const navigate = useNavigate()
  const { session, profile } = useAuth()
  const { role, isAtLeast } = useRole()
  const editorRef = useRef(null)

  const [song, setSong] = useState(null)         // loaded from DB
  const [formValues, setFormValues] = useState(BLANK_FORM)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [loadingError, setLoadingError] = useState(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimeout = useRef(null)
  const [showDropdown, setShowDropdown] = useState(false)

  // Unsaved navigation guard
  const [pendingNav, setPendingNav] = useState(null)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)

  // ---- Load song from slug param ----
  useEffect(() => {
    if (!slugParam) {
      setSong(null)
      setFormValues(BLANK_FORM)
      setIsDirty(false)
      setNotFound(false)
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

      setSong(data)
      setFormValues({
        title: data.title || '',
        artist: data.artist || '',
        default_key: data.default_key || '',
        tempo: data.tempo || '',
        time_signature: data.time_signature || '',
        country: data.country || '',
        youtube_id: data.youtube_id || '',
        mp3_url: data.mp3_url || '',
        pptx_url: data.pptx_url || '',
        slug: data.slug || '',
        tags: data.tags || [],
        chordpro_content: data.chordpro_content || '',
      })
      setIsDirty(false)
    }

    load()
    return () => { cancelled = true }
  }, [slugParam])

  // ---- Debounced search ----
  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true)
      const { data, error } = await supabase
        .from('songs')
        .select('id, slug, title, artist')
        .or(`title.ilike.%${q}%,artist.ilike.%${q}%`)
        .eq('is_deleted', false)
        .limit(10)

      if (!error) {
        setSearchResults(data || [])
        setShowDropdown(true)
      }
      setSearchLoading(false)
    }, 300)

    return () => clearTimeout(searchTimeout.current)
  }, [searchQuery])

  function handleFormChange(newValues) {
    setFormValues(newValues)
    setIsDirty(true)
  }

  function navigateTo(path) {
    if (isDirty) {
      setPendingNav(path)
      setShowUnsavedDialog(true)
    } else {
      navigate(path)
    }
  }

  function selectSearchResult(result) {
    setShowDropdown(false)
    setSearchQuery('')
    navigateTo(`/portal/editor/${result.slug}`)
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

  async function handleSave() {
    if (saving) return
    setSaving(true)

    const isNew = !song
    const payload = { ...formValues }

    try {
      if (role === 'collaborator') {
        // Submit suggestion
        const { error } = await supabase.from('song_suggestions').insert({
          song_id: song?.id || null,
          suggested_by: session?.user?.id,
          change_type: isNew ? 'addition' : 'edit',
          payload,
          status: 'pending',
        })
        if (error) {
          showToast(`Error submitting suggestion: ${error.message}`)
          setSaving(false)
          return
        }
        await writeAuditLog('suggestion_submitted', song?.id, song?.slug, formValues.title, payload, null)
        showToast('Suggestion submitted for review')
        setIsDirty(false)

      } else if (role === 'editor') {
        // Direct save (no deletion)
        const upsertPayload = {
          title: payload.title,
          artist: payload.artist,
          default_key: payload.default_key || null,
          tempo: payload.tempo || null,
          time_signature: payload.time_signature || null,
          country: payload.country || null,
          youtube_id: payload.youtube_id || null,
          mp3_url: payload.mp3_url || null,
          pptx_url: payload.pptx_url || null,
          slug: payload.slug,
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

        if (error) {
          showToast(`Error saving song: ${error.message}`)
          setSaving(false)
          return
        }

        await writeAuditLog('direct_save', savedSong.id, savedSong.slug, savedSong.title, upsertPayload, null)
        showToast('Song saved')
        setIsDirty(false)
        setSong(savedSong)

        if (isNew && savedSong.slug) {
          navigate(`/portal/editor/${savedSong.slug}`, { replace: true })
        }

      } else if (isAtLeast('admin')) {
        // Admin / owner: full save
        const upsertPayload = {
          title: payload.title,
          artist: payload.artist,
          default_key: payload.default_key || null,
          tempo: payload.tempo || null,
          time_signature: payload.time_signature || null,
          country: payload.country || null,
          youtube_id: payload.youtube_id || null,
          mp3_url: payload.mp3_url || null,
          pptx_url: payload.pptx_url || null,
          slug: payload.slug,
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

        if (error) {
          showToast(`Error saving song: ${error.message}`)
          setSaving(false)
          return
        }

        await writeAuditLog('direct_save', savedSong.id, savedSong.slug, savedSong.title, upsertPayload, null)
        showToast('Song saved')
        setIsDirty(false)
        setSong(savedSong)

        if (isNew && savedSong.slug) {
          navigate(`/portal/editor/${savedSong.slug}`, { replace: true })
        }
      }

    } catch (err) {
      showToast(`Unexpected error: ${err.message}`)
    }

    setSaving(false)
  }

  async function handleDelete() {
    if (!song) return

    if (role === 'collaborator' || role === 'editor') {
      // Submit deletion suggestion
      const { error } = await supabase.from('song_suggestions').insert({
        song_id: song.id,
        suggested_by: session?.user?.id,
        change_type: 'deletion',
        payload: { slug: song.slug, title: song.title },
        status: 'pending',
      })
      if (error) {
        showToast(`Error submitting deletion request: ${error.message}`)
        return
      }
      await writeAuditLog('suggestion_submitted', song.id, song.slug, song.title, null, 'Deletion request')
      showToast('Deletion request submitted for Admin review')
    } else if (isAtLeast('admin')) {
      // Hard delete
      const { error } = await supabase
        .from('songs')
        .update({ is_deleted: true })
        .eq('id', song.id)
      if (error) {
        showToast(`Error deleting song: ${error.message}`)
        return
      }
      await writeAuditLog('deleted', song.id, song.slug, song.title, null, null)
      showToast('Song deleted')
      navigate('/portal/editor', { replace: true })
    }
  }

  function handleTouchUp(suggestion) {
    // Load suggestion payload into the editor
    const payload = suggestion.payload || {}
    setFormValues(prev => ({ ...prev, ...payload }))
    setIsDirty(true)
    showToast('Suggestion loaded into editor. Edit and save to apply.')
  }

  const saveLabel = role === 'collaborator' ? 'Submit Suggestion' : 'Save'

  const isNewSong = !slugParam

  return (
    <div className="gc-editor-page container">
      <Helmet>
        <title>
          {song ? `Edit: ${song.title} – GraceChords` : 'Song Editor – GraceChords'}
        </title>
      </Helmet>

      {showUnsavedDialog && (
        <UnsavedDialog
          onStay={() => setShowUnsavedDialog(false)}
          onLeave={() => {
            setShowUnsavedDialog(false)
            setIsDirty(false)
            if (pendingNav) navigate(pendingNav)
          }}
        />
      )}

      {/* Header */}
      <div className="gc-editor-page__header">
        <h1 className="gc-editor-page__title">
          {song ? 'Edit Song' : 'Song Editor'}
        </h1>

        {/* Search bar */}
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
                  {r.artist && (
                    <span className="gc-editor-page__search-result-artist">{r.artist}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {song && (
          <button
            type="button"
            className="gc-btn gc-btn--secondary gc-btn--sm"
            onClick={() => navigateTo('/portal/editor')}
          >
            New Song
          </button>
        )}
      </div>

      {/* Song loaded: info bar */}
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
          <button
            type="button"
            className="gc-btn gc-btn--primary"
            onClick={() => navigate('/portal/editor')}
          >
            Back to Editor
          </button>
        </div>
      )}

      {/* Loading error */}
      {loadingError && !notFound && (
        <p style={{ color: 'var(--gc-danger)' }}>Error: {loadingError}</p>
      )}

      {/* Editor layout (shown when editing or creating a new song) */}
      {!notFound && (
        <>
          <div className="gc-editor-page__columns">
            {/* Left: metadata form */}
            <div className="gc-editor-page__panel">
              <div className="gc-editor-page__panel-title">Metadata</div>
              <SongEditorForm
                values={formValues}
                onChange={handleFormChange}
                disabled={saving}
                currentSongId={song?.id}
              />
            </div>

            {/* Right: ChordPro editor + preview */}
            <div>
              <div className="gc-editor-page__panel">
                <div className="gc-editor-page__panel-title">ChordPro Content</div>
                <ChordProEditor
                  ref={editorRef}
                  value={formValues.chordpro_content}
                  onChange={v => handleFormChange({ ...formValues, chordpro_content: v })}
                  currentKey={formValues.default_key}
                  readOnly={saving}
                />
              </div>
              <div style={{ marginTop: 'var(--space-3)' }}>
                <LivePreview
                  content={formValues.chordpro_content}
                  metadata={{ title: formValues.title, artist: formValues.artist }}
                />
              </div>
            </div>
          </div>

          {/* Save actions */}
          <div className="gc-editor-page__actions">
            <button
              type="button"
              className="gc-btn gc-btn--primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : saveLabel}
            </button>

            {song && isAtLeast('collaborator') && (
              <button
                type="button"
                className="gc-btn gc-btn--destructive"
                onClick={handleDelete}
                disabled={saving}
              >
                {isAtLeast('admin') ? 'Delete Song' : 'Request Deletion'}
              </button>
            )}

            {song && (
              <a
                href={`/songs/${song.slug}`}
                className="gc-btn gc-btn--secondary"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Song ↗
              </a>
            )}
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
    </div>
  )
}
