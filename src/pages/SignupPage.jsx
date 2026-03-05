import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import SpritePicker from '../components/ui/SpritePicker'
import { showToast } from '../utils/app/toast'

export default function SignupPage() {
  const { refreshProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = new URLSearchParams(location.search).get('redirect') || '/'

  const [isDark, setIsDark] = useState(
    () => document.documentElement.dataset.theme === 'dark'
  )
  React.useEffect(() => {
    const observer = new MutationObserver(() =>
      setIsDark(document.documentElement.dataset.theme === 'dark')
    )
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sprite, setSprite] = useState(null)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [signUpSuccess, setSignUpSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!sprite) { setError('Please choose an icon before creating your account.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setError(null)
    setSubmitting(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: displayName } },
    })

    if (signUpError) { setError(signUpError.message); setSubmitting(false); return }

    if (data.session) {
      const { error: profileError } = await supabase.from('users').update({
        display_name: displayName,
        preferences: { sprite },
      }).eq('id', data.session.user.id)
      if (profileError) console.error('Profile update after signup failed:', profileError)
      await refreshProfile()
      showToast('Welcome to GraceChords!')
      navigate(redirectTo, { replace: true })
    } else {
      setSignUpSuccess(true)
    }
    setSubmitting(false)
  }

  if (signUpSuccess) {
    return (
      <div className="gc-auth-page">
        <div className="gc-auth-card" style={{ maxWidth: 480 }}>
          <img
            src={isDark ? '/gc-brand-wide-dark.svg' : '/gc-brand-wide-light.svg'}
            alt="GraceChords"
            className="gc-auth-card__wordmark"
          />
          <div className="gc-signup-confirm">
            <div className="gc-signup-confirm__icon" aria-hidden="true">✉️</div>
            <h1 className="gc-auth-card__title">Check your email</h1>
            <p className="gc-signup-confirm__body">
              We sent a verification link to{' '}
              <strong className="gc-signup-confirm__email">{email}</strong>.
              Click the link to activate your account, then come back to sign in.
            </p>
            <p className="gc-signup-confirm__note">
              Didn't receive it? Check your spam folder or wait a moment and try again.
            </p>
          </div>
          <p className="gc-auth-card__footer">
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="gc-auth-page">
      <div className="gc-auth-card" style={{ maxWidth: 480 }}>
        <img
          src={isDark ? '/gc-brand-wide-dark.svg' : '/gc-brand-wide-light.svg'}
          alt="GraceChords"
          className="gc-auth-card__wordmark"
        />
        <h1 className="gc-auth-card__title">Join GraceChords</h1>
        <p className="gc-auth-card__subtitle">Create your account</p>

        <form onSubmit={handleSubmit} className="gc-auth-form">
          {error && <div className="gc-auth-error">{error}</div>}
          <div className="gc-form-field">
            <label htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
              disabled={submitting}
              placeholder="Your name"
            />
          </div>
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
          <div className="gc-form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              disabled={submitting}
              placeholder="At least 8 characters"
            />
          </div>
          <div className="gc-form-field">
            <label>Choose your icon</label>
            <p style={{ fontSize: 13, color: 'var(--gc-text-secondary)', margin: '2px 0 8px' }}>
              You can change this later
            </p>
            <SpritePicker value={sprite} onChange={setSprite} />
          </div>
          <button
            type="submit"
            className="gc-btn gc-btn--primary"
            disabled={submitting || !sprite}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="gc-auth-card__footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
