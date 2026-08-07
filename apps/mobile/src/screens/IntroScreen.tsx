import { useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import SymbolIcon, { type SymbolIconProps } from '../components/SymbolIcon'
import SettingsCard from '../components/Card'
import ListRow from '../components/ListRow'
import ReminderTimeSheet from '../components/reader/ReminderTimeSheet'
import { useTheme } from '../theme/ThemeProvider'
import { useAccessibilityFlags } from '../lib/accessibilityFlags'
import { markIntroSeen } from '../lib/introSeen'
import { formatReminderTime, getReaderReminder } from '../lib/readerReminder'
import { commitOnboardingReminder } from '../lib/readerReminderService'
import { setStreakEnabled } from '../lib/readingStreak'
import type { Tokens } from '@gracechords/tokens/native'

// First-launch intro: three cards, shown once per device after the user has a
// session (see the gate in app/_layout.tsx). Card 1 is a title card, card 2 is
// informational, and card 3 carries two REAL settings (Daily Word reminder +
// reading streak). It frames what the app does and lands the user on Home.
//
// Finishing and skipping both set the device-local seen-flag and replace to '/'.
// `replace`, not `push`, so the intro leaves the back stack and a back gesture
// can't return to it. They differ in ONE respect: "Get started" commits card 3's
// two settings (and is the only place notification permission is ever
// requested); Skip commits nothing and leaves both at their stored defaults.
//
// Phone layout only, per the brief — no tablet branch and no ConstrainedContent.
//
// The pager is a plain paging ScrollView rather than Reanimated: the interaction
// is a discrete page snap with no finger-tracked affordances, so the reader's
// ChapterSwipe machinery would be all cost and no benefit.

/** Card 2's feature rows. Every icon is taken from the live UI that owns it. */
const FEATURES: { key: string; icon: SymbolIconProps['name'] }[] = [
  // The Setlist Builder's "change key" chip (SetlistTimeline) — and the compound
  // of the TransposeBar's own chevron.up / chevron.down.
  { key: 'transpose', icon: 'chevron.up.chevron.down' },
  // The Performer header's live-session button.
  { key: 'liveSessions', icon: 'antenna.radiowaves.left.and.right' },
  // The Song Viewer's export/share button.
  { key: 'share', icon: 'square.and.arrow.up' },
]

const CARD_COUNT = 3

/**
 * Card 3's leading icon chip. A local copy of SettingsScreen's `RowIcon` — that
 * one is defined inside SettingsScreen.tsx and not exported, and extracting it
 * would mean editing that screen. Geometry is kept identical (29 / radius 7 /
 * accentSoft / 16px glyph) so the onboarding rows and the Settings rows they
 * mirror are indistinguishable.
 */
function RowIcon({ name, t }: { name: SymbolIconProps['name']; t: Tokens }) {
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

/** Rounded leading icon chip, mirroring the Settings/Utilities grouped-row look. */
function FeatureRow({ icon, label, t }: { icon: SymbolIconProps['name']; label: string; t: Tokens }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: t.radii.sm,
          backgroundColor: t.colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SymbolIcon name={icon} size={19} color={t.colors.accent} />
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: t.typography.rowTitle.fontSize,
          fontWeight: t.typography.rowTitle.fontWeight,
          letterSpacing: t.typography.rowTitle.letterSpacing,
          color: t.colors.ink,
        }}
      >
        {label}
      </Text>
    </View>
  )
}

// Intro-local type sizes. `tokens.typography` tops out at largeTitle (27) and
// carries no display step above it, so — like the rest of the app's
// screen-specific type (ListRow 17/13.5, SpritePickerScreen 16.5/14.5) — these
// are local literals rather than a new token. TITLE is one step up from BODY_*
// so card 1 outweighs the informational cards without a scale entry.
const HEADING_SIZE = 30
const HEADING_LINE = 38
const TITLE_HEADING_SIZE = 34
const TITLE_HEADING_LINE = 42

