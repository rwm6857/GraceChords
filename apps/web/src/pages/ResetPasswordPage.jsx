import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authErrorKey, PASSWORD_POLICY, validatePasswordStrength } from '@gracechords/core'
import { clearRecoverySession, isRecoverySession, supabase } from '../lib/supabase'
import PasswordStrengthPopover from '../components/auth/PasswordStrengthPopover'
import '../styles/auth.css'

// Set a new password from a recovery email link. ONLY a recovery session may use
// this page: the link is the proof of identity here. A user who is simply
// signed in is sent to Profile → Security, which asks for the current password.
export default function ResetPasswordPage() {
  const { t } = useTranslation('auth')
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
    let cancelled = false
    // getSession() waits for the client to finish reading the link's tokens
    // from the URL, so by the time it resolves the recovery flag is settled.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      if (session && isRecoverySession()) setSessionState('valid')
      else if (session) navigate('/profile#security', { replace: true })
      else setSessionState('invalid')
    })
    return () => { cancelled = true }
  }, [navigate])

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newPasswordFocused, setNewPasswordFocused] = useState(false)
  const pwBlurTimer = useRef(null)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const weak = validatePasswordStrength(newPassword)
    if (weak) {
      setError(t(weak, { min: PASSWORD_POLICY.minLength }))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('errors.passwordMismatch'))
      return
    }

    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      console.error('[auth] password reset failed:', updateError)
      setError(t(authErrorKey(updateError), { min: PASSWORD_POLICY.minLength }))
      setSubmitting(false)
      return
    }

    clearRecoverySession()
    // Whoever had the old password may still hold a session; end every other one.
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' })
    if (signOutError) console.error('[auth] signing other sessions out failed:', signOutError)
    setSuccess(true)
    setTimeout(() => navigate('/', { replace: true }), 2000)
  }

  if (sessionState === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--gc-text-secondary)' }}>{t('resetPasswordPage.verifying')}</p>
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
            <h1 className="gc-auth-card__title">{t('resetPasswordPage.expiredTitle')}</h1>
            <p className="gc-auth-card__subtitle" style={{ marginBottom: 0 }}>
              {t('resetPasswordPage.expiredMessage')}{' '}
              <Link to="/forgot-password">{t('resetPasswordPage.requestNew')}</Link>
            </p>
          </>
        ) : success ? (
          <>
            <h1 className="gc-auth-card__title">{t('resetPasswordPage.successTitle')}</h1>
            <p className="gc-auth-card__subtitle" style={{ marginBottom: 0 }}>
              {t('resetPasswordPage.successMessage')}
            </p>
          </>
        ) : (
          <>
            <h1 className="gc-auth-card__title">{t('resetPasswordPage.title')}</h1>
            <p className="gc-auth-card__subtitle">{t('resetPasswordPage.subtitle')}</p>

            <form onSubmit={handleSubmit} className="gc-auth-form">
              {error && <div className="gc-auth-error" role="alert">{error}</div>}
              <div className="gc-form-field gc-pw-field-wrapper">
                <label htmlFor="new-password">{t('security.newPassword')}</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={submitting}
                  onFocus={() => {
                    clearTimeout(pwBlurTimer.current)
                    setNewPasswordFocused(true)
                  }}
                  onBlur={() => {
                    pwBlurTimer.current = setTimeout(() => setNewPasswordFocused(false), 150)
                  }}
                />
                {newPasswordFocused && <PasswordStrengthPopover password={newPassword} />}
              </div>
              <div className="gc-form-field">
                <label htmlFor="confirm-password">{t('security.confirmPassword')}</label>
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
                {submitting ? t('security.saving') : t('resetPasswordPage.submit')}
              </button>
            </form>
          </>
        )}

        <p className="gc-auth-card__footer">
          <Link to="/login">{t('backToSignIn')}</Link>
        </p>
      </div>
    </div>
  )
}
