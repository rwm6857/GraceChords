import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authErrorKey } from '@gracechords/core'
import { supabase } from '../../lib/supabase'
import { oauthRedirectUrl, rememberPostAuthRedirect } from '../../lib/postAuthRedirect'
import { AppleLogo, GoogleLogo } from '../Icons'

// Google + Apple OAuth for the login and signup cards. Apple is offered in
// every browser, not just Safari: an iOS user who signed up with Apple has no
// other way into the same account on the web.
export default function SocialSignInButtons({ redirectTo = '/' }) {
  const { t } = useTranslation(['auth', 'common'])
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(null)

  async function start(provider) {
    setError(null)
    setPending(provider)
    rememberPostAuthRedirect(redirectTo)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: oauthRedirectUrl() },
    })
    // On success the browser is already navigating to the provider.
    if (oauthError) {
      console.error(`[auth] ${provider} sign-in failed to start:`, oauthError)
      setError(t(authErrorKey(oauthError)))
      setPending(null)
    }
  }

  return (
    <div className="gc-auth-social">
      {error && <div className="gc-auth-error" role="alert">{error}</div>}
      <button
        type="button"
        className="gc-btn gc-auth-apple-btn"
        onClick={() => start('apple')}
        disabled={pending !== null}
      >
        <AppleLogo />
        {t('common:continueWithApple')}
      </button>
      <button
        type="button"
        className="gc-btn gc-btn--secondary gc-auth-google-btn"
        onClick={() => start('google')}
        disabled={pending !== null}
      >
        <GoogleLogo />
        {t('common:continueWithGoogle')}
      </button>
    </div>
  )
}
