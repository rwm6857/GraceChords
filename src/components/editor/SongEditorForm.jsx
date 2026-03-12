import React, { useEffect, useRef, useState } from 'react'
import { CHROMATIC_KEYS } from '../../utils/chordpro/diatonicChords'
import { supabase } from '../../lib/supabase'

const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '12/8', '2/4', '5/4']

function deriveSlug(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function SongEditorForm({ values, onChange, disabled, currentSongId }) {
  const [slugConflict, setSlugConflict] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const slugCheckTimeout = useRef(null)
  const slugAutoSet = useRef(true) // auto-derive slug from title until user edits it manually

  // When title changes and slug is in auto mode, derive the slug
  useEffect(() => {
    if (!slugAutoSet.current) return
    const derived = deriveSlug(values.title || '')
    if (derived !== values.slug) {
      onChange({ ...values, slug: derived })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.title])

  // Debounced slug conflict check
  useEffect(() => {
    const slug = values.slug
    if (!slug) {
      setSlugConflict(false)
      return
    }

    clearTimeout(slugCheckTimeout.current)
    slugCheckTimeout.current = setTimeout(async () => {
      const { data, error } = await supabase
        .from('songs')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()

      if (!error && data && data.id !== currentSongId) {
        setSlugConflict(true)
      } else {
        setSlugConflict(false)
      }
    }, 400)

    return () => clearTimeout(slugCheckTimeout.current)
  }, [values.slug, currentSongId])

  function handleChange(field, val) {
    onChange({ ...values, [field]: val })
  }

  function handleSlugChange(val) {
    slugAutoSet.current = false
    handleChange('slug', val)
  }

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

  return (
    <div className="gc-song-editor-form">
      {/* Title & Artist */}
      <div className="gc-song-editor-form__row">
        <div className="gc-song-editor-form__field">
          <label className="gc-song-editor-form__label" htmlFor="sef-title">Title</label>
          <input
            id="sef-title"
            className="gc-song-editor-form__input"
            type="text"
            value={values.title || ''}
            onChange={e => handleChange('title', e.target.value)}
            disabled={disabled}
            placeholder="Song title"
          />
        </div>
        <div className="gc-song-editor-form__field">
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
      </div>

      {/* Key & Tempo */}
      <div className="gc-song-editor-form__row">
        <div className="gc-song-editor-form__field">
          <label className="gc-song-editor-form__label" htmlFor="sef-key">Key</label>
          <select
            id="sef-key"
            className="gc-song-editor-form__select"
            value={values.default_key || ''}
            onChange={e => handleChange('default_key', e.target.value)}
            disabled={disabled}
          >
            <option value="">— Select key —</option>
            {CHROMATIC_KEYS.map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
        <div className="gc-song-editor-form__field">
          <label className="gc-song-editor-form__label" htmlFor="sef-tempo">Tempo (BPM)</label>
          <input
            id="sef-tempo"
            className="gc-song-editor-form__input"
            type="number"
            min={40}
            max={300}
            value={values.tempo || ''}
            onChange={e => handleChange('tempo', e.target.value ? parseInt(e.target.value, 10) : null)}
            disabled={disabled}
            placeholder="e.g. 120"
          />
        </div>
      </div>

      {/* Time Signature & Country */}
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

      {/* Tags */}
      <div className="gc-song-editor-form__field">
        <label className="gc-song-editor-form__label" htmlFor="sef-tags">Tags</label>
        <input
          id="sef-tags"
          className="gc-song-editor-form__input"
          type="text"
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={handleTagInputKeyDown}
          onBlur={handleTagInputBlur}
          disabled={disabled}
          placeholder="Type a tag and press Enter or comma"
        />
        {tags.length > 0 && (
          <div className="gc-song-editor-form__tags">
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
          </div>
        )}
      </div>

      {/* YouTube ID & MP3 URL */}
      <div className="gc-song-editor-form__row">
        <div className="gc-song-editor-form__field">
          <label className="gc-song-editor-form__label" htmlFor="sef-youtube">YouTube ID</label>
          <input
            id="sef-youtube"
            className="gc-song-editor-form__input"
            type="text"
            value={values.youtube_id || ''}
            onChange={e => handleChange('youtube_id', e.target.value)}
            disabled={disabled}
            placeholder="e.g. dQw4w9WgXcQ"
          />
        </div>
        <div className="gc-song-editor-form__field">
          <label className="gc-song-editor-form__label" htmlFor="sef-mp3">MP3 URL</label>
          <input
            id="sef-mp3"
            className="gc-song-editor-form__input"
            type="text"
            value={values.mp3_url || ''}
            onChange={e => handleChange('mp3_url', e.target.value)}
            disabled={disabled}
            placeholder="https://..."
          />
        </div>
      </div>

      {/* PPTX URL */}
      <div className="gc-song-editor-form__field">
        <label className="gc-song-editor-form__label" htmlFor="sef-pptx">PPTX URL</label>
        <input
          id="sef-pptx"
          className="gc-song-editor-form__input"
          type="text"
          value={values.pptx_url || ''}
          onChange={e => handleChange('pptx_url', e.target.value)}
          disabled={disabled}
          placeholder="https://..."
        />
      </div>

      {/* Slug */}
      <div className="gc-song-editor-form__field">
        <label className="gc-song-editor-form__label" htmlFor="sef-slug">Slug</label>
        <input
          id="sef-slug"
          className={`gc-song-editor-form__input${slugConflict ? ' gc-song-editor-form__input--warning' : ''}`}
          type="text"
          value={values.slug || ''}
          onChange={e => handleSlugChange(e.target.value)}
          disabled={disabled}
          placeholder="auto-derived from title"
        />
        {slugConflict && (
          <p className="gc-song-editor-form__warning">
            ⚠ This slug is already used by another song.
          </p>
        )}
      </div>
    </div>
  )
}
