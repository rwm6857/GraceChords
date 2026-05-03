import React, { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { t } = useTranslation(['auth', 'common'])
  const { isLoggedIn, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = new URLSearchParams(location.search).get('redirect') || '/'

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
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)


  useEffect(() => {
    if (!loading && isLoggedIn) navigate(redirectTo, { replace: true })
  }, [isLoggedIn, loading, navigate, redirectTo])

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/auth/callback' },
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(friendlyError(error.message, t))
      setSubmitting(false)
    } else {
      navigate(redirectTo, { replace: true })
    }
  }

  if (loading) return null

  return (
    <div className="gc-auth-page">
      <div className="gc-auth-card">
        <img
          src={isDark ? '/gc-brand-wide-dark.svg' : '/gc-brand-wide-light.svg'}
          alt="GraceChords"
          className="gc-auth-card__wordmark"
        />
        <h1 className="gc-auth-card__title">{t('welcomeBack')}</h1>
        <p className="gc-auth-card__subtitle">{t('signInToAccount')}</p>

        <form onSubmit={handleSubmit} className="gc-auth-form">
          {error && <div className="gc-auth-error">{error}</div>}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div className="gc-form-field">
              <label htmlFor="password">{t('password')}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={submitting}
              />
            </div>
            <div style={{ textAlign: 'right' }}>
              <Link
                to="/forgot-password"
                style={{
                  color: 'var(--gc-primary)',
                  fontSize: 'var(--gc-font-sub)',
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                {t('forgotPassword')}
              </Link>
            </div>
          </div>

          <button
            type="submit"
            className="gc-btn gc-btn--primary"
            disabled={submitting}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {submitting ? t('signingIn') : t('signIn')}
          </button>
        </form>

        <div className="gc-auth-divider">{t('common:or')}</div>
        <button
          type="button"
          className="gc-btn gc-btn--secondary"
          onClick={handleGoogleSignIn}
          style={{ width: '100%', justifyContent: 'center', gap: '10px' }}
        >
          <GoogleIcon />
          {t('common:continueWithGoogle')}
        </button>

        <p className="gc-auth-card__footer">
          {t('noAccountYet')}{' '}
          <Link to={`/signup${redirectTo !== '/' ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`}>
            {t('signUp')}
          </Link>
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" />
    </svg>
  )
}

function friendlyError(msg, t) {
  if (!msg) return t('errors.generic')
  const lower = msg.toLowerCase()
  if (lower.includes('invalid login') || lower.includes('invalid credentials'))
    return t('errors.invalidCredentials')
  if (lower.includes('email not confirmed'))
    return t('errors.emailNotConfirmed')
  if (lower.includes('too many requests') || lower.includes('rate limit'))
    return t('errors.tooManyRequests')
  return t('errors.generic')
}
