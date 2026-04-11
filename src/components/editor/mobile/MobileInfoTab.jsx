import React, { useState } from 'react'
import KeyGrid from './KeyGrid'

export default function MobileInfoTab({ values, onChange, errors = {} }) {
  const [tagInput, setTagInput] = useState('')

  function addTag(raw) {
    const tag = raw.trim().replace(/,/g, '').trim()
    if (!tag) return
    if ((values.tags || []).includes(tag)) { setTagInput(''); return }
    onChange({ ...values, tags: [...(values.tags || []), tag] })
    setTagInput('')
  }

  function removeTag(tag) {
    onChange({ ...values, tags: (values.tags || []).filter(t => t !== tag) })
  }

  function handleTagKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagInput)
    } else if (e.key === 'Backspace' && !tagInput && values.tags?.length) {
      removeTag(values.tags[values.tags.length - 1])
    }
  }

  return (
    <div className="gc-me-info-tab">
      {/* Title */}
      <div className="gc-me-field">
        <label className="gc-me-label" htmlFor="me-title">
          Song Title
          {errors.title && <span className="gc-me-error">{errors.title}</span>}
        </label>
        <input
          id="me-title"
          className={`gc-me-input${errors.title ? ' gc-me-input--error' : ''}`}
          type="text"
          value={values.title || ''}
          onChange={e => onChange({ ...values, title: e.target.value })}
          placeholder="Enter song title…"
          autoComplete="off"
          autoCorrect="off"
        />
      </div>

      {/* Key grid */}
      <div className="gc-me-field">
        <label className="gc-me-label">
          Key
          {errors.default_key && <span className="gc-me-error">{errors.default_key}</span>}
        </label>
        <KeyGrid
          value={values.default_key || ''}
          onChange={key => onChange({ ...values, default_key: key })}
        />
      </div>

      {/* Tags */}
      <div className="gc-me-field">
        <label className="gc-me-label" htmlFor="me-tags">
          Tags
          {errors.tags && <span className="gc-me-error">{errors.tags}</span>}
        </label>
        <div
          className={`gc-me-tags${errors.tags ? ' gc-me-input--error' : ''}`}
          onClick={() => document.getElementById('me-tags')?.focus()}
        >
          {(values.tags || []).map(tag => (
            <span key={tag} className="gc-me-tag">
              {tag}
              <button
                type="button"
                className="gc-me-tag__remove"
                onClick={e => { e.stopPropagation(); removeTag(tag) }}
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            id="me-tags"
            className="gc-me-tags__input"
            type="text"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={() => { if (tagInput.trim()) addTag(tagInput) }}
            placeholder={values.tags?.length ? 'Add tag…' : 'Type a tag and press Enter…'}
          />
        </div>
      </div>
    </div>
  )
}
