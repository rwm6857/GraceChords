import React from 'react'
import { useNavigate } from 'react-router-dom'

// Shown when /api/telegram/push returns 409 needs_link. Nudges the
// user to the Telegram section of /profile without losing their
// setlist context.
export default function LinkTelegramDialog({ onClose }) {
  const navigate = useNavigate()

  function goToProfile() {
    navigate('/profile#telegram')
  }

  return (
    <div className="gc-modal-overlay" onClick={onClose}>
      <div className="gc-modal" onClick={e => e.stopPropagation()}>
        <h2>Link your Telegram</h2>
        <p style={{ margin: 0, color: 'var(--gc-text-secondary)', fontSize: 'var(--gc-font-sub)' }}>
          To send charts straight to your phone, link your GraceChords account
          to <strong>@gracechords_bot</strong> on Telegram. It only takes a moment.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className="gc-btn gc-btn--primary"
            onClick={goToProfile}
          >
            Link Telegram
          </button>
          <button
            type="button"
            className="gc-btn gc-btn--ghost"
            onClick={onClose}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
