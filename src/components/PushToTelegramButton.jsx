import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/layout-kit'
import { SendIcon } from './Icons'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { showToast } from '../utils/app/toast'
import LinkTelegramDialog from './LinkTelegramDialog'

// Sends the given items to the signed-in user's linked Telegram chat
// via POST /api/telegram/push. If the user isn't linked yet the server
// returns 409 needs_link and we surface the link dialog instead.
//
// Props:
//   items: [{ song_id, key }]  — UUID + optional transposed key per song
//   context: 'song' | 'setlist'
//   label, shortLabel, size, variant, disabled, title — pass-throughs
export default function PushToTelegramButton({
  items,
  context = 'song',
  label = 'Send to Telegram',
  shortLabel,
  size = 'md',
  variant = 'telegram',
  disabled = false,
  title,
  className,
  style,
  iconOnly = false,
}) {
  const { isLoggedIn } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [showLinkDialog, setShowLinkDialog] = useState(false)

  const isEmpty = !Array.isArray(items) || items.length === 0

  async function handleClick(e) {
    if (e?.preventDefault) e.preventDefault()
    if (!isLoggedIn) {
      showToast('Sign in to send charts to Telegram.')
      navigate('/login?redirect=/profile')
      return
    }
    if (isEmpty || busy) return

    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        showToast('Session expired — please sign in again.')
        navigate('/login?redirect=/profile')
        return
      }
      const resp = await fetch('/api/telegram/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items, context }),
      })
      if (resp.status === 202) {
        showToast(context === 'setlist' ? 'Setlist sent to Telegram.' : 'Sent to Telegram.')
        return
      }
      if (resp.status === 409) {
        setShowLinkDialog(true)
        return
      }
      if (resp.status === 401) {
        showToast('Please sign in again.')
        navigate('/login?redirect=/profile')
        return
      }
      const body = await resp.json().catch(() => ({}))
      showToast(body?.error ? `Telegram: ${body.error}` : 'Failed to send to Telegram.')
    } catch (err) {
      showToast(`Telegram: ${err?.message || err}`)
    } finally {
      setBusy(false)
    }
  }

  const displayLabel = busy ? 'Sending…' : label
  const buttonTitle = title || (isEmpty ? 'Add songs first' : label)

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={disabled || isEmpty || busy}
        title={buttonTitle}
        aria-label={label}
        leftIcon={<SendIcon />}
        iconOnly={iconOnly}
        className={className}
        style={style}
      >
        {iconOnly ? null : (
          shortLabel ? (
            <>
              <span className="text-when-wide">{displayLabel}</span>
              <span className="text-when-narrow">{busy ? '…' : shortLabel}</span>
            </>
          ) : displayLabel
        )}
      </Button>
      {showLinkDialog ? (
        <LinkTelegramDialog onClose={() => setShowLinkDialog(false)} />
      ) : null}
    </>
  )
}
