import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AppState, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as WebBrowser from 'expo-web-browser'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Screen from '../components/Screen'
import Card from '../components/Card'
import ListRow from '../components/ListRow'
import SectionHeader from '../components/SectionHeader'
import SymbolIcon from '../components/SymbolIcon'
import RowIcon from '../components/RowIcon'
import DangerCard from '../components/DangerCard'
import GlassSurface from '../components/GlassSurface'
import FormSheetShell from '../components/FormSheetShell'
import { useFormSheet } from '../lib/formSheetHost'
import { useTheme } from '../theme/ThemeProvider'
import { supabase } from '../lib/supabase'
import { useCurrentUser } from '../lib/currentUser'
import { useProfileSprite } from '../lib/useProfileSprite'
import { useDisplayName, setLocalDisplayName } from '../lib/useDisplayName'
import { saveDisplayName } from '../lib/profile'
import { actionFailureMessage } from '../lib/errors'
import {
  fetchTelegramLink,
  telegramProfileUrl,
  unlinkTelegram,
  UNLINKED,
  type TelegramLinkState,
} from '../lib/telegramLink'

// Account — one level under Profile & Settings. Holds the identity, security and
// connection actions that used to be scattered across the settings screen, plus
// Log out and Delete account, which MOVED here rather than being duplicated:
// two copies of a destructive action double both the mis-tap surface and the
// confirm-dialog maintenance. App Store Guideline 5.1.1(v) wants account
// deletion discoverable in-app, not top-level, so one level down matches how
// Apple's own Settings treats Apple ID sign-out.

/** Formats the link date in the app locale; the day is all the row needs. */
function formatLinkedDate(iso: string | null, language: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(d)
}

