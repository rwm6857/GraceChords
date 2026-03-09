import React, { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
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

  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [forgotSuccess, setForgotSuccess] = useState(false)
  const [forgotError, setForgotError] = useState(null)

  async function handleForgotPassword(e) {
    e.preventDefault()
    setForgotError(null)
    setForgotSubmitting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: window.location.origin + '/reset-password',
    })
    if (error) {
      setForgotError(error.message)
    } else {
      setForgotSuccess(true)
    }
    setForgotSubmitting(false)
  }

  useEffect(() => {
    if (!loading && isLoggedIn) navigate(redirectTo, { replace: true })
  }, [isLoggedIn, loading, navigate, redirectTo])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(friendlyError(error.message))
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
        <h1 className="gc-auth-card__title">Welcome back</h1>
        <p className="gc-auth-card__subtitle">Sign in to your account</p>

        <form onSubmit={handleSubmit} className="gc-auth-form">
          {error && <div className="gc-auth-error">{error}</div>}
          <div className="gc-form-field">
            <label htmlFor="email">Email</label>
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
              <label htmlFor="password">Password</label>
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
              <button
                type="button"
                onClick={() => {
                  setForgotOpen(o => !o)
                  setForgotSuccess(false)
                  setForgotError(null)
                  if (!forgotEmail) setForgotEmail(email)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--gc-primary)',
                  font: 'inherit',
                  fontSize: 'var(--gc-font-sub)',
                  cursor: 'pointer',
                  padding: 0,
                  fontWeight: 500,
                }}
              >
                Forgot password?
              </button>
            </div>
          </div>

          {forgotOpen && (
            <div style={{
              borderTop: '1px solid var(--gc-separator)',
              paddingTop: 'var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}>
              {forgotSuccess ? (
                <p style={{ margin: 0, fontSize: 'var(--gc-font-sub)', color: 'var(--gc-text-secondary)' }}>
                  Check your email for a password reset link.
                </p>
              ) : (
                <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {forgotError && <div className="gc-auth-error">{forgotError}</div>}
                  <div className="gc-form-field">
                    <label htmlFor="forgot-email">Email address</label>
                    <input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      required
                      autoComplete="email"
                      disabled={forgotSubmitting}
                    />
                  </div>
                  <button
                    type="submit"
                    className="gc-btn gc-btn--primary"
                    disabled={forgotSubmitting}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {forgotSubmitting ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>
              )}
            </div>
          )}

          <button
            type="submit"
            className="gc-btn gc-btn--primary"
            disabled={submitting}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="gc-auth-card__footer">
          Don't have an account?{' '}
          <Link to={`/signup${redirectTo !== '/' ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}

function friendlyError(msg) {
  if (!msg) return 'Something went wrong. Please try again.'
  const lower = msg.toLowerCase()
  if (lower.includes('invalid login') || lower.includes('invalid credentials'))
    return 'Incorrect email or password.'
  if (lower.includes('email not confirmed'))
    return 'Please check your email to confirm your account before signing in.'
  if (lower.includes('too many requests') || lower.includes('rate limit'))
    return 'Too many attempts. Please wait a moment and try again.'
  return 'Something went wrong. Please try again.'
}
