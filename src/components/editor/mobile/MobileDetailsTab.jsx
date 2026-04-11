import React, { useRef, useState } from 'react'

const TIME_SIGNATURES = ['4/4', '3/4', '2/4', '6/8']
const LANGUAGE_OPTIONS = ['', 'English', 'Turkish', 'Spanish', 'Arabic', 'Korean', 'Other']

function normalizeYoutubeInput(raw) {
  if (!raw) return { id: '', valid: true }
  const s = raw.trim()
  if (!s) return { id: '', valid: true }
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return { id: s, valid: true }
  const watchMatch = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (watchMatch) return { id: watchMatch[1], valid: true }
  const shortMatch = s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (shortMatch) return { id: shortMatch[1], valid: true }
  const shortsMatch = s.match(/shorts\/([a-zA-Z0-9_-]{11})/)
  if (shortsMatch) return { id: shortsMatch[1], valid: true }
  return { id: s, valid: false }
}

export default function MobileDetailsTab({ values, onChange }) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const tapTimestamps = useRef([])
  const tapTimeout = useRef(null)

  function handleYoutubeBlur(e) {
    const { id } = normalizeYoutubeInput(e.target.value)
    onChange({ ...values, youtube_id: id })
  }

  function handleTap() {
    const now = Date.now()
    const recent = [...(tapTimestamps.current || []), now].filter(t => now - t < 3000).slice(-8)
    tapTimestamps.current = recent
    clearTimeout(tapTimeout.current)
    tapTimeout.current = setTimeout(() => { tapTimestamps.current = [] }, 3000)
    if (recent.length >= 2) {
      const gaps = []
      for (let i = 1; i < recent.length; i++) gaps.push(recent[i] - recent[i - 1])
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
      const bpm = Math.round(60000 / avg)
      if (bpm >= 20 && bpm <= 400) onChange({ ...values, tempo: bpm })
    }
  }

  return (
    <div className="gc-me-details-tab">
      {/* Artist */}
      <div className="gc-me-field">
        <label className="gc-me-label" htmlFor="me-artist">Artist / Composer</label>
        <input
          id="me-artist"
          className="gc-me-input"
          type="text"
          value={values.artist || ''}
          onChange={e => onChange({ ...values, artist: e.target.value })}
          placeholder="Artist or composer name"
          autoComplete="off"
        />
      </div>

      {/* Language + Country */}
      <div className="gc-me-row">
        <div className="gc-me-field">
          <label className="gc-me-label" htmlFor="me-language">Language</label>
          <select
            id="me-language"
            className="gc-me-select"
            value={values.language || ''}
            onChange={e => onChange({ ...values, language: e.target.value })}
          >
            {LANGUAGE_OPTIONS.map(l => <option key={l} value={l}>{l || '—'}</option>)}
          </select>
        </div>
        <div className="gc-me-field">
          <label className="gc-me-label" htmlFor="me-country">Country</label>
          <input
            id="me-country"
            className="gc-me-input"
            type="text"
            value={values.country || ''}
            onChange={e => onChange({ ...values, country: e.target.value })}
            placeholder="e.g. USA"
          />
        </div>
      </div>

      {/* Time signature + Tempo */}
      <div className="gc-me-row">
        <div className="gc-me-field">
          <label className="gc-me-label" htmlFor="me-timesig">Time Sig</label>
          <select
            id="me-timesig"
            className="gc-me-select"
            value={values.time_signature || ''}
            onChange={e => onChange({ ...values, time_signature: e.target.value })}
          >
            <option value="">—</option>
            {TIME_SIGNATURES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="gc-me-field">
          <label className="gc-me-label" htmlFor="me-tempo">Tempo (BPM)</label>
          <div className="gc-me-tempo">
            <input
              id="me-tempo"
              className="gc-me-input"
              type="number"
              min="20"
              max="400"
              value={values.tempo || ''}
              onChange={e => onChange({ ...values, tempo: e.target.value })}
              placeholder="120"
            />
            <button type="button" className="gc-me-tap-btn" onPointerDown={handleTap} aria-label="Tap tempo">
              TAP
            </button>
          </div>
        </div>
      </div>

      {/* YouTube */}
      <div className="gc-me-field">
        <label className="gc-me-label" htmlFor="me-youtube">YouTube URL or ID</label>
        <input
          id="me-youtube"
          className="gc-me-input"
          type="text"
          value={values.youtube_id || ''}
          onChange={e => onChange({ ...values, youtube_id: e.target.value })}
          onBlur={handleYoutubeBlur}
          placeholder="Paste YouTube URL or 11-char ID"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
        />
      </div>

      {/* Advanced */}
      <div className="gc-me-advanced">
        <button
          type="button"
          className="gc-me-advanced__toggle"
          onClick={() => setShowAdvanced(v => !v)}
          aria-expanded={showAdvanced}
        >
          <span>{showAdvanced ? '▼' : '▶'}</span> Advanced (GraceTracks / PPTX)
        </button>
        {showAdvanced && (
          <div className="gc-me-advanced__content">
            <div className="gc-me-field">
              <label className="gc-me-label" htmlFor="me-stem">GraceTracks Stem Slug</label>
              <input
                id="me-stem"
                className="gc-me-input"
                type="text"
                value={values.stem_slug || ''}
                onChange={e => onChange({ ...values, stem_slug: e.target.value })}
                placeholder="R2 folder override (leave blank = song slug)"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <div className="gc-me-field">
              <label className="gc-me-label" htmlFor="me-tracks">GraceTracks URL</label>
              <input
                id="me-tracks"
                className="gc-me-input"
                type="url"
                value={values.gracetracks_url || ''}
                onChange={e => onChange({ ...values, gracetracks_url: e.target.value })}
                placeholder="https://tracks.gracechords.com/…"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