export default function AccountScreen() {
  const t = useTheme()
  const { t: tx, i18n } = useTranslation(['profile', 'settings', 'common'])
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const user = useCurrentUser()
  const { source: spriteSource } = useProfileSprite()
  const displayName = useDisplayName()

  const [sheet, setSheet] = useState<null | 'name' | 'telegram'>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [telegram, setTelegram] = useState<TelegramLinkState>(UNLINKED)
  const [telegramBusy, setTelegramBusy] = useState(false)
  const [barH, setBarH] = useState(0)

  const email = user?.email ?? ''
  const shownName = displayName ?? tx('settings:yourAccount')

  // Render Change password if and only if this account carries an `email`
  // identity. Deliberately NOT inferred from the absence of Google/Apple:
  // identity linking means one user can hold an email identity AND OAuth
  // identities at once, and inferring from OAuth would wrongly hide the row for
  // exactly those accounts.
  const hasEmailIdentity = (user?.identities ?? []).some((i) => i.provider === 'email')

  const loadTelegram = useCallback(async () => {
    try {
      setTelegram(await fetchTelegramLink())
    } catch (err) {
      // Status is decoration on a settings row, not content. Leaving the row on
      // its last known value beats replacing the screen with an error.
      console.error('[AccountScreen] telegram status failed:', err)
    }
  }, [])

  // The app cannot observe a link happening elsewhere — it completes in a
  // browser (and, after PR 2, in Telegram). Refetch on focus AND on the
  // foreground transition: returning from another app fires only the latter,
  // because this screen never lost focus while the user was away.
  const focused = useRef(false)
  useFocusEffect(
    useCallback(() => {
      focused.current = true
      void loadTelegram()
      return () => {
        focused.current = false
      }
    }, [loadTelegram]),
  )

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && focused.current) void loadTelegram()
    })
    return () => sub.remove()
  }, [loadTelegram])

  function openNameSheet() {
    setNameDraft(displayName ?? '')
    setSheet('name')
  }

  async function onSaveName() {
    const next = nameDraft.trim()
    if (!user?.id || !next || savingName) {
      setSheet(null)
      return
    }
    setSavingName(true)
    try {
      const { error } = await saveDisplayName(supabase, user.id, next)
      if (error) {
        Alert.alert(tx('nameSheet.saveFailedTitle'), tx('nameSheet.saveFailedMessage'))
        return
      }
      setLocalDisplayName(next)
      setSheet(null)
    } finally {
      setSavingName(false)
    }
  }

  function onUnlinkTelegram() {
    Alert.alert(tx('telegram.unlinkAlert.title'), tx('telegram.unlinkAlert.message'), [
      { text: tx('common:cancel'), style: 'cancel' },
      {
        text: tx('telegram.unlinkAlert.confirm'),
        style: 'destructive',
        onPress: async () => {
          setTelegramBusy(true)
          try {
            await unlinkTelegram()
            setTelegram(UNLINKED)
            setSheet(null)
          } catch (err) {
            Alert.alert(
              tx('telegram.unlinkFailedTitle'),
              actionFailureMessage('AccountScreen.unlinkTelegram', err, tx),
            )
          } finally {
            setTelegramBusy(false)
          }
        },
      },
    ])
  }

  function onSignOut() {
    Alert.alert(tx('settings:signOutAlert.title'), tx('settings:signOutAlert.message'), [
      { text: tx('common:cancel'), style: 'cancel' },
      {
        text: tx('settings:signOutAlert.confirm'),
        style: 'destructive',
        onPress: () => void supabase.auth.signOut(),
      },
    ])
  }

  function onDeleteAccount() {
    Alert.alert(tx('settings:deleteAccountAlert.title'), tx('settings:deleteAccountAlert.message'), [
      { text: tx('common:cancel'), style: 'cancel' },
      {
        text: tx('settings:deleteAccountAlert.confirm'),
        style: 'destructive',
        onPress: async () => {
          // Unchanged from Profile & Settings: the SECURITY DEFINER RPC removes
          // auth.users and cascades. The session then invalidates and the root
          // auth listener redirects to /login.
          const { error } = await supabase.rpc('delete_user')
          if (error) {
            Alert.alert(
              tx('settings:deleteFailedAlert.title'),
              tx('settings:deleteFailedAlert.message'),
            )
            return
          }
          await supabase.auth.signOut()
        },
      },
    ])
  }

  const linkedDate = formatLinkedDate(telegram.linkedAt, i18n.language)
  const telegramValue = telegram.linked
    ? linkedDate
      ? tx('telegram.linkedOn', { date: linkedDate })
      : tx('telegram.linked')
    : tx('telegram.link')

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
          {tx('title')}
        </Text>

        {/* PROFILE */}
        <SectionHeader label={tx('sections.profile')} />
        <Card>
          <ListRow
            title={tx('appIcon')}
            accessibilityLabel={tx('appIcon')}
            leading={
              <View
                style={{
                  width: 29,
                  height: 29,
                  borderRadius: t.radii.pill,
                  backgroundColor: t.colors.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {spriteSource ? (
                  <Image source={spriteSource} style={{ width: 29, height: 29 }} resizeMode="cover" />
                ) : (
                  <SymbolIcon name="person" size={16} color={t.colors.accent} />
                )}
              </View>
            }
            chevron
            onPress={() => router.push({ pathname: '/choose-icon', params: { mode: 'edit' } })}
          />
          <ListRow
            title={tx('name')}
            leading={<RowIcon name="person" />}
            value={shownName}
            accessibilityLabel={`${tx('name')}, ${shownName}`}
            chevron
            onPress={openNameSheet}
          />
          {/* Read-only. Changing the email address is a separate feature. Apple
              private-relay addresses show as-is. */}
          <ListRow
            title={tx('email')}
            leading={<RowIcon name="envelope" />}
            value={email}
            accessibilityLabel={`${tx('email')}, ${email}`}
            isLast
          />
        </Card>

        {/* SECURITY — only for accounts that have a password to change. */}
        {hasEmailIdentity ? (
          <>
            <SectionHeader label={tx('sections.security')} />
            <Card>
              <ListRow
                title={tx('changePassword')}
                leading={<RowIcon name="lock" />}
                chevron
                isLast
                onPress={() => router.push('/account/password')}
              />
            </Card>
          </>
        ) : null}

        {/* CONNECTIONS */}
        <SectionHeader label={tx('sections.connections')} />
        <Card>
          <ListRow
            title={tx('telegram.title')}
            leading={<RowIcon name="paperplane.fill" />}
            value={telegramValue}
            accessibilityLabel={`${tx('telegram.title')}, ${telegramValue}`}
            chevron
            isLast
            onPress={() => {
              if (telegram.linked) {
                setSheet('telegram')
                return
              }
              // In-app browser, so dismissing it returns here rather than
              // leaving the app. Refetch on dismissal: the link may have just
              // completed, and this is the tightest signal we get.
              void WebBrowser.openBrowserAsync(telegramProfileUrl()).then(() => loadTelegram())
            }}
          />
        </Card>
        {!telegram.linked ? (
          <Text
            style={{
              paddingHorizontal: t.spacing.md,
              paddingTop: t.spacing.sm,
              fontSize: 12.5,
              lineHeight: 17,
              color: t.colors.sec,
            }}
          >
            {tx('telegram.linkHint')}
          </Text>
        ) : null}

        <DangerCard label={tx('logOut')} onPress={onSignOut} hint={tx('logOutHint')} />
        <DangerCard
          label={tx('deleteAccount')}
          onPress={onDeleteAccount}
          hint={tx('deleteAccountHint')}
        />
      </ScrollView>

      {/* Scroll-behind top bar, matching Profile & Settings. */}
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
            {tx('settings:title')}
          </Text>
        </Pressable>
      </GlassSurface>

      <NameSheet
        visible={sheet === 'name'}
        value={nameDraft}
        onChange={setNameDraft}
        busy={savingName}
        onSave={() => void onSaveName()}
        onClose={() => setSheet(null)}
      />
      <TelegramSheet
        visible={sheet === 'telegram'}
        linkedDate={linkedDate}
        busy={telegramBusy}
        onUnlink={onUnlinkTelegram}
        onClose={() => setSheet(null)}
      />
    </Screen>
  )
}

