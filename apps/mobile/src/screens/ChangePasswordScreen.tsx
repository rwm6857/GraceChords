import { useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Screen from '../components/Screen'
import TextField from '../components/TextField'
import SymbolIcon from '../components/SymbolIcon'
import GlassSurface from '../components/GlassSurface'
import ConstrainedContent from '../components/ConstrainedContent'
import { useTheme } from '../theme/ThemeProvider'
import { supabase } from '../lib/supabase'
import { useCurrentUser } from '../lib/currentUser'
import {
  changePassword,
  hasPassword,
  requestReauthentication,
  setPassword,
} from '../lib/passwordChange'
import { MIN_PASSWORD_LENGTH } from '../lib/authValidation'

// Account → Change password, or Set a password for an account that only signs
// in with Apple / Google. The orchestration lives in @gracechords/core (via
// src/lib/passwordChange.ts) so it unit-tests headless and is shared with the
// web Profile → Security section; this screen is the form and the error surface.
//
// "Set" mode has no current password to prove, so a session older than 24h is
// asked for a code emailed by reauthenticate() ("Secure password change" is on).
//
// NOTHING on this screen may be logged or reported: no password values in
// console output, breadcrumbs or analytics, and no analytics events at all.
// Errors are rendered inline and are never destructive — a wrong current
// password leaves the user signed in and the form filled.

export default function ChangePasswordScreen() {
  const t = useTheme()
  const { t: tx } = useTranslation(['auth', 'profile', 'common'])
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const user = useCurrentUser()

  // Fixed at mount: setting a password flips hasPassword(), and the form must
  // not switch modes under the success alert.
  const [mode] = useState<'change' | 'set'>(() => (hasPassword(user) ? 'change' : 'set'))
  const [code, setCode] = useState('')
  const [awaitingCode, setAwaitingCode] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [barH, setBarH] = useState(0)

  async function sendCode() {
    setError(null)
    const res = await requestReauthentication(supabase)
    if (!res.ok) {
      setError(res.error ?? 'errors.generic')
      return
    }
    setAwaitingCode(true)
    setNotice(tx('setPassword.codeSent', { email: user?.email ?? '' }))
  }

  async function onSubmitSet() {
    setBusy(true)
    try {
      const result = await setPassword(supabase, {
        newPassword: next,
        confirmPassword: confirm,
        nonce: awaitingCode ? code : undefined,
      })
      if (result.needsReauth) {
        await sendCode()
        return
      }
      if (!result.ok) {
        setError(result.error ?? 'errors.generic')
        return
      }
      Alert.alert(
        tx('setPassword.successTitle'),
        tx('setPassword.successMessage', { email: user?.email ?? '' }),
        [{ text: tx('common:ok'), onPress: () => router.back() }],
      )
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit() {
    if (busy) return
    setError(null)
    const email = user?.email
    if (!email) {
      setError('errors.generic')
      return
    }
    if (mode === 'set') {
      await onSubmitSet()
      return
    }
    setBusy(true)
    try {
      const result = await changePassword(supabase, {
        email,
        currentPassword: current,
        newPassword: next,
        confirmPassword: confirm,
      })
      if (!result.ok) {
        setError(result.error ?? 'errors.generic')
        return
      }
      if (!result.othersSignedOut) {
        // The password did change; only the other-device sign-out failed. Worth
        // a line in the log, never worth telling the user the change failed.
        console.error('[ChangePassword] password changed but signing out other sessions failed')
      }
      Alert.alert(tx('changePassword.successTitle'), tx('changePassword.successMessage'), [
        { text: tx('common:ok'), onPress: () => router.back() },
      ])
    } finally {
      setBusy(false)
    }
  }

  const submitLabel = mode === 'set' ? tx('setPassword.submit') : tx('changePassword.submit')

  return (
    <Screen edges={['left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: t.spacing.lg,
            paddingTop: barH + t.spacing.sm,
            paddingBottom: insets.bottom + t.spacing.xxl,
          }}
        >
          <Text
            style={{
              fontSize: t.typography.largeTitle.fontSize,
              fontWeight: t.typography.largeTitle.fontWeight,
              letterSpacing: t.typography.largeTitle.letterSpacing,
              color: t.colors.ink,
              paddingHorizontal: t.spacing.xs,
              paddingBottom: t.spacing.md,
            }}
          >
            {mode === 'set' ? tx('setPassword.title') : tx('changePassword.title')}
          </Text>

          <ConstrainedContent tier="form">
            <View style={{ gap: t.spacing.lg }}>
              {/* autoComplete/textContentType are set so the OS offers the SAVED
                  password for the current field and a NEW one for the others —
                  never autofilling the current password into the new fields. */}
              {mode === 'set' ? (
                <Text style={{ fontSize: 14, lineHeight: 19, color: t.colors.sec }}>
                  {tx('setPassword.intro', { email: user?.email ?? '' })}
                </Text>
              ) : (
                <TextField
                  label={tx('changePassword.current')}
                  icon="lock"
                  value={current}
                  onChangeText={setCurrent}
                  secureTextEntry
                  autoComplete="current-password"
                  textContentType="password"
                />
              )}
              <TextField
                label={tx('changePassword.new')}
                icon="lock"
                value={next}
                onChangeText={setNext}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                helperText={tx('passwordRequirements', { min: MIN_PASSWORD_LENGTH })}
              />
              <TextField
                label={tx('changePassword.confirm')}
                icon="lock"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
              />

              {awaitingCode ? (
                <TextField
                  label={tx('setPassword.code')}
                  icon="envelope"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                />
              ) : null}

              {notice && !error ? (
                <Text accessibilityLiveRegion="polite" style={{ fontSize: 13.5, color: t.colors.sec }}>
                  {notice}
                </Text>
              ) : null}

              {error ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={{ fontSize: 13.5, color: t.colors.danger }}
                >
                  {tx(error, { min: MIN_PASSWORD_LENGTH })}
                </Text>
              ) : null}

              <Pressable
                onPress={() => void onSubmit()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={submitLabel}
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
                  {busy ? tx('pleaseWait') : submitLabel}
                </Text>
              </Pressable>

              {awaitingCode ? (
                <Pressable
                  onPress={() => void sendCode()}
                  disabled={busy}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: t.colors.textAccent }}>
                    {tx('setPassword.resendCode')}
                  </Text>
                </Pressable>
              ) : null}

              <Text style={{ fontSize: 12.5, lineHeight: 17, color: t.colors.sec }}>
                {tx('changePassword.otherDevicesNote')}
              </Text>
            </View>
          </ConstrainedContent>
        </ScrollView>
      </KeyboardAvoidingView>

      <GlassSurface
        fallbackColor={t.colors.bg}
        fallbackHairline
        onLayout={(e) => setBarH(e.nativeEvent.layout.height)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          paddingTop: insets.top,
          paddingHorizontal: t.spacing.md,
          paddingBottom: t.spacing.sm,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={tx('common:back')}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
        >
          <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
          <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.textAccent }}>
            {tx('profile:title')}
          </Text>
        </Pressable>
      </GlassSurface>
    </Screen>
  )
}
