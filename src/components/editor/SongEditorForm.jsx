import React, { useRef, useState } from 'react'
import { CHROMATIC_KEYS } from '../../utils/chordpro/diatonicChords'
import { useRole } from '../../hooks/useRole'
import { useAuth } from '../../hooks/useAuth'
import { publicUrl } from '../../utils/network/publicUrl'
import { showToast } from '../../utils/app/toast'

// Deployed Cloudflare Worker URL for PPTX uploads/deletions.
// Set VITE_PPTX_WORKER_URL in your .env to the deployed worker URL.
const PPTX_WORKER_URL = import.meta.env.VITE_PPTX_WORKER_URL || ''

const TIME_SIGNATURES = ['4/4', '3/4', '2/4', '6/8']

const LANGUAGE_OPTIONS = ['', 'English', 'Turkish', 'Spanish', 'Arabic', 'Korean', 'Other']

// Normalize YouTube input to a bare video ID
function normalizeYoutubeInput(raw) {
  if (!raw) return { id: '', valid: true }
  const s = raw.trim()
  if (!s) return { id: '', valid: true }

  // Already 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return { id: s, valid: true }

  // youtube.com/watch?v=ID
  const watchMatch = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (watchMatch) return { id: watchMatch[1], valid: true }

  // youtu.be/ID
  const shortMatch = s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (shortMatch) return { id: shortMatch[1], valid: true }

  // youtube.com/shorts/ID
  const shortsMatch = s.match(/shorts\/([a-zA-Z0-9_-]{11})/)
  if (shortsMatch) return { id: shortsMatch[1], valid: true }

  return { id: s, valid: false }
}

function extractFilename(url) {
  if (!url) return ''
  const parts = url.split('/')
  return decodeURIComponent(parts[parts.length - 1] || url)
}