type NameSheetProps = {
  visible: boolean
  value: string
  onChange: (v: string) => void
  busy: boolean
  onSave: () => void
  onClose: () => void
}

function NameSheet(props: NameSheetProps) {
  useFormSheet(props.visible, () => <NameSheetContent {...props} />, props.onClose)
  return null
}

function NameSheetContent({ value, onChange, busy, onSave }: NameSheetProps) {
  const t = useTheme()
  const { t: tx } = useTranslation('profile')
  return (
    <FormSheetShell
      title={tx('nameSheet.title')}
      actionLabel={busy ? tx('nameSheet.saving') : tx('nameSheet.save')}
      onAction={onSave}
    >
      <View style={{ padding: t.spacing.lg, gap: t.spacing.sm }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={tx('nameSheet.placeholder')}
          placeholderTextColor={t.colors.sec}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={onSave}
          accessibilityLabel={tx('nameSheet.title')}
          style={{
            height: 52,
            paddingHorizontal: t.spacing.md + 2,
            borderRadius: t.radii.md,
            backgroundColor: t.colors.surfaceAlt,
            borderWidth: 1,
            borderColor: t.colors.border,
            fontSize: t.typography.body.fontSize,
            color: t.colors.ink,
          }}
        />
        <Text style={{ fontSize: 12.5, lineHeight: 17, color: t.colors.sec }}>
          {tx('nameSheet.hint')}
        </Text>
      </View>
    </FormSheetShell>
  )
}

type TelegramSheetProps = {
  visible: boolean
  linkedDate: string | null
  busy: boolean
  onUnlink: () => void
  onClose: () => void
}

function TelegramSheet(props: TelegramSheetProps) {
  useFormSheet(props.visible, () => <TelegramSheetContent {...props} />, props.onClose)
  return null
}

function TelegramSheetContent({ linkedDate, busy, onUnlink, onClose }: TelegramSheetProps) {
  const t = useTheme()
  const { t: tx } = useTranslation('profile')
  return (
    <FormSheetShell title={tx('telegram.title')} onAction={onClose}>
      <View style={{ paddingBottom: t.spacing.lg }}>
        <ListRow
          title={tx('telegram.status')}
          value={linkedDate ? tx('telegram.linkedOn', { date: linkedDate }) : tx('telegram.linked')}
          accessibilityLabel={tx('telegram.status')}
        />
        <ListRow
          title={busy ? tx('telegram.unlinking') : tx('telegram.unlink')}
          accessibilityLabel={tx('telegram.unlink')}
          isLast
          onPress={busy ? undefined : onUnlink}
          trailing={
            <SymbolIcon name="xmark.circle.fill" size={16} color={t.colors.danger} />
          }
        />
      </View>
    </FormSheetShell>
  )
}
