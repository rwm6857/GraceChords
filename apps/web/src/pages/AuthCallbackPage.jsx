import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authErrorKey } from '@gracechords/core'
import { supabase } from '../lib/supabase'
import { consumePostAuthRedirect, readCallbackError } from '../lib/postAuthRedirect'
import '../styles/auth.css'

export default function AuthCallbackPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const [failure, setFailure] = useState(null)

  useEffect(() => {
    let cancelled = false
    const callbackError = readCallbackError()

    // The public.users row is created by the handle_new_user() trigger on
    // auth.users, which fires on every INSERT including OAuth sign-ups.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      const destination = consumePostAuthRedirect()

      if (callbackError) {
        console.error('[auth] OAuth callback error:', callbackError.code, callbackError.description)
        const key = authErrorKey({ code: callbackError.code })
        setFailure({
          message: t(key === 'errors.generic' ? 'callback.failedMessage' : key),
          // A failed link leaves the existing session in place: send the user
          // back where they started rather than to the sign-in card.
          backTo: session ? destination : '/login',
        })
        return
      }

      navigate(session ? destination : '/login', { replace: true })
    })

    return () => { cancelled = true }
  }, [navigate, t])

  if (failure) {
    return (
      <div className="gc-auth-page">
        <div className="gc-auth-card">
          <h1 className="gc-auth-card__title">{t('callback.failedTitle')}</h1>
          <div className="gc-auth-error" role="alert">{failure.message}</div>
          <p className="gc-auth-card__footer">
            <Link to={failure.backTo} replace>
              {failure.backTo === '/login' ? t('backToSignIn') : t('callback.continue')}
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--gc-text-secondary)' }}>{t('callback.working')}</p>
    </div>
  )
}
