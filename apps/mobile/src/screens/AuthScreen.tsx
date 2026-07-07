import { useState } from 'react'
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as AppleAuthentication from 'expo-apple-authentication'
import { useRouter } from 'expo-router'
import { useTheme } from '../theme/ThemeProvider'
import TextField from '../components/TextField'
import SymbolIcon from '../components/SymbolIcon'
import { supabase } from '../lib/supabase'
import { validateSignIn, validateSignUp } from '../lib/authValidation'
import { appleSignIn, emailSignIn, emailSignUp, googleSignIn, type AuthResult } from '../lib/authFlows'
import { makeAppleDeps, makeGoogleDeps } from '../lib/authDeps'

// The auth screen per the design reference: one route, two modes (sign in /
// sign up) toggled in place, with native Google + Apple sign-in below the
// email form. Sign-in success needs no navigation — the root layout's auth
// gate redirects once the session lands. Sign-up advances to the sprite
// picker (/choose-icon) whether or not email confirmation is pending.

type Mode = 'signin' | 'signup'

export default function AuthScreen() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSignup = mode === 'signup'

  function switchMode() {
    setMode(isSignup ? 'signin' : 'signup')
    setError(null)
  }

  async function run(flow: () => Promise<AuthResult>): Promise<AuthResult> {
    setBusy(true)
    setError(null)
    try {
      const result = await flow()
      if (!result.ok && !result.canceled && result.error) setError(result.error)
      return result
    } catch {
      const result: AuthResult = { ok: false, error: 'Something went wrong. Please try again.' }
      setError(result.error!)
      return result
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit() {
    const invalid = isSignup
      ? validateSignUp({ fullName, email, password })
      : validateSignIn({ email, password })
    if (invalid) {
      setError(invalid)
      return
    }
    if (isSignup) {
      const result = await run(() => emailSignUp(supabase, { fullName, email, password }))
      // Advance to the picker in both cases: with a session (confirm-email
      // OFF) the pick writes immediately; without one it is stashed there.
      if (result.ok) router.replace('/choose-icon')
    } else {
      await run(() => emailSignIn(supabase, { email, password }))
    }
  }

  function onForgot() {
    // The design's "Forgot?" link is not wired to a reset flow this stage.
    Alert.alert('Reset password', 'Password reset is available on the web at gracechords.com.')
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: t.spacing.xl }}
      >
        {/* Hero band: the sanctioned atmospheric gradient (same tokens as Home). */}
        <LinearGradient
          colors={t.colors.heroGradient.colors}
          locations={t.colors.heroGradient.locations}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ alignItems: 'center', paddingTop: insets.top + t.spacing.xxl, paddingBottom: t.spacing.xl }}
        >
          <Image
            source={require('../../assets/icon.png')}
            accessibilityLabel="GraceChords"
            style={{ width: 64, height: 64, borderRadius: t.radii.card }}
          />
          <Text
            style={{
              marginTop: t.spacing.lg,
              fontSize: t.typography.largeTitle.fontSize,
              fontWeight: t.typography.largeTitle.fontWeight,
              letterSpacing: -0.4,
              color: t.colors.ink,
            }}
          >
            {isSignup ? 'Create your account' : 'Welcome back'}
          </Text>
        </LinearGradient>

        <View style={{ paddingHorizontal: t.spacing.lg, gap: t.spacing.lg }}>
          {isSignup ? (
            <TextField
              label="Full name"
              icon="person"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Alex Brown"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
            />
          ) : null}
          <TextField
            label="Email"
            icon="envelope"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
          />
          <TextField
            label="Password"
            icon="lock"
            value={password}
            onChangeText={setPassword}
            placeholder={isSignup ? 'At least 8 characters' : 'Enter your password'}
            secureTextEntry
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            textContentType={isSignup ? 'newPassword' : 'password'}
            labelAccessory={
              isSignup ? undefined : (
                <Pressable onPress={onForgot} hitSlop={8} accessibilityRole="button">
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: t.colors.textAccent }}>
                    Forgot?
                  </Text>
                </Pressable>
              )
            }
          />

          {error ? (
            <Text style={{ fontSize: 13.5, color: t.colors.danger }}>{error}</Text>
          ) : null}

          {/* Primary CTA: 50px accent bar with trailing chevron per the design
              (the Button primitive is 48px and text-only, so styled locally). */}
          <Pressable
            onPress={onSubmit}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => ({
              height: 50,
              borderRadius: t.radii.md,
              backgroundColor: t.colors.accent,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: t.spacing.sm,
              opacity: busy ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontSize: 16.5, fontWeight: '700', color: t.colors.onAccent }}>
              {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
            </Text>
            <SymbolIcon name="chevron.right" size={13} color={t.colors.onAccent} weight="semibold" />
          </Pressable>

          {/* Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <View style={{ flex: 1, height: 1, backgroundColor: t.colors.border }} />
            <Text style={{ fontSize: 12.5, color: t.colors.muted }}>or continue with</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: t.colors.border }} />
          </View>

          {/* Social stack */}
          <View style={{ gap: t.spacing.md }}>
            <Pressable
              onPress={() => run(() => googleSignIn(makeGoogleDeps()))}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => ({
                height: 50,
                borderRadius: t.radii.md,
                backgroundColor: t.colors.surface,
                borderWidth: 1,
                borderColor: t.colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: t.spacing.sm + 2,
                opacity: busy ? 0.5 : pressed ? 0.85 : 1,
              })}
            >
              {/* Brand logo, not a glyph — the sanctioned non-SF-Symbol exception. */}
              <Image
                source={require('../../assets/google-g.png')}
                style={{ width: 20, height: 20 }}
              />
              <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.ink }}>
                Continue with Google
              </Text>
            </Pressable>
            {Platform.OS === 'ios' ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={
                  t.mode === 'dark'
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={t.radii.md}
                style={{ height: 50, opacity: busy ? 0.5 : 1 }}
                onPress={() => {
                  if (!busy) run(() => appleSignIn(makeAppleDeps()))
                }}
              />
            ) : null}
          </View>

          {isSignup ? (
            <Text style={{ fontSize: 12.5, color: t.colors.muted, textAlign: 'center' }}>
              By continuing you agree to our{' '}
              <Text style={{ color: t.colors.textAccent }}>Terms</Text> &{' '}
              <Text style={{ color: t.colors.textAccent }}>Privacy Policy</Text>.
            </Text>
          ) : null}

          {/* Mode switch footer */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: t.spacing.xs,
              marginTop: t.spacing.sm,
            }}
          >
            <Text style={{ fontSize: 14.5, color: t.colors.sec }}>
              {isSignup ? 'Already have an account?' : "Don't have an account?"}
            </Text>
            <Pressable onPress={switchMode} hitSlop={8} accessibilityRole="button">
              <Text style={{ fontSize: 14.5, fontWeight: '700', color: t.colors.textAccent }}>
                {isSignup ? 'Sign in' : 'Create one'}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