function Card({
  width,
  topInset,
  heading,
  body,
  t,
  variant = 'info',
  children,
}: {
  width: number
  /**
   * Distance from the top of the pager to the heading. A FIXED offset rather
   * than `justifyContent: 'center'` on purpose: card 2 carries three extra
   * feature rows, and centering would park its heading noticeably higher than
   * cards 1 and 3, so the title would visibly jump as you page. Anchoring the
   * top keeps the heading still and lets the extra content grow downward.
   *
   * The 'title' variant opts out of this — see `variant`.
   */
  topInset: number
  heading: string
  body: string
  t: Tokens
  /**
   * 'info' (the default) is the left-aligned, top-anchored informational card —
   * cards 2 and 3. 'title' is card 1 only: centered as a block with a larger
   * heading, so the opener reads as a title page rather than a third bullet.
   * Defaulted so the informational call sites stay untouched.
   */
  variant?: 'info' | 'title'
  children?: React.ReactNode
}) {
  const isTitle = variant === 'title'
  return (
    <View
      style={{
        width,
        flex: 1,
        // Title card centers as a block; informational cards keep the shared
        // top anchor that holds their headings still across page changes.
        ...(isTitle
          ? { justifyContent: 'center', alignItems: 'center' }
          : { paddingTop: topInset }),
        paddingHorizontal: t.spacing.xl,
        gap: t.spacing.lg,
      }}
    >
      <Text
        style={{
          fontSize: isTitle ? TITLE_HEADING_SIZE : HEADING_SIZE,
          fontWeight: '700',
          letterSpacing: -0.5,
          lineHeight: isTitle ? TITLE_HEADING_LINE : HEADING_LINE,
          color: t.colors.ink,
          ...(isTitle ? { textAlign: 'center' as const } : null),
        }}
      >
        {heading}
      </Text>
      <Text
        style={{
          fontSize: 17,
          lineHeight: 25,
          color: t.colors.sec,
          ...(isTitle ? { textAlign: 'center' as const } : null),
        }}
      >
        {body}
      </Text>
      {children}
    </View>
  )
}

