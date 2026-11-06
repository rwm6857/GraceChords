import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authErrorKey } from '@gracechords/core'
import { supabase } from '../lib/supabase'
import '../styles/auth.css'

const RESEND_COOLDOWN_SECONDS = 60

// Only failures that say nothing about the address are shown. Anything else is
// treated as sent, so this form never reveals whether an account exists.
const SURFACED_ERRORS = new Set(['errors.rateLimited', 'errors.network'])

export default function ForgotPasswordPage() {
  const { t } = useTranslation('auth')

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

  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function sendLink(e) {
    e?.preventDefault()
    if (cooldown > 0) return
    setError(null)
    setSubmitting(true)
    const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${siteUrl}/reset-password`,
    })
    setSubmitting(false)
    if (resetError) {
      const key = authErrorKey(resetError)
      if (SURFACED_ERRORS.has(key)) {
        setError(t(key))
        return
      }
      console.error('[auth] resetPasswordForEmail failed:', resetError)
    }
    setSubmitted(true)
    setCooldown(RESEND_COOLDOWN_SECONDS)
  }

  return (
    <div className="gc-auth-page">
      <div className="gc-auth-card">
        <img
          src={isDark ? '/gc-brand-wide-dark.svg' : '/gc-brand-wide-light.svg'}
          alt="GraceChords"
          className="gc-auth-card__wordmark"
        />

        {submitted ? (
          <>
            <h1 className="gc-auth-card__title">{t('checkYourEmail')}</h1>
            <p className="gc-auth-card__subtitle">{t('forgotPasswordPage.sentMessage')}</p>
            {error && <div className="gc-auth-error" role="alert">{error}</div>}
            <button
              type="button"
              className="gc-btn gc-btn--secondary"
              onClick={sendLink}
              disabled={submitting || cooldown > 0}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {cooldown > 0
                ? t('forgotPasswordPage.cooldown', { seconds: cooldown })
                : t('forgotPasswordPage.resend')}
            </button>
          </>
        ) : (
          <>
            <h1 className="gc-auth-card__title">{t('forgotPasswordPage.title')}</h1>
            <p className="gc-auth-card__subtitle">{t('forgotPasswordPage.subtitle')}</p>

            <form onSubmit={sendLink} className="gc-auth-form">
              {error && <div className="gc-auth-error" role="alert">{error}</div>}
              <div className="gc-form-field">
                <label htmlFor="email">{t('email')}</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={submitting}
                />
              </div>
              <button
                type="submit"
                className="gc-btn gc-btn--primary"
                disabled={submitting}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {submitting ? t('forgotPasswordPage.sending') : t('forgotPasswordPage.submit')}
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
