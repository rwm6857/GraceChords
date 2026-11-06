import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LINKABLE_PROVIDERS,
  PASSWORD_POLICY,
  authErrorKey,
  canUnlink,
  changePassword,
  findIdentity,
  hasPassword,
  identityEmail,
  requestReauthentication,
  setPassword,
} from '@gracechords/core'
import { supabase } from '../../lib/supabase'
import { oauthRedirectUrl, rememberPostAuthRedirect } from '../../lib/postAuthRedirect'
import PasswordStrengthPopover from '../auth/PasswordStrengthPopover'
import { AppleLogo, GoogleLogo } from '../Icons'
import '../../styles/auth.css'

const PROVIDER_LOGOS = { apple: AppleLogo, google: GoogleLogo }

// Profile → Security: change or set a password, and manage which providers can
// sign in to this account. Shares its logic with the mobile Account screen via
// @gracechords/core.
export default function SecuritySection({ user }) {
  const { t } = useTranslation('auth')
  return (
    <section id="security" className="gc-profile-section">
      <h2>{t('security.title')}</h2>
      <PasswordPanel user={user} />
      <SignInMethodsPanel user={user} />
    </section>
  )
}

function PasswordField({ id, label, value, onChange, autoComplete, disabled, withStrength }) {
  const [focused, setFocused] = useState(false)
  const blurTimer = useRef(null)
  useEffect(() => () => clearTimeout(blurTimer.current), [])
  return (
    <div className={`gc-form-field${withStrength ? ' gc-pw-field-wrapper' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="password"
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        required
        onFocus={() => { clearTimeout(blurTimer.current); setFocused(true) }}
        onBlur={() => { blurTimer.current = setTimeout(() => setFocused(false), 150) }}
      />
      {withStrength && focused && <PasswordStrengthPopover password={value} />}
    </div>
  )
}

function PasswordPanel({ user }) {
  const { t } = useTranslation('auth')
  const canChange = hasPassword(user)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [awaitingCode, setAwaitingCode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const showError = key => setError(t(key, { min: PASSWORD_POLICY.minLength }))

  function reset() {
    setCurrent(''); setNext(''); setConfirm(''); setCode(''); setAwaitingCode(false)
  }

  async function sendCode() {
    setError(null)
    const res = await requestReauthentication(supabase)
    if (!res.ok) { showError(res.error); return false }
    setAwaitingCode(true)
    setNotice(t('security.codeSent', { email: user.email }))
    return true
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (canChange) {
        const res = await changePassword(supabase, {
          email: user.email,
          currentPassword: current,
          newPassword: next,
          confirmPassword: confirm,
        })
        if (!res.ok) { showError(res.error); return }
        reset()
        setNotice(t('security.passwordChanged'))
        return
      }

      const res = await setPassword(supabase, {
        newPassword: next,
        confirmPassword: confirm,
        nonce: awaitingCode ? code : undefined,
      })
      if (res.needsReauth) { await sendCode(); return }
      if (!res.ok) { showError(res.error); return }
      reset()
      setNotice(t('security.passwordSet', { email: user.email }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="gc-security-panel" onSubmit={onSubmit}>
      <h3 className="gc-security-panel__title">{t('security.passwordHeading')}</h3>
      <p className="gc-security-panel__hint">
        {canChange ? t('security.changeIntro') : t('security.setIntro', { email: user.email })}
      </p>
      {error && <div className="gc-auth-error" role="alert">{error}</div>}
      {notice && <div className="gc-security-notice" role="status">{notice}</div>}

      {canChange && (
        <PasswordField
          id="security-current-password"
          label={t('security.currentPassword')}
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          disabled={busy}
        />
      )}
      <PasswordField
        id="security-new-password"
        label={t('security.newPassword')}
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        disabled={busy || awaitingCode}
        withStrength
      />
      <PasswordField
        id="security-confirm-password"
        label={t('security.confirmPassword')}
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        disabled={busy || awaitingCode}
      />

      {awaitingCode && (
        <div className="gc-form-field">
          <label htmlFor="security-code">{t('security.code')}</label>
          <input
            id="security-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={e => setCode(e.target.value)}
            disabled={busy}
            required
          />
        </div>
      )}

      <div className="gc-security-panel__actions">
        <button type="submit" className="gc-btn gc-btn--primary" disabled={busy}>
          {busy
            ? t('security.saving')
            : canChange ? t('security.changeSubmit') : t('security.setSubmit')}
        </button>
        {awaitingCode && (
          <button type="button" className="gc-btn gc-btn--ghost" onClick={sendCode} disabled={busy}>
            {t('security.resendCode')}
          </button>
        )}
      </div>
    </form>
  )
}

function SignInMethodsPanel({ user }) {
  const { t } = useTranslation('auth')
  const [identities, setIdentities] = useState(user.identities || [])
  const [busy, setBusy] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    const { data, error: loadError } = await supabase.auth.getUserIdentities()
    if (loadError) console.error('[auth] getUserIdentities failed:', loadError)
    else setIdentities(data?.identities || [])
  }, [])

  useEffect(() => { reload() }, [reload])

  async function connect(provider) {
    setError(null)
    setBusy(provider)
    rememberPostAuthRedirect('/profile#security')
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: oauthRedirectUrl() },
    })
    // On success the browser is already on its way to the provider.
    if (linkError) {
      console.error(`[auth] linking ${provider} failed:`, linkError)
      setError(t(authErrorKey(linkError)))
      setBusy(null)
    }
  }

  async function disconnect(provider) {
    const identity = findIdentity(identities, provider)
    if (!identity) return
    setError(null)
    setBusy(provider)
    const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity)
    if (unlinkError) {
      console.error(`[auth] unlinking ${provider} failed:`, unlinkError)
      setError(t(authErrorKey(unlinkError)))
    } else {
      // Pull the updated identities into the stored session as well.
      await supabase.auth.refreshSession()
      await reload()
    }
    setConfirming(null)
    setBusy(null)
  }

  const unlinkable = canUnlink(identities)

  return (
    <div className="gc-security-panel">
      <h3 className="gc-security-panel__title">{t('security.methodsHeading')}</h3>
      <p className="gc-security-panel__hint">{t('security.methodsIntro')}</p>
      {error && <div className="gc-auth-error" role="alert">{error}</div>}
      <ul className="gc-signin-methods">
        {LINKABLE_PROVIDERS.map(provider => {
          const identity = findIdentity(identities, provider)
          const Logo = PROVIDER_LOGOS[provider]
          const name = t(`security.providers.${provider}`)
          return (
            <li key={provider} className="gc-signin-method">
              <span className="gc-signin-method__logo"><Logo /></span>
              <span className="gc-signin-method__info">
                <span className="gc-signin-method__name">{name}</span>
                <span className="gc-signin-method__detail">
                  {identity
                    ? identityEmail(identity) || t('security.connected')
                    : t('security.notConnected')}
                </span>
              </span>
              {confirming === provider ? (
                <span className="gc-signin-method__actions">
                  <button
                    type="button"
                    className="gc-btn gc-btn--danger gc-btn--sm"
                    onClick={() => disconnect(provider)}
                    disabled={busy !== null}
                  >
                    {t('security.confirmDisconnect', { provider: name })}
                  </button>
                  <button
                    type="button"
                    className="gc-btn gc-btn--ghost gc-btn--sm"
                    onClick={() => setConfirming(null)}
                    disabled={busy !== null}
                  >
                    {t('security.cancel')}
                  </button>
                </span>
              ) : identity ? (
                unlinkable && (
                  <button
                    type="button"
                    className="gc-btn gc-btn--ghost gc-btn--sm"
                    onClick={() => setConfirming(provider)}
                    disabled={busy !== null}
                  >
                    {t('security.disconnect')}
                  </button>
                )
              ) : (
                <button
                  type="button"
                  className="gc-btn gc-btn--secondary gc-btn--sm"
                  onClick={() => connect(provider)}
                  disabled={busy !== null}
                >
                  {t('security.connect')}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {identities.length > 0 && !unlinkable && (
        <p className="gc-security-panel__hint">{t('security.lastMethodNote')}</p>
      )}
    </div>
  )
}
