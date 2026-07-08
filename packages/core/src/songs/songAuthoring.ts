// Shared song-authoring form model + helpers (web + mobile).
//
// The form shape is the editor's working state; `songRowToForm` /
// `formToSongRow` map between it and a `songs`/`personal_songs` DB row.
// Validation matches the web editor exactly (title, key, ≥1 tag). Keeping this
// in core means both editors validate and serialize identically.

import { parseChordProOrLegacy } from '../chordpro/parser'
import { serializeChordPro } from '../chordpro/serialize'

export type SongForm = {
  title: string
  artist: string
  default_key: string
  tempo: number | '' | null
  time_signature: string
  country: string
  youtube_id: string
  language: string
  pptx_url: string
  tags: string[]
  chordpro_content: string
}

export const BLANK_SONG_FORM: SongForm = {
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

export const TIME_SIGNATURES = ['4/4', '3/4', '2/4', '6/8']

export const LANGUAGE_OPTIONS = ['', 'English', 'Turkish', 'Spanish', 'Arabic', 'Korean', 'Other']

export type SongFormErrors = {
  title?: string
  default_key?: string
  tags?: string
}

/** Required-field validation matching the web editor (title, key, ≥1 tag). */
export function validateSongForm(form: Partial<SongForm>): SongFormErrors {
  const errors: SongFormErrors = {}
  if (!form.title || !String(form.title).trim()) errors.title = 'Title is required'
  if (!form.default_key) errors.default_key = 'Key is required'
  if (!Array.isArray(form.tags) || form.tags.length === 0) {
    errors.tags = 'At least one tag is required'
  }
  return errors
}

export function hasFormErrors(errors: SongFormErrors): boolean {
  return Object.keys(errors).length > 0
}

/** Map a DB row (songs or personal_songs) to editor form state. */
export function songRowToForm(row: Record<string, any> | null | undefined): SongForm {
  const r = row || {}
  return {
    title: r.title || '',
    artist: r.artist || '',
    default_key: r.default_key || '',
    tempo: r.tempo ?? '',
    time_signature: r.time_signature || '',
    country: r.country || '',
    youtube_id: r.youtube_id || '',
    language: r.language || '',
    pptx_url: r.pptx_url || '',
    tags: Array.isArray(r.tags) ? r.tags : [],
    chordpro_content: r.chordpro_content || '',
  }
}

/**
 * Map form state to the column set written to `songs`/`personal_songs`.
 * `chordpro_content` coalesces to '' (not null) — the live column is NOT NULL,
 * so saving an empty body must not violate it. `slug`, `is_deleted`, and
 * timestamps are added by the repo, not here.
 */
export function formToSongRow(form: SongForm): Record<string, any> {
  return {
    title: form.title,
    artist: form.artist || null,
    default_key: form.default_key || null,
    tempo: form.tempo || null,
    time_signature: form.time_signature || null,
    country: form.country || null,
    youtube_id: form.youtube_id || null,
    language: form.language || null,
    pptx_url: form.pptx_url || null,
    tags: Array.isArray(form.tags) ? form.tags : [],
    chordpro_content: form.chordpro_content || '',
  }
}

export type YoutubeNormalizeResult = { id: string; valid: boolean }

/** Normalize a YouTube URL/ID to a bare 11-char video id (matches web). */
export function normalizeYoutubeInput(raw: string | null | undefined): YoutubeNormalizeResult {
  if (!raw) return { id: '', valid: true }
  const s = raw.trim()
  if (!s) return { id: '', valid: true }
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return { id: s, valid: true }
  const watch = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (watch) return { id: watch[1], valid: true }
  const short = s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (short) return { id: short[1], valid: true }
  const shorts = s.match(/shorts\/([a-zA-Z0-9_-]{11})/)
  if (shorts) return { id: shorts[1], valid: true }
  return { id: s, valid: false }
}

/**
 * Pure tap-tempo: given tap timestamps (ms), return the BPM from the last up-to-8
 * taps, or null if fewer than 2 taps or the result is out of the 20–400 range.
 * The caller owns the timestamp buffer and its reset-on-idle logic.
 */
export function computeTapTempoBpm(timestamps: number[]): number | null {
  if (!Array.isArray(timestamps) || timestamps.length < 2) return null
  const taps = timestamps.slice(-8)
  const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1)
  if (!avg) return null
  const bpm = Math.round(60000 / avg)
  return bpm >= 20 && bpm <= 400 ? bpm : null
}

/**
 * Return a copy of the form with its ChordPro body normalized to canonical
 * directive form (round-tripped through the parser). Metadata is NOT injected
 * into the body — title/key/etc. live in their own columns — so this only
 * cleans up section directives and chord placement. Callers opt in on save.
 */
export function canonicalizeForm(form: SongForm): SongForm {
  const body = form.chordpro_content || ''
  if (!body.trim()) return form
  try {
    const doc = parseChordProOrLegacy(body)
    const text = serializeChordPro(doc, { useDirectives: true, includeMeta: false })
    return { ...form, chordpro_content: text }
  } catch {
    // Never let a parse hiccup block a save — keep the raw body.
    return form
  }
}
