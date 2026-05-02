import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useRole } from '../../hooks/useRole'
import { showToast } from '../../utils/app/toast'
import SegmentedControl from '../../components/ui/layout-kit/SegmentedControl'
import MobileActionSheet from '../../components/ui/mobile/MobileActionSheet'
import MobileInfoTab from '../../components/editor/mobile/MobileInfoTab'
import MobileLyricsTab from '../../components/editor/mobile/MobileLyricsTab'
import MobileDetailsTab from '../../components/editor/mobile/MobileDetailsTab'
import LivePreviewModal from '../../components/editor/LivePreviewModal'
import '../../styles/mobile-editor.css'

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
  stem_slug: '',
  gracetracks_url: '',
}

function slugify(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const TAB_OPTIONS = [
  { value: 'info',    label: 'Info' },
  { value: 'lyrics',  label: 'Lyrics' },
  { value: 'details', label: 'Details' },
]

export default function MobileEditorPage() {
  const { slug: slugParam } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { role, isAtLeast } = useRole()

  // Open to Lyrics when editing existing, Info for new
  const isNewSong = !slugParam || slugParam === '_new_'
  const [tab, setTab] = useState(isNewSong ? 'info' : 'lyrics')
  const [song, setSong] = useState(null)
  const [formValues, setFormValues] = useState(BLANK_FORM)
  const [savedFormValues, setSavedFormValues] = useState(BLANK_FORM)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [backSheet, setBackSheet] = useState(false)

  // ---- Load song ----
  useEffect(() => {
    setNotFound(false)
    // '_new_' is the synthetic slug used by the mobile portal FAB for new-song creation
    if (isNewSong) {
      setSong(null)
      setFormValues(BLANK_FORM)
      setSavedFormValues(BLANK_FORM)
      setIsDirty(false)
      setSubmitted(false)
      setTab('info')
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
      if (error) { showToast(`Error loading song: ${error.message}`); return }
      if (!data) { setNotFound(true); return }

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
        stem_slug: data.stem_slug || '',
        gracetracks_url: data.gracetracks_url || '',
      }
      setSong(data)
      setFormValues(loaded)
      setSavedFormValues(loaded)
      setIsDirty(false)
      setSubmitted(false)
    }

    load()
    return () => { cancelled = true }
  }, [slugParam, isNewSong])

  const handleFormChange = useCallback((newValues) => {
    setFormValues(newValues)
    setIsDirty(true)
  }, [])

  // ---- Validation ----
  const validationErrors = {}
  if (submitted) {
    if (!formValues.title?.trim()) validationErrors.title = 'Required'
    if (!formValues.default_key)   validationErrors.default_key = 'Required'
    if (!formValues.tags?.length)  validationErrors.tags = 'At least one tag required'
  }
  const hasErrors = Object.keys(validationErrors).length > 0

  // ---- Helpers ----
  async function writeAuditLog(action, songId, songSlug, songTitle, payload, note) {
    await supabase.from('editor_audit_log').insert({
      actor_id: session?.user?.id,
      action,
      song_id: songId || null,
      song_slug: songSlug || null,
      song_title: songTitle || null,
      payload_snapshot: payload || null,
      note: note || null,
    })
  }

  async function deriveUniqueSlug(title, currentId) {
    const base = slugify(title)
    if (!base) return ''
    let candidate = base
    let n = 2
    while (true) {
      const { data } = await supabase
        .from('songs').select('id').eq('slug', candidate).maybeSingle()
      if (!data || data.id === currentId) return candidate
      candidate = `${base}_${n++}`
    }
  }

  // ---- Save — returns true on success ----
  async function handleSave() {
    setSubmitted(true)
    const errors = {}
    if (!formValues.title?.trim()) errors.title = 'Required'
    if (!formValues.default_key)   errors.default_key = 'Required'
    if (!formValues.tags?.length)  errors.tags = 'At least one tag required'
    if (Object.keys(errors).length > 0) {
      setTab('info')
      return false
    }
    if (saving) return false
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
        if (error) { showToast(`Error: ${error.message}`); setSaving(false); return false }
        await writeAuditLog('suggestion_submitted', song?.id, song?.slug, formValues.title, payload, null)
        showToast('Suggestion submitted for review')
        setIsDirty(false)
        setSavedFormValues(formValues)
        setSaving(false)
        return true

      } else if (isAtLeast('editor')) {
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
          stem_slug: payload.stem_slug || null,
          gracetracks_url: payload.gracetracks_url || null,
          is_deleted: false,
          updated_at: new Date().toISOString(),
        }
        if (isNew) upsertPayload.created_at = new Date().toISOString()

        const { data: savedSong, error } = await supabase
          .from('songs')
          .upsert(upsertPayload, { onConflict: 'slug' })
          .select()
          .single()

        if (error) { showToast(`Error saving: ${error.message}`); setSaving(false); return false }

        await writeAuditLog('direct_save', savedSong.id, savedSong.slug, savedSong.title, upsertPayload, null)
        showToast('Song saved')
        setIsDirty(false)
        setSong(savedSong)
        setSavedFormValues(formValues)
        setSaving(false)
        if (isNew && savedSong.slug) {
          navigate(`/portal/editor/${savedSong.slug}`, { replace: true })
        }
        return true
      }
    } catch (err) {
      showToast(`Unexpected error: ${err.message}`)
    }

    setSaving(false)
    return false
  }

  function handleBack() {
    if (isDirty) {
      setBackSheet(true)
    } else {
      navigate('/portal/editor')
    }
  }

  async function handleSaveAndExit() {
    setBackSheet(false)
    const ok = await handleSave()
    if (ok) navigate('/portal/editor')
  }

  function handleDiscardAndExit() {
    setBackSheet(false)
    setIsDirty(false)
    navigate('/portal/editor')
  }

  const saveLabel = saving ? 'Saving…' : (role === 'collaborator' ? 'Submit' : 'Save')
  const headerTitle = formValues.title
    ? `${formValues.title}${formValues.default_key ? ` (${formValues.default_key})` : ''}`
    : (slugParam ? 'Loading…' : 'New Song')

  if (notFound) {
    return (
      <div className="gc-me-not-found">
        <p>Song not found.</p>
        <button type="button" className="gc-btn gc-btn--primary" onClick={() => navigate('/portal/editor')}>
          Back to Editor
        </button>
      </div>
    )
  }

  return (
    <div className="gc-me">
      <Helmet>
        <title>{song ? `Edit: ${song.title}` : 'New Song'} – GraceChords</title>
      </Helmet>

      {/* Header */}
      <div className="gc-me-header">
        <button type="button" className="gc-me-header__back" onClick={handleBack} aria-label="Back">
          <svg width="10" height="18" viewBox="0 0 10 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 1L1 9l8 8"/>
          </svg>
        </button>
        <span className="gc-me-header__title">{headerTitle}</span>
        <button
          type="button"
          className={`gc-btn gc-btn--primary gc-btn--sm${hasErrors ? ' gc-btn--soft-disabled' : ''}`}
          onClick={handleSave}
          disabled={saving}
        >
          {saveLabel}
        </button>
      </div>

      {/* Tab bar */}
      <div className="gc-me-tabs">
        <SegmentedControl
          ariaLabel="Editor section"
          value={tab}
          onChange={setTab}
          options={TAB_OPTIONS}
        />
      </div>

      {/* Tab content */}
      <div className="gc-me-content">
        {tab === 'info' && (
          <MobileInfoTab
            values={formValues}
            onChange={handleFormChange}
            errors={submitted ? validationErrors : {}}
          />
        )}
        {tab === 'lyrics' && (
          <MobileLyricsTab
            values={formValues}
            onChange={handleFormChange}
            onPreviewToggle={() => setShowPreview(true)}
          />
        )}
        {tab === 'details' && (
          <MobileDetailsTab
            values={formValues}
            onChange={handleFormChange}
          />
        )}
      </div>

      {/* Live preview modal */}
      {showPreview && (
        <LivePreviewModal
          content={formValues.chordpro_content}
          metadata={{ title: formValues.title, currentKey: formValues.default_key }}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Back with unsaved changes */}
      <MobileActionSheet
        open={backSheet}
        onClose={() => setBackSheet(false)}
        title="Unsaved Changes"
      >
        <div className="gc-me-sheet-actions">
          <button type="button" className="gc-btn gc-btn--primary" onClick={handleSaveAndExit}>
            Save &amp; Exit
          </button>
          <button type="button" className="gc-btn gc-btn--destructive" onClick={handleDiscardAndExit}>
            Discard &amp; Exit
          </button>
          <button type="button" className="gc-btn gc-btn--secondary" onClick={() => setBackSheet(false)}>
            Cancel
          </button>
        </div>
      </MobileActionSheet>
    </div>
  )
}
