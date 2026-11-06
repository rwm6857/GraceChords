import React, { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authErrorKey } from '@gracechords/core'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import SocialSignInButtons from '../components/auth/SocialSignInButtons'
import '../styles/auth.css'

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

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(t(authErrorKey(error)))
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
        <SocialSignInButtons redirectTo={redirectTo} />

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