function PptxWidget({ value, onChange, disabled, slug, title }) {
  const { can, isAtLeast } = useRole()
  const { session } = useAuth()
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState('')
  const [replacing, setReplacing] = useState(false)

  const canUpload = can('suggest') // collaborator+
  const canReplace = isAtLeast('editor')
  const canDelete = can('deletePptx') // admin+

  // Configuration warning when worker URL is missing
  if (!PPTX_WORKER_URL) {
    return (
      <div className="gc-pptx-widget">
        <p className="gc-pptx-widget__config-warning">
          PPTX upload is not configured. Set <code>VITE_PPTX_WORKER_URL</code> in your environment.
        </p>
      </div>
    )
  }

  // --- File exists state ---
  if (value && !replacing) {
    const filename = extractFilename(value)
    const downloadUrl = value.startsWith('http') ? value : publicUrl(value)

    async function handleDelete() {
      if (!window.confirm(`Delete PPTX for "${title || 'this song'}"? This cannot be undone.`)) return
      setActionError('')
      setDeleting(true)
      try {
        const resp = await fetch(`${PPTX_WORKER_URL}/delete`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session?.access_token || ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ slug }),
        })
        const data = await resp.json()
        if (!resp.ok) {
          setActionError(data.error || 'Delete failed')
          return
        }
        onChange('')
        showToast('PPTX deleted.')
      } catch (err) {
        setActionError('Network error — delete failed')
      } finally {
        setDeleting(false)
      }
    }

    return (
      <div className="gc-pptx-widget gc-pptx-widget--has-file">
        <span className="gc-pptx-widget__filename">{filename}</span>
        <div className="gc-pptx-widget__actions">
          {canUpload && (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="gc-btn gc-btn--secondary gc-btn--sm"
            >
              Download
            </a>
          )}
          {canReplace && (
            <button
              type="button"
              className="gc-btn gc-btn--secondary gc-btn--sm"
              onClick={() => { setReplacing(true); setActionError(''); setSelectedFile(null); setFileError('') }}
              disabled={disabled || deleting}
            >
              Replace
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="gc-btn gc-btn--destructive gc-btn--sm"
              onClick={handleDelete}
              disabled={disabled || deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          )}
        </div>
        {actionError && (
          <p className="gc-pptx-widget__error">{actionError}</p>
        )}
      </div>
    )
  }

  // --- No file (or replacing) state ---
  if (!canUpload) {
    return null
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    setFileError('')
    setSelectedFile(null)
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.pptx')) {
      setFileError('Only .pptx files are allowed.')
      return
    }
    if (f.size > 20 * 1024 * 1024) {
      setFileError('File must be under 20MB.')
      return
    }
    setSelectedFile(f)
  }

  async function handleUpload() {
    if (!selectedFile) return
    if (!slug) return
    setActionError('')
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('slug', slug)
      const resp = await fetch(`${PPTX_WORKER_URL}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: formData,
      })
      const data = await resp.json()
      if (!resp.ok) {
        setActionError(data.error || 'Upload failed')
        return
      }
      onChange(data.url)
      setSelectedFile(null)
      setReplacing(false)
      showToast('PPTX uploaded.')
    } catch (err) {
      setActionError('Network error — upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="gc-pptx-widget">
      {!slug ? (
        <p className="gc-pptx-widget__no-slug">
          Save the song first before uploading a PPTX.
        </p>
      ) : (
        <div className="gc-pptx-widget__upload-row">
          <input
            type="file"
            accept=".pptx"
            onChange={handleFileChange}
            disabled={disabled || uploading}
          />
          <button
            type="button"
            className="gc-btn gc-btn--secondary gc-btn--sm"
            onClick={handleUpload}
            disabled={disabled || uploading || !selectedFile || !slug}
          >
            {uploading ? 'Uploading...' : 'Upload PPTX'}
          </button>
          {replacing && (
            <button
              type="button"
              className="gc-btn gc-btn--secondary gc-btn--sm"
              onClick={() => { setReplacing(false); setSelectedFile(null); setFileError(''); setActionError('') }}
              disabled={uploading}
            >
              Cancel
            </button>
          )}
        </div>
      )}
      {fileError && (
        <p className="gc-pptx-widget__error">{fileError}</p>
      )}
      {actionError && (
        <p className="gc-pptx-widget__error">{actionError}</p>
      )}
    </div>
  )
}

export default function SongEditorForm({ values, onChange, disabled, validationErrors = {} }) {
  const { can } = useRole()
  const [tagInput, setTagInput] = useState('')
  const [youtubeWarning, setYoutubeWarning] = useState('')
  const tapTimestamps = useRef([])
  const tapResetTimeout = useRef(null)

  function handleChange(field, val) {
    onChange({ ...values, [field]: val })
  }

  // ---- Tags ----
  function handleTagInputKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagInput)
    }
  }

  function handleTagInputBlur() {
    if (tagInput.trim()) addTag(tagInput)
  }

  function addTag(raw) {
    const tag = raw.trim().replace(/,/g, '').trim()
    if (!tag) return
    const current = Array.isArray(values.tags) ? values.tags : []
    if (!current.includes(tag)) {
      handleChange('tags', [...current, tag])
    }
    setTagInput('')
  }

  function removeTag(tag) {
    const current = Array.isArray(values.tags) ? values.tags : []
    handleChange('tags', current.filter(t => t !== tag))
  }

  const tags = Array.isArray(values.tags) ? values.tags : []

  // ---- YouTube normalize on blur ----
  function handleYoutubeBlur() {
    const raw = values.youtube_id || ''
    if (!raw.trim()) {
      setYoutubeWarning('')
      return
    }
    const { id, valid } = normalizeYoutubeInput(raw)
    handleChange('youtube_id', id)
    setYoutubeWarning(valid ? '' : 'Could not extract a valid YouTube video ID from this input.')
  }

  // ---- Tap tempo ----
  function handleTap() {
    const now = Date.now()

    // Reset if gap > 3 seconds
    if (tapTimestamps.current.length > 0) {
      const last = tapTimestamps.current[tapTimestamps.current.length - 1]
      if (now - last > 3000) tapTimestamps.current = []
    }

    tapTimestamps.current.push(now)

    clearTimeout(tapResetTimeout.current)
    tapResetTimeout.current = setTimeout(() => {
      tapTimestamps.current = []
    }, 3000)

    if (tapTimestamps.current.length >= 2) {
      const taps = tapTimestamps.current.slice(-8)
      const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1)
      const bpm = Math.round(60000 / avg)
      if (bpm >= 20 && bpm <= 400) handleChange('tempo', bpm)
    }
  }

  const inputCls = (field) =>
    `gc-song-editor-form__input${validationErrors[field] ? ' gc-song-editor-form__input--error' : ''}`

  return (
    <div className="gc-song-editor-form">

      {/* Title — full width */}
      <div className="gc-song-editor-form__field gc-song-editor-form__field--full">
        <label className="gc-song-editor-form__label" htmlFor="sef-title">
          Title <span className="gc-song-editor-form__required">*</span>
        </label>
        <input
          id="sef-title"
          className={inputCls('title')}
          type="text"
          value={values.title || ''}
          onChange={e => handleChange('title', e.target.value)}
          disabled={disabled}
          placeholder="Song title"
        />
        {validationErrors.title && (
          <p className="gc-song-editor-form__field-error">{validationErrors.title}</p>
        )}
      </div>

      {/* Artist — full width */}
      <div className="gc-song-editor-form__field gc-song-editor-form__field--full">
        <label className="gc-song-editor-form__label" htmlFor="sef-artist">Artist</label>
        <input
          id="sef-artist"
          className="gc-song-editor-form__input"
          type="text"
          value={values.artist || ''}
          onChange={e => handleChange('artist', e.target.value)}
          disabled={disabled}
          placeholder="Artist / composer"
        />
      </div>

      {/* Row: Key / Country */}
      <div className="gc-song-editor-form__row">
        <div className="gc-song-editor-form__field">
          <label className="gc-song-editor-form__label" htmlFor="sef-key">
            Key <span className="gc-song-editor-form__required">*</span>
          </label>
          <select
            id="sef-key"
            className={`gc-song-editor-form__select${validationErrors.default_key ? ' gc-song-editor-form__input--error' : ''}`}
            value={values.default_key || ''}
            onChange={e => handleChange('default_key', e.target.value)}
            disabled={disabled}
          >
            <option value="">— Select key —</option>
            {CHROMATIC_KEYS.map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          {validationErrors.default_key && (
            <p className="gc-song-editor-form__field-error">{validationErrors.default_key}</p>
          )}
        </div>
        <div className="gc-song-editor-form__field">
          <label className="gc-song-editor-form__label" htmlFor="sef-country">Country</label>
          <input
            id="sef-country"
            className="gc-song-editor-form__input"
            type="text"
            value={values.country || ''}
            onChange={e => handleChange('country', e.target.value)}
            disabled={disabled}
            placeholder="e.g. USA"
          />
        </div>
      </div>

      {/* Row: Time Signature / Tempo + TAP */}
      <div className="gc-song-editor-form__row">
        <div className="gc-song-editor-form__field">
          <label className="gc-song-editor-form__label" htmlFor="sef-time">Time Signature</label>
          <select
            id="sef-time"
            className="gc-song-editor-form__select"
            value={values.time_signature || ''}
            onChange={e => handleChange('time_signature', e.target.value)}
            disabled={disabled}
          >
            <option value="">— Select —</option>
            {TIME_SIGNATURES.map(ts => (
              <option key={ts} value={ts}>{ts}</option>
            ))}
          </select>
        </div>
        <div className="gc-song-editor-form__field">
          <label className="gc-song-editor-form__label" htmlFor="sef-tempo">Tempo (BPM)</label>
          <div className="gc-song-editor-form__tempo-row">
            <input
              id="sef-tempo"
              className="gc-song-editor-form__input"
              type="number"
              min={20}
              max={400}
              value={values.tempo || ''}
              onChange={e => handleChange('tempo', e.target.value ? parseInt(e.target.value, 10) : null)}
              disabled={disabled}
              placeholder="e.g. 120"
            />
            <button
              type="button"
              className="gc-song-editor-form__tap-btn"
              onPointerDown={handleTap}
              disabled={disabled}
              title="Tap to calculate BPM"
            >
              TAP
            </button>
          </div>
        </div>
      </div>

      {/* Language — full width */}
      <div className="gc-song-editor-form__field gc-song-editor-form__field--full">
        <label className="gc-song-editor-form__label" htmlFor="sef-language">Language</label>
        <select
          id="sef-language"
          className="gc-song-editor-form__select"
          value={values.language || ''}
          onChange={e => handleChange('language', e.target.value)}
          disabled={disabled}
        >
          {LANGUAGE_OPTIONS.map(l => (
            <option key={l} value={l}>{l || '— Select language —'}</option>
          ))}
        </select>
      </div>

      {/* Tags — full width, horizontally scrollable chips */}
      <div className="gc-song-editor-form__field gc-song-editor-form__field--full">
        <label className="gc-song-editor-form__label" htmlFor="sef-tags">
          Tags <span className="gc-song-editor-form__required">*</span>
        </label>
        <input
          id="sef-tags"
          className={inputCls('tags')}
          type="text"
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={handleTagInputKeyDown}
          onBlur={handleTagInputBlur}
          disabled={disabled}
          placeholder="Type a tag and press Enter or comma"
        />
        {validationErrors.tags && (
          <p className="gc-song-editor-form__field-error">{validationErrors.tags}</p>
        )}
        <div className="gc-song-editor-form__tags-scroll">
          {tags.map(tag => (
            <span key={tag} className="gc-song-editor-form__tag">
              {tag}
              {!disabled && (
                <button
                  type="button"
                  className="gc-song-editor-form__tag-remove"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {tags.length === 0 && (
            <span className="gc-song-editor-form__tags-placeholder">No tags yet</span>
          )}
        </div>
      </div>

      {/* YouTube ID — full width, normalize on blur */}
      <div className="gc-song-editor-form__field gc-song-editor-form__field--full">
        <label className="gc-song-editor-form__label" htmlFor="sef-youtube">YouTube ID or URL</label>
        <input
          id="sef-youtube"
          className="gc-song-editor-form__input"
          type="text"
          value={values.youtube_id || ''}
          onChange={e => { handleChange('youtube_id', e.target.value); setYoutubeWarning('') }}
          onBlur={handleYoutubeBlur}
          disabled={disabled}
          placeholder="e.g. dQw4w9WgXcQ or https://youtube.com/watch?v=..."
        />
        {youtubeWarning && (
          <p className="gc-song-editor-form__warning">{youtubeWarning}</p>
        )}
      </div>

      {/* PPTX — full width, file widget */}
      <div className="gc-song-editor-form__field gc-song-editor-form__field--full">
        <label className="gc-song-editor-form__label">Lyric PPT File</label>
        <PptxWidget
          value={values.pptx_url || ''}
          onChange={v => handleChange('pptx_url', v)}
          disabled={disabled}
          slug={values.slug || ''}
          title={values.title || ''}
        />
      </div>

    </div>
  )
}
