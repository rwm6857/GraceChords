import React, { useState, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { authErrorKey, validatePasswordStrength, PASSWORD_POLICY } from '@gracechords/core'
import { supabase } from '../lib/supabase'
import { oauthRedirectUrl } from '../lib/postAuthRedirect'
import SocialSignInButtons from '../components/auth/SocialSignInButtons'
import { useAuth } from '../hooks/useAuth'
import SpritePicker from '../components/ui/SpritePicker'
import { showToast } from '../utils/app/toast'
import PasswordStrengthPopover from '../components/auth/PasswordStrengthPopover'
import '../styles/auth.css'

export default function SignupPage() {
  const { t } = useTranslation(['auth', 'common'])
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

  async function handleSubmit(e) {
    e.preventDefault()
    if (!sprite) { setError(t('errors.chooseIcon')); return }
    const weak = validatePasswordStrength(password)
    if (weak) { setError(t(weak, { min: PASSWORD_POLICY.minLength })); return }
    setError(null)
    setIsDuplicateEmail(false)
    setSubmitting(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: displayName }, emailRedirectTo: oauthRedirectUrl() },
    })

    if (signUpError) {
      console.error('[auth] sign-up failed:', signUpError)
      setError(t(authErrorKey(signUpError), { min: PASSWORD_POLICY.minLength }))
      setSubmitting(false)
      return
    }

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
      showToast(t('welcomeToast'))
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
            <h1 className="gc-auth-card__title">{t('checkYourEmail')}</h1>
            <p className="gc-signup-confirm__body">
              <Trans
                i18nKey="auth:verificationSent"
                values={{ email }}
                components={{ strong: <strong className="gc-signup-confirm__email" /> }}
              />
            </p>
            <p className="gc-signup-confirm__note">
              {t('verificationResend')}
            </p>
          </div>
          <p className="gc-auth-card__footer">
            <Link to="/login">{t('backToSignIn')}</Link>
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
        <h1 className="gc-auth-card__title">{t('joinGraceChords')}</h1>
        <p className="gc-auth-card__subtitle">{t('createYourAccount')}</p>

        <form onSubmit={handleSubmit} className="gc-auth-form">
          {isDuplicateEmail && (
            <div className="gc-auth-error">
              {t('duplicateEmail')}{' '}
              <Link to="/login">{t('signInInstead')}</Link>
            </div>
          )}
          {error && <div className="gc-auth-error">{error}</div>}
          <div className="gc-form-field">
            <label htmlFor="displayName">{t('displayName')}</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
              disabled={submitting}
              placeholder={t('displayNamePlaceholder')}
            />
          </div>
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
          <div className="gc-form-field gc-pw-field-wrapper">
            <label htmlFor="password">{t('password')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={PASSWORD_POLICY.minLength}
              disabled={submitting}
              placeholder={t('passwordPlaceholder')}
              onFocus={() => {
                clearTimeout(pwBlurTimer.current)
                setPasswordFocused(true)
              }}
              onBlur={() => {
                pwBlurTimer.current = setTimeout(() => setPasswordFocused(false), 150)
              }}
            />
            {passwordFocused && <PasswordStrengthPopover password={password} />}
          </div>
          <div className="gc-form-field">
            <label>{t('chooseYourIcon')}</label>
            <p style={{ fontSize: 13, color: 'var(--gc-text-secondary)', margin: '2px 0 8px' }}>
              {t('chooseIconHelper')}
            </p>
            <SpritePicker value={sprite} onChange={setSprite} />
          </div>
          <button
            type="submit"
            className="gc-btn gc-btn--primary"
            disabled={submitting || !sprite}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {submitting ? t('creatingAccount') : t('createAccount')}
          </button>
        </form>

        <div className="gc-auth-divider">{t('common:or')}</div>
        <SocialSignInButtons redirectTo={redirectTo} />

        <p className="gc-auth-card__footer">
          {t('alreadyHaveAccount')} <Link to="/login">{t('signIn')}</Link>
        </p>
      </div>
    </div>
  )
}
