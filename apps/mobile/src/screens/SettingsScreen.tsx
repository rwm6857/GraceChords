import { useState } from 'react'
import { Alert, Image, Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Screen from '../components/Screen'
import Card from '../components/Card'
import ListRow from '../components/ListRow'
import SectionHeader from '../components/SectionHeader'
import SymbolIcon from '../components/SymbolIcon'
import GlassSurface from '../components/GlassSurface'
import BottomSheet from '../components/BottomSheet'
import { useTheme } from '../theme/ThemeProvider'
import type { Tokens } from '@gracechords/tokens/native'
import { supabase } from '../lib/supabase'
import { useCurrentUser } from '../lib/greetings'
import { useProfileSprite } from '../lib/useProfileSprite'
import {
  setDefaultChordStyle,
  setDefaultTheme,
  useAppDefaults,
  type ChordStyle,
  type ThemePref,
} from '../lib/defaults'

// The grouped "Profile & Settings" screen (design: [CONTENT] Settings Content).
// Built from Stage-0 primitives — a Profile card, three grouped Cards
// (Settings / Library / Support), and destructive Log out + Delete account
// cards. Theme + chord style are app-wide DEFAULTS written here and read by the
// Song Viewer / Performer / Daily Word.

const HELP_URL = 'https://gracechords.com/help'
const FEEDBACK_MAILTO = 'mailto:support@gracechords.com?subject=GraceChords%20feedback'

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]
const CHORD_OPTIONS: { value: ChordStyle; label: string }[] = [
  { value: 'letters', label: 'Letters' },
  { value: 'solfege', label: 'Solfège' },
]

