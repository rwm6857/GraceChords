import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useRole } from '../../hooks/useRole'
import { useAuth } from '../../hooks/useAuth'
import { showToast } from '../../utils/app/toast'

function formatDate(str) {
  if (!str) return ''
  try {
    return new Date(str).toLocaleString()
  } catch {
    return str
  }
}

function MetadataDiff({ oldPayload, newPayload }) {
  const FIELDS = [
    'title', 'artist', 'default_key', 'tempo', 'time_signature',
    'country', 'youtube_id', 'mp3_url', 'pptx_url', 'slug', 'tags',
  ]

  const diffs = FIELDS.filter(f => {
    const oldVal = JSON.stringify(oldPayload?.[f] ?? '')
    const newVal = JSON.stringify(newPayload?.[f] ?? '')
    return oldVal !== newVal
  })

  if (diffs.length === 0) return null

  return (
    <div className="gc-suggestion-card__diff-section">
      <div className="gc-suggestion-card__diff-title">Metadata changes</div>
      {diffs.map(f => (
        <div key={f} className="gc-suggestion-card__diff-row">
          <span className="gc-suggestion-card__diff-key">{f}</span>
          {oldPayload && (
            <>
              <span className="gc-suggestion-card__diff-old">
                {JSON.stringify(oldPayload[f] ?? '')}
              </span>
              <span className="gc-suggestion-card__diff-arrow">→</span>
            </>
          )}
          <span className="gc-suggestion-card__diff-new">
            {JSON.stringify(newPayload?.[f] ?? '')}
          </span>
        </div>
      ))}
    </div>
  )
}

function ContentDiff({ oldContent, newContent }) {
  if (!oldContent && !newContent) return null

  const oldLines = (oldContent || '').split('\n')
  const newLines = (newContent || '').split('\n')

  // Simple line-by-line diff: mark added vs removed
  const maxLen = Math.max(oldLines.length, newLines.length)
  const rows = []
  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i]
    const n = newLines[i]
    if (o === n) {
      rows.push({ type: 'same', text: n })
    } else {
      if (o !== undefined) rows.push({ type: 'removed', text: o })
      if (n !== undefined) rows.push({ type: 'added', text: n })
    }
  }

  const hasDiff = rows.some(r => r.type !== 'same')
  if (!hasDiff) return null

  return (
    <div className="gc-suggestion-card__diff-section">
      <div className="gc-suggestion-card__diff-title">Content changes</div>
      <div className="gc-suggestion-card__content-diff">
        {rows.map((row, i) => (
          <div
            key={i}
            className={
              row.type === 'added' ? 'gc-suggestion-card__diff-line--added' :
              row.type === 'removed' ? 'gc-suggestion-card__diff-line--removed' :
              undefined
            }
          >
            {row.type === 'added' ? '+ ' : row.type === 'removed' ? '- ' : '  '}
            {row.text}
          </div>
        ))}
      </div>
    </div>
  )
}