export default function IntroScreen() {
  const t = useTheme()
  const router = useRouter()
  const { t: tx, i18n } = useTranslation('intro')
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const { reduceMotion } = useAccessibilityFlags()
  const scroller = useRef<ScrollView>(null)
  const [page, setPage] = useState(0)

  const isLast = page === CARD_COUNT - 1
  // Heading sits in the upper third — high enough that cards 1 and 3 don't read
  // as empty, low enough that card 2's three feature rows still fit above the
  // CTA on the shortest supported phone.
  const topInset = Math.round(height * 0.16)

  // Card 3's two settings, held LOCALLY until "Get started". Both default on.
  // Seeded from the app's real stored defaults (8:00 AM — DEFAULT_READER_REMINDER),
  // never from a literal, so onboarding and Settings can't drift.
  const storedReminder = getReaderReminder()
  const [reminderOn, setReminderOn] = useState(true)
  const [streakOn, setStreakOn] = useState(true)
  const [time, setTime] = useState({ hour: storedReminder.hour, minute: storedReminder.minute })
  const [timeSheetOpen, setTimeSheetOpen] = useState(false)
  // Guards the CTA while the permission prompt is up, so it can't be double-tapped
  // into two commits / two navigations.
  const [committing, setCommitting] = useState(false)

  // Leaves the intro. `markIntroSeen` updates its cache synchronously, so the
  // auth gate re-evaluates to "seen" before this navigation lands and can't
  // bounce back here. Lands on HOME.
  const leave = () => {
    markIntroSeen()
    router.replace('/')
  }

  // "Get started" — the ONLY place card 3's choices are persisted, and the only
  // place notification permission is ever requested.
  const finish = async () => {
    if (committing) return
    setCommitting(true)
    try {
      // Streak is independent of notifications: no permission, no prompt.
      // Off needs no write — false is already the stored default.
      if (streakOn) setStreakEnabled(true)
      if (reminderOn) {
        // Checks permission before prompting, persists + actually schedules on
        // grant, and on denial pins the preference off and returns false. A
        // denial is deliberately silent — we ignore the result and move on.
        await commitOnboardingReminder(time.hour, time.minute)
      }
    } catch {
      // Onboarding must never dead-end on a preference write.
    } finally {
      leave()
    }
  }

  // Skip persists nothing but the seen-flag: no permission request, and
  // reminder/streak stay at their stored defaults regardless of the toggles.
  const skip = () => {
    if (committing) return
    leave()
  }

  const advance = () => {
    if (isLast) {
      void finish()
      return
    }
    const next = page + 1
    setPage(next)
    scroller.current?.scrollTo({ x: next * width, animated: !reduceMotion })
  }

  // Round rather than floor so a page is considered changed at the halfway
  // point; momentum-end alone can settle a pixel or two short of the boundary.
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width))
    if (next !== page) setPage(Math.min(Math.max(next, 0), CARD_COUNT - 1))
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {/* Top bar: progress dots left, Skip right. Skip is available on every
          card and behaves exactly like finishing. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: insets.top + t.spacing.sm,
          paddingHorizontal: t.spacing.xl,
          paddingBottom: t.spacing.sm,
        }}
      >
        <View
          style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}
          accessibilityRole="progressbar"
          accessibilityLabel={tx('a11y.progress', { current: page + 1, total: CARD_COUNT })}
        >
          {Array.from({ length: CARD_COUNT }, (_, i) => (
            <View
              key={i}
              style={{
                width: i === page ? 20 : 7,
                height: 7,
                borderRadius: t.radii.pill,
                backgroundColor: i === page ? t.colors.accent : t.colors.off,
              }}
            />
          ))}
        </View>

        <Pressable
          onPress={skip}
          accessibilityRole="button"
          accessibilityLabel={tx('skip')}
          hitSlop={8}
          style={({ pressed }) => [{ paddingVertical: t.spacing.xs }, pressed && { opacity: 0.6 }]}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.textAccent }}>
            {tx('skip')}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        // Both handlers, because a slow drag that settles with no momentum does
        // not reliably fire onMomentumScrollEnd on Android. onScrollEnd is
        // idempotent (it no-ops when the rounded page is unchanged), so the
        // overlap on a normal swipe costs nothing. The programmatic advance()
        // path needs neither — it sets `page` itself before scrolling.
        onScrollEndDrag={onScrollEnd}
        style={{ flex: 1 }}
      >
        <Card
          width={width}
          topInset={topInset}
          heading={tx('card1.heading')}
          body={tx('card1.body')}
          t={t}
          variant="title"
        />

        <Card width={width} topInset={topInset} heading={tx('card2.heading')} body={tx('card2.body')} t={t}>
          <View style={{ gap: t.spacing.md, marginTop: t.spacing.xs }}>
            {FEATURES.map((f) => (
              <FeatureRow
                key={f.key}
                icon={f.icon}
                label={tx(`card2.features.${f.key}`)}
                t={t}
              />
            ))}
          </View>
        </Card>

        <Card width={width} topInset={topInset} heading={tx('card3.heading')} body={tx('card3.body')} t={t}>
          {/* Two real settings, presented exactly as the Settings screen presents
              them (Card + ListRow + RN Switch + the same SF Symbol names), so
              what the user sets here looks identical to where they'll find it
              later. Nothing here writes: the values are local until "Get
              started". */}
          <SettingsCard style={{ marginTop: t.spacing.xs }}>
            <ListRow
              title={tx('card3.reminder')}
              leading={<RowIcon name="bell" t={t} />}
              // Not `isLast`: the time row below (or the streak row) follows.
              trailing={
                <Switch
                  value={reminderOn}
                  onValueChange={setReminderOn}
                  trackColor={{ true: t.colors.accent }}
                  accessibilityLabel={tx('card3.reminder')}
                />
              }
            />
            {/* HIDDEN, not disabled, when the reminder is off — matching
                SettingsScreen, which conditionally renders this same row. */}
            {reminderOn ? (
              <ListRow
                title={tx('a11y.reminderTime')}
                leading={<RowIcon name="clock" t={t} />}
                value={formatReminderTime(time.hour, time.minute, i18n.language)}
                chevron
                onPress={() => setTimeSheetOpen(true)}
                accessibilityLabel={tx('a11y.reminderTime')}
              />
            ) : null}
            <ListRow
              title={tx('card3.streak')}
              leading={<RowIcon name="flame.fill" t={t} />}
              isLast
              trailing={
                <Switch
                  value={streakOn}
                  onValueChange={setStreakOn}
                  trackColor={{ true: t.colors.accent }}
                  accessibilityLabel={tx('card3.streak')}
                />
              }
            />
          </SettingsCard>
        </Card>
      </ScrollView>

      {/* The Settings screen's own picker — iOS wheels in a formSheet, Android's
          native clock dialog. onConfirm updates the LOCAL draft only; the value
          reaches the scheduler via commitOnboardingReminder on "Get started". */}
      <ReminderTimeSheet
        visible={timeSheetOpen}
        hour={time.hour}
        minute={time.minute}
        onConfirm={(hour, minute) => setTime({ hour, minute })}
        onClose={() => setTimeSheetOpen(false)}
      />

      <View
        style={{
          paddingHorizontal: t.spacing.xl,
          paddingTop: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.lg,
        }}
      >
        <Pressable
          onPress={advance}
          disabled={committing}
          accessibilityRole="button"
          style={({ pressed }) => ({
            height: 50,
            borderRadius: t.radii.md,
            backgroundColor: t.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: committing ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontSize: 16.5, fontWeight: '700', color: t.colors.onAccent }}>
            {isLast ? tx('getStarted') : tx('continue')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
