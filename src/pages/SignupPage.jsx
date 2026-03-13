import React, { useState, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import SpritePicker from '../components/ui/SpritePicker'
import { showToast } from '../utils/app/toast'

const PW_REQUIREMENTS = [
  { key: 'minLength', label: 'At least 8 characters' },
  { key: 'hasLower',  label: 'One lowercase letter' },
  { key: 'hasUpper',  label: 'One uppercase letter' },
  { key: 'hasNumber', label: 'One number' },
  { key: 'hasSpecial', label: 'One special character' },
]

function checkPassword(pw) {
  return {
    minLength: pw.length >= 8,
    hasLower:  /[a-z]/.test(pw),
    hasUpper:  /[A-Z]/.test(pw),
    hasNumber: /[0-9]/.test(pw),
    hasSpecial: /[^A-Za-z0-9]/.test(pw),
  }
}

function CircleIcon({ filled }) {
  return filled ? (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <circle cx="5" cy="5" r="5" fill="currentColor" />
    </svg>
  ) : (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
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
  const [passwordFocused, setPasswordFocused] = useState(false)
  const pwBlurTimer = useRef(null)
  const [sprite, setSprite] = useState(null)
  const [error, setError] = useState(null)
  const [isDuplicateEmail, setIsDuplicateEmail] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [signUpSuccess, setSignUpSuccess] = useState(false)

  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/auth/callback' },
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!sprite) { setError('Please choose an icon before creating your account.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setError(null)
    setIsDuplicateEmail(false)
    setSubmitting(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: displayName } },
    })

    if (signUpError) { setError(signUpError.message); setSubmitting(false); return }

    if (data?.user && data.user.identities && data.user.identities.length === 0) {
      setIsDuplicateEmail(true)
      setSubmitting(false)
      return
    }

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
          {isDuplicateEmail && (
            <div className="gc-auth-error">
              An account with this email already exists.{' '}
              <Link to="/login">Sign in instead</Link>
            </div>
          )}
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
          <div className="gc-form-field gc-pw-field-wrapper">
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
              onFocus={() => {
                clearTimeout(pwBlurTimer.current)
                setPasswordFocused(true)
              }}
              onBlur={() => {
                pwBlurTimer.current = setTimeout(() => setPasswordFocused(false), 150)
              }}
            />
            {passwordFocused && (() => {
              const checks = checkPassword(password)
              return (
                <div className="gc-pw-strength-popover" role="status" aria-label="Password requirements">
                  <p className="gc-pw-strength-popover__title">Password requirements</p>
                  <ul className="gc-pw-strength-popover__list">
                    {PW_REQUIREMENTS.map(({ key, label }) => (
                      <li key={key} className={`gc-pw-strength-req${checks[key] ? ' gc-pw-strength-req--met' : ''}`}>
                        <CircleIcon filled={checks[key]} />
                        {label}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })()}
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

        <div className="gc-auth-divider">or</div>
        <button
          type="button"
          className="gc-btn gc-btn--secondary"
          onClick={handleGoogleSignIn}
          style={{ width: '100%', justifyContent: 'center', gap: '10px' }}
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <p className="gc-auth-card__footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
