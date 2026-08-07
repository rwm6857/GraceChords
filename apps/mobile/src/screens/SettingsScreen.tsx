import { useState } from 'react'
import { Alert, Image, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Screen from '../components/Screen'
import Card from '../components/Card'
import ListRow from '../components/ListRow'
import SectionHeader from '../components/SectionHeader'
import SymbolIcon from '../components/SymbolIcon'
import RowIcon from '../components/RowIcon'
import GlassSurface from '../components/GlassSurface'
import FormSheetShell from '../components/FormSheetShell'
import { useFormSheet } from '../lib/formSheetHost'
import { useTheme } from '../theme/ThemeProvider'
import { useCurrentUser } from '../lib/currentUser'
import { useProfileSprite } from '../lib/useProfileSprite'
import { useDisplayName } from '../lib/useDisplayName'
import {
  setDefaultChordStyle,
  setDefaultDailyWordDestination,
  setDefaultLanguage,
  setDefaultTheme,
  useAppDefaults,
  type ChordStyle,
  type DailyWordDestination,
  type ThemePref,
} from '../lib/defaults'
import { applyLanguagePreference, SUPPORTED_LOCALES } from '../i18n'
import { localeLabel, normalizeLanguageTag } from '../i18n/config'
import { formatReminderTime, useReaderReminder } from '../lib/readerReminder'
import {
  disableReaderReminder,
  enableReaderReminder,
  updateReaderReminderTime,
} from '../lib/readerReminderService'
import ReminderTimeSheet from '../components/reader/ReminderTimeSheet'
import { setStreakEnabled, useReadingStreak } from '../lib/readingStreak'

// The grouped "Profile & Settings" screen (design: [CONTENT] Settings Content).
// Built from Stage-0 primitives — a Profile card and grouped Cards
// (Settings / Reader / Library / Support). Theme + chord style are app-wide
// DEFAULTS written here and read by the Song Viewer / Performer / Daily Word.
//
// The profile card now pushes ACCOUNT (app icon, name, email, change password,
// Telegram) rather than the sprite picker directly. Log out and Delete account
// live there too — moved, not copied, so there is only one of each.

const HELP_URL = 'https://gracechords.com/help'
const FEEDBACK_MAILTO = 'mailto:support@gracechords.com?subject=GraceChords%20feedback'

// Option labels resolve through the settings namespace at render time.
const THEME_OPTIONS: { value: ThemePref; labelKey: string }[] = [
  { value: 'system', labelKey: 'appearanceOptions.auto' },
  { value: 'light', labelKey: 'appearanceOptions.light' },
  { value: 'dark', labelKey: 'appearanceOptions.dark' },
]
const CHORD_OPTIONS: { value: ChordStyle; labelKey: string }[] = [
  { value: 'letters', labelKey: 'chordStyleOptions.letters' },
  { value: 'solfege', labelKey: 'chordStyleOptions.solfege' },
]
const DAILY_WORD_OPTIONS: { value: DailyWordDestination; labelKey: string }[] = [
  { value: 'landing', labelKey: 'dailyWordOptions.landing' },
  { value: 'reader', labelKey: 'dailyWordOptions.reader' },
]

// Sentinel for "no override — follow the device language" in the picker.
const LANGUAGE_SYSTEM = 'system'

/** Radio list of options with a checkmark on the current value, presented via
 * the native formSheet route (src/lib/formSheetHost.ts). */
type OptionSheetProps<T extends string> = {
  visible: boolean
  title: string
  options: { value: T; label: string }[]
  value: T
  onSelect: (v: T) => void
  onClose: () => void
}

function OptionSheet<T extends string>(props: OptionSheetProps<T>) {
  useFormSheet(props.visible, () => <OptionSheetContent {...props} />, props.onClose)
  return null
}

function OptionSheetContent<T extends string>({
  title,
  options,
  value,
  onSelect,
  onClose,
}: OptionSheetProps<T>) {
  const t = useTheme()
  return (
    <FormSheetShell title={title} onAction={onClose}>
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
    </FormSheetShell>
  )
}

export default function SettingsScreen() {
  const t = useTheme()
  const { t: tx, i18n } = useTranslation(['settings', 'common'])
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const user = useCurrentUser()
  const defaults = useAppDefaults()
  const { source: spriteSource } = useProfileSprite()
  const reminder = useReaderReminder()
  const streak = useReadingStreak()
  const [reminderBusy, setReminderBusy] = useState(false)
  const [sheet, setSheet] = useState<
    null | 'theme' | 'chordStyle' | 'language' | 'reminderTime' | 'dailyEntry'
  >(null)
  // Measured glass-bar height feeds the scroll-behind top inset.
  const [barH, setBarH] = useState(0)

  const email = user?.email ?? ''
  // The edited name from public.users.display_name, falling back to the provider
  // profile then the email local part — see resolveDisplayName in profile.ts.
  const displayName = useDisplayName() ?? tx('yourAccount')

  const themeOptions = THEME_OPTIONS.map((o) => ({ value: o.value, label: tx(o.labelKey) }))
  const chordOptions = CHORD_OPTIONS.map((o) => ({ value: o.value, label: tx(o.labelKey) }))
  const dailyWordOptions = DAILY_WORD_OPTIONS.map((o) => ({ value: o.value, label: tx(o.labelKey) }))
  // "Automatic (device)" + one entry per locale folder (SUPPORTED_LOCALES is
  // derived from src/i18n/locales/, not hardcoded).
  const languageOptions = [
    { value: LANGUAGE_SYSTEM, label: tx('languageAutomatic') },
    ...SUPPORTED_LOCALES.map((code) => ({ value: code, label: localeLabel(code) })),
  ]
  // The row shows the RESOLVED language (what the UI is actually in), even
  // when the stored pref is "follow the device".
  const resolvedLanguage = normalizeLanguageTag(i18n.resolvedLanguage ?? i18n.language)

  function onSelectLanguage(value: string) {
    const pref = value === LANGUAGE_SYSTEM ? null : value
    setDefaultLanguage(pref)
    applyLanguagePreference(pref)
  }

  // Enabling requests notification permission (the iOS system prompt appears
  // here); we only persist + schedule when it's granted, and steer the user to
  // the system Settings app on denial. Disabling cancels the scheduled reminder.
  async function onToggleReminder(next: boolean) {
    if (reminderBusy) return
    setReminderBusy(true)
    try {
      if (next) {
        const granted = await enableReaderReminder(reminder.hour, reminder.minute)
        if (!granted) {
          Alert.alert(tx('reminder.permissionDeniedTitle'), tx('reminder.permissionDeniedMessage'), [
            { text: tx('common:cancel'), style: 'cancel' },
            { text: tx('reminder.openSettings'), onPress: () => void Linking.openSettings() },
          ])
        }
      } else {
        await disableReaderReminder()
      }
    } finally {
      setReminderBusy(false)
    }
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
          {tx('title')}
        </Text>

        {/* Profile card */}
        <Card>
          <Pressable
            onPress={() => router.push('/account')}
            accessibilityRole="button"
            accessibilityLabel={tx('openAccount')}
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
            <SymbolIcon name="chevron.right" size={14} color={t.colors.sec} />
          </Pressable>
        </Card>

        {/* SETTINGS */}
        <SectionHeader label={tx('sections.settings')} />
        <Card>
          <ListRow
            title={tx('appearance')}
            leading={<RowIcon name="circle.lefthalf.filled" />}
            value={themeOptions.find((o) => o.value === defaults.theme)?.label ?? ''}
            chevron
            onPress={() => setSheet('theme')}
          />
          <ListRow
            title={tx('language')}
            leading={<RowIcon name="globe" />}
            value={localeLabel(resolvedLanguage)}
            chevron
            onPress={() => setSheet('language')}
          />
          <ListRow
            title={tx('chordStyle')}
            leading={<RowIcon name="music.note" />}
            value={chordOptions.find((o) => o.value === defaults.chordStyle)?.label ?? ''}
            chevron
            onPress={() => setSheet('chordStyle')}
          />
          <ListRow
            title={tx('offlineDownloads')}
            leading={<RowIcon name="arrow.down.circle" />}
            chevron
            isLast
            onPress={() => router.push('/offline')}
          />
        </Card>

        {/* READER */}
        <SectionHeader label={tx('sections.reader')} />
        <Card>
          <ListRow
            title={tx('dailyWordEntry')}
            leading={<RowIcon name="book" />}
            value={dailyWordOptions.find((o) => o.value === defaults.dailyWordDestination)?.label ?? ''}
            chevron
            onPress={() => setSheet('dailyEntry')}
          />
          <ListRow
            title={tx('reminder.dailyReminder')}
            leading={<RowIcon name="bell" />}
            trailing={
              <Switch
                value={reminder.enabled}
                disabled={reminderBusy}
                onValueChange={(v) => void onToggleReminder(v)}
                trackColor={{ true: t.colors.accent }}
                accessibilityLabel={tx('reminder.dailyReminder')}
              />
            }
          />
          {reminder.enabled ? (
            <ListRow
              title={tx('reminder.time')}
              leading={<RowIcon name="clock" />}
              value={formatReminderTime(reminder.hour, reminder.minute, i18n.language)}
              chevron
              onPress={() => setSheet('reminderTime')}
            />
          ) : null}
          <ListRow
            title={tx('readingStreak.title')}
            leading={<RowIcon name="flame.fill" />}
            isLast
            trailing={
              <Switch
                value={streak.enabled}
                onValueChange={setStreakEnabled}
                trackColor={{ true: t.colors.accent }}
                accessibilityLabel={tx('readingStreak.title')}
              />
            }
          />
        </Card>

        {/* LIBRARY */}
        <SectionHeader label={tx('sections.library')} />
        <Card>
          <ListRow
            title={tx('starred')}
            leading={<RowIcon name="star" />}
            chevron
            onPress={() => router.push('/songs')}
          />
          <ListRow
            title={tx('mySetlists')}
            leading={<RowIcon name="music.note.list" />}
            chevron
            isLast
            onPress={() => router.push('/setlists')}
          />
        </Card>

        {/* SUPPORT */}
        <SectionHeader label={tx('sections.support')} />
        <Card>
          <ListRow
            title={tx('helpCenter')}
            leading={<RowIcon name="questionmark.circle" />}
            chevron
            onPress={() => void Linking.openURL(HELP_URL)}
          />
          <ListRow
            title={tx('sendFeedback')}
            leading={<RowIcon name="envelope" />}
            chevron
            onPress={() => void Linking.openURL(FEEDBACK_MAILTO)}
          />
          <ListRow
            title={tx('aboutGraceChords')}
            leading={<RowIcon name="info.circle" />}
            chevron
            isLast
            onPress={() => router.push('/about')}
          />
        </Card>
      </ScrollView>

      {/* Scroll-behind top bar: Liquid Glass on iOS 26, opaque page-bg bar on
          iOS < 26 / Android. Content scrolls under it (measured via onLayout). */}
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
          <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.textAccent }}>{tx('nav:home')}</Text>
        </Pressable>
      </GlassSurface>

      <OptionSheet
        visible={sheet === 'theme'}
        title={tx('appearance')}
        options={themeOptions}
        value={defaults.theme}
        onSelect={setDefaultTheme}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'language'}
        title={tx('language')}
        options={languageOptions}
        value={defaults.language ?? LANGUAGE_SYSTEM}
        onSelect={onSelectLanguage}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'chordStyle'}
        title={tx('chordStyle')}
        options={chordOptions}
        value={defaults.chordStyle}
        onSelect={setDefaultChordStyle}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'dailyEntry'}
        title={tx('dailyWordEntry')}
        options={dailyWordOptions}
        value={defaults.dailyWordDestination}
        onSelect={setDefaultDailyWordDestination}
        onClose={() => setSheet(null)}
      />
      <ReminderTimeSheet
        visible={sheet === 'reminderTime'}
        hour={reminder.hour}
        minute={reminder.minute}
        onConfirm={(h, m) => void updateReaderReminderTime(h, m)}
        onClose={() => setSheet(null)}
      />
    </Screen>
  )
}
