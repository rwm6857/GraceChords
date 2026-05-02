import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { showToast } from '../utils/app/toast'

/**
 * Shows a "Request Collaborator Access" button if:
 *   - role === 'user'
 *   - is_collaborator_eligible() returns true (account ≥ 7 days old)
 *
 * If not yet eligible, shows the eligible-after date.
 * After submission, button becomes disabled with "Request Pending".
 */
export default function CollaboratorRequest() {
  const { session, role } = useAuth()
  const [eligible, setEligible] = useState(null) // null = loading
  const [eligibleDate, setEligibleDate] = useState(null)
  const [pending, setPending] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!session || role !== 'user') return
    let cancelled = false

    async function checkEligibility() {
      const { data, error } = await supabase.rpc('is_collaborator_eligible')
      if (cancelled) return
      if (error) {
        console.error('[CollaboratorRequest] eligibility check:', error)
        return
      }
      setEligible(!!data)

      if (!data) {
        const { data: profile } = await supabase
          .from('users')
          .select('account_created_at')
          .eq('id', session.user.id)
          .maybeSingle()
        if (cancelled) return
        if (profile?.account_created_at) {
          const created = new Date(profile.account_created_at)
          const eligDate = new Date(created.getTime() + 7 * 24 * 60 * 60 * 1000)
          setEligibleDate(eligDate)
        }
      }
    }

    async function checkPendingRequest() {
      const { data } = await supabase
        .from('collaborator_requests')
        .select('id, status')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (cancelled) return
      if (data?.status === 'pending') setPending(true)
    }

    checkEligibility()
    checkPendingRequest()

    return () => { cancelled = true }
  }, [session, role])

  async function submitRequest() {
    setSubmitting(true)
    const { error } = await supabase
      .from('collaborator_requests')
      .upsert({ user_id: session.user.id, status: 'pending' }, { onConflict: 'user_id' })
    if (error) {
      showToast('Failed to submit request. Please try again.')
      console.error('[CollaboratorRequest] submit:', error)
    } else {
      setPending(true)
      showToast('Collaborator access requested!')
    }
    setSubmitting(false)
  }

  // Only shown to role === 'user'
  if (!session || role !== 'user') return null
  // Still loading eligibility
  if (eligible === null) return null

  if (eligible && !pending) {
    return (
      <button
        className="gc-btn gc-btn--secondary"
        onClick={submitRequest}
        disabled={submitting}
        style={{ width: 'fit-content' }}
      >
        {submitting ? 'Submitting…' : 'Request Collaborator Access'}
      </button>
    )
  }

  if (eligible && pending) {
    return (
      <button className="gc-btn gc-btn--secondary" disabled style={{ width: 'fit-content' }}>
        Request Pending
      </button>
    )
  }

  // Not yet eligible
  const dateStr = eligibleDate
    ? eligibleDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : ''
  return (
    <p style={{ color: 'var(--gc-text-secondary)', fontSize: 'var(--gc-font-sub)', margin: 0 }}>
      Collaborator access available after 7 days
      {dateStr ? ` (eligible ${dateStr})` : ''}.
    </p>
  )
}
