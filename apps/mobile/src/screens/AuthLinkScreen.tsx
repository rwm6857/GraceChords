import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import Button from '../components/Button'
import ConstrainedContent from '../components/ConstrainedContent'
import SymbolIcon from '../components/SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'
import { supabase } from '../lib/supabase'
import { takePendingAuthLink } from '../lib/authLink'
import { adoptAuthLinkSession } from '../lib/passwordReset'
import { markSessionError } from '../lib/sessionError'

// The landing screen for an auth email opened on this device. It is a transit
// screen: it turns the link's tokens into a session and moves on. Two links
// arrive here, from the two paths the app claims —
//
//   /app/reset-password   -> sign in with the recovery token, then the new
//                            password form
//   /app/auth/callback    -> sign in and drop the user straight into the app,
//                            which is the whole of S-01: confirming your email
//                            from the phone now signs you in instead of leaving
//                            you at a browser to go back and sign in by hand
//
// The tokens never reach this file as route params — app/+native-intent.tsx
// stashes them in src/lib/authLink.ts and this reads them once. See that file
// for why the implicit flow is used rather than PKCE.
//
// NOTHING here may be logged: these are live session tokens.

export default function AuthLinkScreen() {
  const t = useTheme()
  const { t: tx } = useTranslation(['auth', 'common'])
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  // The link is consumed once. StrictMode/remount must not re-run the exchange
  // against a token that has already been spent.
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const link = takePendingAuthLink()
    if (!link) {
      // Nothing to consume — a direct navigation, or a re-mount after the link
      // was already used. Neither is an error worth a screen.
      router.replace('/')
      return
    }

    void (async () => {
      const result = await adoptAuthLinkSession(supabase, link)
      if (!result.ok) {
        markSessionError('AuthLinkScreen')
        setError(result.error ?? 'errors.generic')
        return
      }
      // The root layout's auth gate sees the new session on its next pass; go
      // straight to the destination this link was for.
      router.replace(link.kind === 'recovery' ? '/reset-password' : '/')
    })()
  }, [router])

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.spacing.lg }}>
      <ConstrainedContent tier="form">
        {error ? (
          <View style={{ alignItems: 'center', gap: t.spacing.lg }}>
            <SymbolIcon name="exclamationmark.triangle.fill" size={34} color={t.colors.sec} />
            <Text
              style={{
                fontSize: 16,
                lineHeight: 23,
                textAlign: 'center',
                color: t.colors.ink,
              }}
            >
              {tx(error)}
            </Text>
            {/* An expired link is not retryable, so the only useful action is
                asking for a fresh one. */}
            <Button title={tx('authLink.requestNew')} onPress={() => router.replace('/forgot-password')} />
            <Button
              title={tx('authLink.backToSignIn')}
              variant="secondary"
              onPress={() => router.replace('/login')}
            />
          </View>
        ) : (
          <View style={{ alignItems: 'center', gap: t.spacing.md }}>
            <ActivityIndicator color={t.colors.accent} />
            <Text style={{ fontSize: 15, color: t.colors.sec }}>{tx('authLink.working')}</Text>
          </View>
        )}
      </ConstrainedContent>
    </View>
  )
}