function RejectionForm({ onSubmit, onCancel }) {
  const [reason, setReason] = useState('')

  return (
    <div className="gc-rejection-form">
      <textarea
        className="gc-rejection-form__textarea"
        placeholder="Reason for rejection (optional)..."
        value={reason}
        onChange={e => setReason(e.target.value)}
      />
      <div className="gc-rejection-form__actions">
        <button
          type="button"
          className="gc-btn gc-btn--destructive gc-btn--sm"
          onClick={() => onSubmit(reason)}
        >
          Confirm Rejection
        </button>
        <button
          type="button"
          className="gc-btn gc-btn--secondary gc-btn--sm"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function SuggestionCard({ suggestion, currentSong, onApproved, onRejected, onTouchUp, canDirectDelete }) {
  const { session } = useAuth()
  const [rejecting, setRejecting] = useState(false)
  const [loading, setLoading] = useState(false)

  async function writeAuditLog(action, note) {
    await supabase.from('editor_audit_log').insert({
      actor_id: session?.user?.id,
      action,
      song_id: suggestion.song_id,
      song_slug: currentSong?.slug,
      song_title: currentSong?.title,
      payload_snapshot: suggestion.payload,
      note,
    })
  }

  async function handleApprove() {
    if (loading) return
    setLoading(true)
    try {
      // Merge payload into songs table
      const payload = suggestion.payload || {}
      const { error: songError } = await supabase
        .from('songs')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', suggestion.song_id)

      if (songError) {
        showToast(`Error applying suggestion: ${songError.message}`)
        setLoading(false)
        return
      }

      // Update suggestion status
      const { error: sugError } = await supabase
        .from('song_suggestions')
        .update({
          status: 'approved',
          reviewed_by: session?.user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', suggestion.id)

      if (sugError) {
        showToast(`Error updating suggestion: ${sugError.message}`)
        setLoading(false)
        return
      }

      await writeAuditLog('approved', null)
      showToast('Suggestion approved.')
      onApproved(suggestion.id)
    } catch (err) {
      showToast(`Unexpected error: ${err.message}`)
    }
    setLoading(false)
  }

  async function handleReject(reason) {
    if (loading) return
    setLoading(true)
    try {
      const { error } = await supabase
        .from('song_suggestions')
        .update({
          status: 'rejected',
          reviewed_by: session?.user?.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason || null,
        })
        .eq('id', suggestion.id)

      if (error) {
        showToast(`Error rejecting suggestion: ${error.message}`)
        setLoading(false)
        return
      }

      await writeAuditLog('rejected', reason || null)
      showToast('Suggestion rejected.')
      onRejected(suggestion.id)
    } catch (err) {
      showToast(`Unexpected error: ${err.message}`)
    }
    setLoading(false)
    setRejecting(false)
  }

  const isDeletion = suggestion.change_type === 'deletion'

  return (
    <div className={`gc-suggestion-card${isDeletion ? ' gc-suggestion-card--deletion' : ''}`}>
      <div className={`gc-suggestion-card__header${isDeletion ? ' gc-suggestion-card__header--deletion' : ''}`}>
        <span className="gc-suggestion-card__proposer">
          {suggestion.users?.display_name || 'Unknown user'}
        </span>
        <span className="gc-suggestion-card__meta">{formatDate(suggestion.created_at)}</span>
        <span className={`gc-suggestion-card__badge gc-suggestion-card__badge--${suggestion.change_type}`}>
          {suggestion.change_type}
        </span>
      </div>

      <div className="gc-suggestion-card__body">
        {isDeletion && (
          <div className="gc-suggestion-card__deletion-warning">
            ⚠ This suggestion requests deletion of this song. Admin approval required.
          </div>
        )}

        {suggestion.proposer_note && (
          <div className="gc-suggestion-card__note">
            "{suggestion.proposer_note}"
          </div>
        )}

        <MetadataDiff
          oldPayload={currentSong}
          newPayload={suggestion.payload}
        />
        <ContentDiff
          oldContent={currentSong?.chordpro_content}
          newContent={suggestion.payload?.chordpro_content}
        />
      </div>

      <div className="gc-suggestion-card__actions">
        {(!isDeletion || canDirectDelete) && (
          <button
            type="button"
            className="gc-btn gc-btn--primary gc-btn--sm"
            onClick={handleApprove}
            disabled={loading}
          >
            Approve
          </button>
        )}
        <button
          type="button"
          className="gc-btn gc-btn--secondary gc-btn--sm"
          onClick={() => onTouchUp(suggestion)}
          disabled={loading}
        >
          Touch Up
        </button>
        <button
          type="button"
          className="gc-btn gc-btn--destructive gc-btn--sm"
          onClick={() => setRejecting(true)}
          disabled={loading}
        >
          Reject
        </button>
      </div>

      {rejecting && (
        <RejectionForm
          onSubmit={handleReject}
          onCancel={() => setRejecting(false)}
        />
      )}
    </div>
  )
}

export default function SuggestionReviewPanel({ songId, currentSong, onApproved, onRejected, onTouchUp }) {
  const { isAtLeast } = useRole()
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchSuggestions = useCallback(async () => {
    if (!songId || !isAtLeast('editor')) return
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('song_suggestions')
      .select('*, users!suggested_by(display_name)')
      .eq('song_id', songId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setSuggestions(data || [])
    }
    setLoading(false)
  }, [songId, isAtLeast])

  useEffect(() => {
    fetchSuggestions()
  }, [fetchSuggestions])

  if (!isAtLeast('editor')) return null

  function handleApproved(id) {
    setSuggestions(s => s.filter(x => x.id !== id))
    if (onApproved) onApproved(id)
  }

  function handleRejected(id) {
    setSuggestions(s => s.filter(x => x.id !== id))
    if (onRejected) onRejected(id)
  }

  const canDirectDelete = isAtLeast('admin')

  return (
    <div className="gc-suggestion-review gc-portal-section">
      <h2>Pending Suggestions</h2>

      {error && (
        <p style={{ color: 'var(--gc-danger)' }}>Error loading suggestions: {error}</p>
      )}

      {loading && <p className="gc-suggestion-review__empty">Loading suggestions…</p>}

      {!loading && !error && suggestions.length === 0 && (
        <p className="gc-suggestion-review__empty">No pending suggestions for this song.</p>
      )}

      {suggestions.map(s => (
        <SuggestionCard
          key={s.id}
          suggestion={s}
          currentSong={currentSong}
          onApproved={handleApproved}
          onRejected={handleRejected}
          onTouchUp={onTouchUp}
          canDirectDelete={canDirectDelete}
        />
      ))}
    </div>
  )
}
