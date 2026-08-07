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
import { changePassword } from '../lib/passwordChange'
import { MIN_PASSWORD_LENGTH } from '../lib/authValidation'

// Account → Change password. The orchestration (verify → update → drop other
// sessions) lives in src/lib/passwordChange.ts so it unit-tests headless; this
// screen is the form and the error surface.
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

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [barH, setBarH] = useState(0)

  async function onSubmit() {
    if (busy) return
    setError(null)
    const email = user?.email
    if (!email) {
      setError('errors.generic')
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
            {tx('changePassword.title')}
          </Text>

          <ConstrainedContent tier="form">
            <View style={{ gap: t.spacing.lg }}>
              {/* autoComplete/textContentType are set so the OS offers the SAVED
                  password for the current field and a NEW one for the others —
                  never autofilling the current password into the new fields. */}
              <TextField
                label={tx('changePassword.current')}
                icon="lock"
                value={current}
                onChangeText={setCurrent}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
              />
              <TextField
                label={tx('changePassword.new')}
                icon="lock"
                value={next}
                onChangeText={setNext}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                helperText={tx('changePassword.requirements', { min: MIN_PASSWORD_LENGTH })}
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

              {error ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={{ fontSize: 13.5, color: t.colors.danger }}
                >
                  {tx(error, { defaultValue: error, min: MIN_PASSWORD_LENGTH })}
                </Text>
              ) : null}

              <Pressable
                onPress={() => void onSubmit()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={tx('changePassword.submit')}
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
                  {busy ? tx('pleaseWait') : tx('changePassword.submit')}
                </Text>
              </Pressable>

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
