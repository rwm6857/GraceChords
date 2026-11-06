import { useCallback, useState } from 'react'
import { Alert, Platform, Pressable, ScrollView, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { UserIdentity } from '@supabase/supabase-js'
import {
  LINKABLE_PROVIDERS,
  canUnlink,
  findIdentity,
  identityEmail,
  type LinkableProvider,
} from '@gracechords/core'
import Screen from '../components/Screen'
import Card from '../components/Card'
import ListRow from '../components/ListRow'
import SectionHeader from '../components/SectionHeader'
import SymbolIcon from '../components/SymbolIcon'
import GlassSurface from '../components/GlassSurface'
import { useTheme } from '../theme/ThemeProvider'
import { supabase } from '../lib/supabase'
import { useCurrentUser } from '../lib/currentUser'
import { appleLink, googleLink, unlinkSignInMethod, type AuthResult } from '../lib/authFlows'
import { makeAppleDeps, makeGoogleDeps } from '../lib/authDeps'

// Account → Sign-in methods. Supabase already links identities that share a
// verified email; this screen is for the rest — chiefly Apple "Hide My Email"
// accounts — and for disconnecting a provider. Apple can only be connected on
// iOS (the native sheet); Android shows its status and points to the web.

export default function SignInMethodsScreen() {
  const t = useTheme()
  const { t: tx } = useTranslation(['auth', 'profile', 'common'])
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const user = useCurrentUser()
  const [barH, setBarH] = useState(0)
  const [busy, setBusy] = useState<LinkableProvider | null>(null)
  const [identities, setIdentities] = useState<UserIdentity[]>(user?.identities ?? [])

  // The stored session can lag a link made on the web; ask the server on focus.
  const reload = useCallback(async () => {
    const { data, error } = await supabase.auth.getUserIdentities()
    if (error) console.error('[SignInMethods] getUserIdentities failed:', error.message)
    else setIdentities(data.identities)
  }, [])
  useFocusEffect(
    useCallback(() => {
      void reload()
    }, [reload]),
  )

  function report(result: AuthResult) {
    if (result.ok || result.canceled) return
    Alert.alert(tx('signInMethods.failedTitle'), tx(result.error ?? 'errors.generic', result.errorParams))
  }

  async function connect(provider: LinkableProvider) {
    setBusy(provider)
    try {
      const result =
        provider === 'apple' ? await appleLink(makeAppleDeps()) : await googleLink(makeGoogleDeps())
      report(result)
      if (result.ok) await reload()
    } finally {
      setBusy(null)
    }
  }

  function confirmDisconnect(provider: LinkableProvider, identity: UserIdentity) {
    const name = tx(`signInMethods.providers.${provider}`)
    Alert.alert(
      tx('signInMethods.disconnectAlert.title', { provider: name }),
      tx('signInMethods.disconnectAlert.message', { provider: name }),
      [
        { text: tx('common:cancel'), style: 'cancel' },
        {
          text: tx('signInMethods.disconnectAlert.confirm'),
          style: 'destructive',
          onPress: async () => {
            setBusy(provider)
            try {
              const result = await unlinkSignInMethod(supabase, identity)
              report(result)
              if (result.ok) await reload()
            } finally {
              setBusy(null)
            }
          },
        },
      ],
    )
  }

  const unlinkable = canUnlink(identities)

  return (
    <Screen edges={['left', 'right']}>
      <ScrollView
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
          {tx('signInMethods.title')}
        </Text>

        <SectionHeader label={tx('signInMethods.sectionLabel')} />
        <Card>
          {LINKABLE_PROVIDERS.map((provider, index) => {
            const identity = findIdentity(identities, provider)
            const name = tx(`signInMethods.providers.${provider}`)
            const canConnectHere = provider !== 'apple' || Platform.OS === 'ios'
            const value =
              busy === provider
                ? tx('pleaseWait')
                : identity
                  ? identityEmail(identity) ?? tx('signInMethods.connected')
                  : canConnectHere
                    ? tx('signInMethods.connect')
                    : tx('signInMethods.notConnected')
            const onPress =
              busy !== null
                ? undefined
                : identity
                  ? unlinkable
                    ? () => confirmDisconnect(provider, identity)
                    : undefined
                  : canConnectHere
                    ? () => void connect(provider)
                    : undefined
            return (
              <ListRow
                key={provider}
                title={name}
                value={value}
                accessibilityLabel={`${name}, ${value}`}
                chevron={onPress !== undefined}
                isLast={index === LINKABLE_PROVIDERS.length - 1}
                onPress={onPress}
              />
            )
          })}
        </Card>
        <Text
          style={{
            paddingHorizontal: t.spacing.md,
            paddingTop: t.spacing.sm,
            fontSize: 12.5,
            lineHeight: 17,
            color: t.colors.sec,
          }}
        >
          {identities.length > 0 && !unlinkable
            ? tx('signInMethods.lastMethodNote')
            : Platform.OS === 'ios'
              ? tx('signInMethods.hint')
              : tx('signInMethods.hintAndroid')}
        </Text>
      </ScrollView>

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