function labelFor<T extends string>(options: { value: T; label: string }[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? ''
}

/** Rounded leading icon chip used on the grouped rows. */
function RowIcon({ name, t }: { name: Parameters<typeof SymbolIcon>[0]['name']; t: Tokens }) {
  return (
    <View
      style={{
        width: 29,
        height: 29,
        borderRadius: 7,
        backgroundColor: t.colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SymbolIcon name={name} size={16} color={t.colors.accent} />
    </View>
  )
}

/** A standalone destructive action card (Log out / Delete account). */
function DangerCard({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string
  onPress: () => void
  accessibilityLabel?: string
}) {
  const t = useTheme()
  return (
    <Card style={{ marginTop: t.spacing.lg }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={({ pressed }) => ({
          paddingVertical: 13,
          alignItems: 'center',
          backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
        })}
      >
        <Text style={{ fontSize: t.typography.body.fontSize, fontWeight: '600', color: t.colors.danger }}>
          {label}
        </Text>
      </Pressable>
    </Card>
  )
}

/** BottomSheet radio list of options with a checkmark on the current value. */
function OptionSheet<T extends string>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean
  title: string
  options: { value: T; label: string }[]
  value: T
  onSelect: (v: T) => void
  onClose: () => void
}) {
  const t = useTheme()
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={{ paddingBottom: t.spacing.lg }}>
        {options.map((o, i) => (
          <ListRow
            key={o.value}
            title={o.label}
            isLast={i === options.length - 1}
            accessibilityLabel={o.label}
            onPress={() => {
              onSelect(o.value)
              onClose()
            }}
            trailing={
              o.value === value ? (
                <SymbolIcon name="checkmark" size={16} color={t.colors.accent} />
              ) : null
            }
          />
        ))}
      </View>
    </BottomSheet>
  )
}

export default function SettingsScreen() {
  const t = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const user = useCurrentUser()
  const defaults = useAppDefaults()
  const { source: spriteSource } = useProfileSprite()
  const [sheet, setSheet] = useState<null | 'theme' | 'chordStyle'>(null)
  // Measured glass-bar height feeds the scroll-behind top inset.
  const [barH, setBarH] = useState(0)

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
  const fullName = ((meta.full_name ?? meta.name) as string | undefined)?.trim()
  const email = user?.email ?? ''
  const displayName = fullName || (email ? email.split('@')[0] : 'Your account')

  function onSignOut() {
    Alert.alert('Sign out', 'Sign out of GraceChords on this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void supabase.auth.signOut() },
    ])
  }

  function onDeleteAccount() {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and all your data — starred songs, setlists, and preferences. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            // Reuses the existing SECURITY DEFINER RPC (same path web uses):
            // removes auth.users + cascades. Session then invalidates and the
            // root auth listener redirects to /login.
            const { error } = await supabase.rpc('delete_user')
            if (error) {
              Alert.alert('Delete failed', 'We could not delete your account. Please try again.')
              return
            }
            await supabase.auth.signOut()
          },
        },
      ],
    )
  }

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
          Profile &amp; Settings
        </Text>

        {/* Profile card */}
        <Card>
          <Pressable
            onPress={() => router.push({ pathname: '/choose-icon', params: { mode: 'edit' } })}
            accessibilityRole="button"
            accessibilityLabel="Change your icon"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              padding: t.spacing.lg,
              backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
            })}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: t.radii.pill,
                backgroundColor: t.colors.accentSoft,
                borderWidth: 1,
                borderColor: t.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {spriteSource ? (
                <Image source={spriteSource} style={{ width: 52, height: 52 }} resizeMode="cover" />
              ) : (
                <SymbolIcon name="person" size={26} color={t.colors.accent} />
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: t.colors.ink }}
              >
                {displayName}
              </Text>
              {email ? (
                <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 13.5, color: t.colors.sec }}>
                  {email}
                </Text>
              ) : null}
            </View>
            <SymbolIcon name="chevron.right" size={14} color={t.colors.muted} />
          </Pressable>
        </Card>

        {/* SETTINGS */}
        <SectionHeader label="SETTINGS" />
        <Card>
          <ListRow
            title="Appearance"
            leading={<RowIcon name="circle.lefthalf.filled" t={t} />}
            value={labelFor(THEME_OPTIONS, defaults.theme)}
            chevron
            onPress={() => setSheet('theme')}
          />
          <ListRow
            title="Language"
            leading={<RowIcon name="globe" t={t} />}
            value="English"
          />
          <ListRow
            title="Chord style"
            leading={<RowIcon name="music.note" t={t} />}
            value={labelFor(CHORD_OPTIONS, defaults.chordStyle)}
            chevron
            onPress={() => setSheet('chordStyle')}
          />
          <ListRow
            title="Offline &amp; downloads"
            leading={<RowIcon name="arrow.down.circle" t={t} />}
            chevron
            isLast
            onPress={() => router.push('/offline')}
          />
        </Card>

        {/* LIBRARY */}
        <SectionHeader label="LIBRARY" />
        <Card>
          <ListRow
            title="Starred"
            leading={<RowIcon name="star" t={t} />}
            chevron
            onPress={() => router.push('/songs')}
          />
          <ListRow
            title="My setlists"
            leading={<RowIcon name="music.note.list" t={t} />}
            chevron
            isLast
            onPress={() => router.push('/setlists')}
          />
        </Card>

        {/* SUPPORT */}
        <SectionHeader label="SUPPORT" />
        <Card>
          <ListRow
            title="Help center"
            leading={<RowIcon name="questionmark.circle" t={t} />}
            chevron
            onPress={() => void Linking.openURL(HELP_URL)}
          />
          <ListRow
            title="Send feedback"
            leading={<RowIcon name="envelope" t={t} />}
            chevron
            onPress={() => void Linking.openURL(FEEDBACK_MAILTO)}
          />
          <ListRow
            title="About GraceChords"
            leading={<RowIcon name="info.circle" t={t} />}
            chevron
            isLast
            onPress={() => router.push('/about')}
          />
        </Card>

        <DangerCard label="Log out" onPress={onSignOut} />
        <DangerCard label="Delete account" onPress={onDeleteAccount} />
      </ScrollView>

      {/* Scroll-behind top bar: Liquid Glass on iOS 26, opaque page-bg bar on
          iOS < 26 / Android. Content scrolls under it (measured via onLayout). */}
      <GlassSurface
        fallbackColor={t.colors.bg}
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
          accessibilityLabel="Back"
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
        >
          <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
          <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent }}>Home</Text>
        </Pressable>
      </GlassSurface>

      <OptionSheet
        visible={sheet === 'theme'}
        title="Appearance"
        options={THEME_OPTIONS}
        value={defaults.theme}
        onSelect={setDefaultTheme}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'chordStyle'}
        title="Chord style"
        options={CHORD_OPTIONS}
        value={defaults.chordStyle}
        onSelect={setDefaultChordStyle}
        onClose={() => setSheet(null)}
      />
    </Screen>
  )
}
