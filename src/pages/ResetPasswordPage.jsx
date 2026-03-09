import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPasswordPage() {
  const navigate = useNavigate()

  const [isDark, setIsDark] = useState(
    () => document.documentElement.dataset.theme === 'dark'
  )
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setIsDark(document.documentElement.dataset.theme === 'dark')
    )
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // 'checking' | 'valid' | 'invalid'
  const [sessionState, setSessionState] = useState('checking')

  useEffect(() => {
    let settled = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (settled) return
      if (event === 'PASSWORD_RECOVERY') {
        settled = true
        setSessionState('valid')
      } else if (event === 'SIGNED_IN' && session) {
        settled = true
        setSessionState('valid')
      } else if (event === 'SIGNED_OUT') {
        settled = true
        setSessionState('invalid')
      }
    })

    // Also check if there's already an active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (settled) return
      if (session) {
        settled = true
        setSessionState('valid')
      } else {
        // Give Supabase a moment to process the URL hash token
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true
            setSessionState('invalid')
          }
        }, 1500)
        return () => clearTimeout(timer)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setError(error.message)
      setSubmitting(false)
    } else {
      setSuccess(true)
      setTimeout(() => navigate('/login', { replace: true }), 2000)
    }
  }

  if (sessionState === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--gc-text-secondary)' }}>Verifying link…</p>
      </div>
    )
  }

  return (
    <div className="gc-auth-page">
      <div className="gc-auth-card">
        <img
          src={isDark ? '/gc-brand-wide-dark.svg' : '/gc-brand-wide-light.svg'}
          alt="GraceChords"
          className="gc-auth-card__wordmark"
        />

        {sessionState === 'invalid' ? (
          <>
            <h1 className="gc-auth-card__title">Link expired</h1>
            <p className="gc-auth-card__subtitle" style={{ marginBottom: 0 }}>
              This link has expired or is invalid.{' '}
              <Link to="/login">Request a new one</Link>
            </p>
          </>
        ) : success ? (
          <>
            <h1 className="gc-auth-card__title">Password updated</h1>
            <p className="gc-auth-card__subtitle" style={{ marginBottom: 0 }}>
              Password updated. Redirecting…
            </p>
          </>
        ) : (
          <>
            <h1 className="gc-auth-card__title">Reset password</h1>
            <p className="gc-auth-card__subtitle">Choose a new password for your account</p>

            <form onSubmit={handleSubmit} className="gc-auth-form">
              {error && <div className="gc-auth-error">{error}</div>}
              <div className="gc-form-field">
                <label htmlFor="new-password">New password</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={submitting}
                />
              </div>
              <div className="gc-form-field">
                <label htmlFor="confirm-password">Confirm new password</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={submitting}
                />
              </div>
              <button
                type="submit"
                className="gc-btn gc-btn--primary"
                disabled={submitting}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {submitting ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </>
        )}

        <p className="gc-auth-card__footer">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
