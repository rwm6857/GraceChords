import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  isRtlBibleLanguage,
  resolveBibleTranslationSelection,
  sortedVerses,
  buildCopyText,
  formatPassageLabel,
  isVerseInRange,
  passageId,
  type BibleTranslation,
  type Passage,
} from '@gracechords/core'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Screen from '../components/Screen'
import SymbolIcon from '../components/SymbolIcon'
import GlassSurface from '../components/GlassSurface'
import EmptyState from '../components/EmptyState'
import ChapterSwipe from '../components/reader/ChapterSwipe'
import ReaderSettingsSheet from '../components/reader/ReaderSettingsSheet'
import VerseNumber from '../components/reader/VerseNumber'
import TranslationPickerSheet from '../components/reader/TranslationPickerSheet'
import DatePickerSheet from '../components/reader/DatePickerSheet'
import { useTheme } from '../theme/ThemeProvider'
import { expandReadings, getPassage, getPlanForDate } from '../lib/bibleSource'
import {
  defaultTranslationForLocale,
  setBibleTranslationPref,
  useBibleTranslationPref,
} from '../lib/bibleTranslationPref'
import { markReadToday, streakDateKey } from '../lib/readingStreak'
import { resolveInitialPassageIndex } from '../lib/readerPassage'
import { useBibleTranslations } from '../lib/useBibleTranslations'
import { useDailyHighlights } from '../lib/useDailyHighlights'
import {
  readerFontSize,
  readerLineHeight,
  setReaderSettings,
  useReaderSettings,
} from '../lib/readerSettings'
import { usePassageChapter } from '../lib/useReader'

type Sheet = 'none' | 'translations' | 'settings' | 'date'

// Copy FAB is 56px tall, floated at the same bottom offset as the ScrollView's
// tab-bar-clearance padding — without extra room the FAB overlaps the last
// verse instead of floating below it.
const COPY_FAB_CLEARANCE = 56 + 16

// Stable empty set for passages with no selection (never mutated).
const EMPTY_SELECTION: ReadonlySet<number> = new Set<number>()

// U+00A0. Glues a verse number to the word it introduces: line breaking is
// forbidden on either side of a no-break space, so the pair moves to the next
// line together rather than leaving the number dangling at a line end.
const NO_BREAK_SPACE = '\u00A0'

function formatDateLabel(d: Date, locale: string) {
  const now = new Date()
  const base = d.toLocaleDateString(locale, { month: 'long', day: 'numeric' })
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`
}

// `showBackToLanding` renders a back chevron to the Daily Word landing. It is
// true only when the Reader was PUSHED from the landing (app/daily/reader.tsx);
// as the Daily Word tab root (reader-direct mode) it is false and the layout is
// unchanged from before the landing existed.
//
// `initialPassageId` is a core `passageId()` naming which of today's readings to
// open on — set when a specific reading was tapped on the landing. An unknown or
// missing id falls back to the day's first passage.
export default function DailyWordScreen({
  showBackToLanding = false,
  initialPassageId,
}: { showBackToLanding?: boolean; initialPassageId?: string } = {}) {
  const t = useTheme()
  const router = useRouter()
  const { t: tx, i18n } = useTranslation('reader')
  // Native tabs float over the screen; this bottom inset includes the tab bar
  // height so the Copy FAB clears it (see FAB position below).
  const insets = useSafeAreaInsets()
  const { translations, groups, defaultTranslationId } = useBibleTranslations()

  const [date, setDate] = useState(() => new Date())
  const passages = useMemo(() => expandReadings(getPlanForDate(date).readings), [date])
  // Seeded synchronously (not in an effect) so a passage tapped on the landing
  // is the FIRST chapter fetched — no flash of the day's first reading.
  const [passageIndex, setPassageIndex] = useState(() =>
    resolveInitialPassageIndex(passages, initialPassageId),
  )
  // The user's explicit, persisted translation pick ('' = none yet).
  const storedTranslationId = useBibleTranslationPref()
  // Highlights persist per passage (keyed by passageId), stored to disk and
  // day-scoped, so switching chapters, copying, or a cold restart never clears
  // them — but a new day starts clean.
  const { selections: selectionsByPassage, toggleVerse } = useDailyHighlights()
  // Typography settings are DEVICE-PERSISTED (readerSettings.ts) — they are
  // readability preferences, so they survive closing the reader, a relaunch and
  // an app update.
  const settings = useReaderSettings()
  const [sheet, setSheet] = useState<Sheet>('none')
  const [reloadToken, setReloadToken] = useState(0)

  // Copy FAB press feedback: 0 = resting, 1 = pressed (scale-down + dim).
  const fabPress = useRef(new Animated.Value(0)).current

  const currentPassage: Passage | null = passages[passageIndex] || passages[0] || null

  // Resolve the active translation: a stored pick always wins; with no prior
  // choice, seed the default from the app locale (locale→translation is derived
  // from the manifest, so a future Turkish Bible is picked up automatically —
  // today a Turkish locale correctly falls through to ESV). App UI language and
  // Bible translation stay independent — the locale only seeds this default.
  const effectiveId = useMemo(() => {
    const seed = storedTranslationId || defaultTranslationForLocale(i18n.language, translations, defaultTranslationId)
    return resolveBibleTranslationSelection(seed, translations, defaultTranslationId)
  }, [storedTranslationId, i18n.language, translations, defaultTranslationId])
  const selectedTranslation: BibleTranslation | null =
    translations.find((x) => x.id === effectiveId) || translations[0] || null
  const translationLabel = selectedTranslation?.label || tx('defaultTranslationLabel')
  const rtl = isRtlBibleLanguage(selectedTranslation?.language)

  const { chapter, loading, error } = usePassageChapter(currentPassage, selectedTranslation, reloadToken)

  const passageKey = currentPassage ? passageId(currentPassage) : ''
  const selection = (passageKey ? selectionsByPassage[passageKey] : undefined) || EMPTY_SELECTION

  // Per-chip scroll memory. Every passage chip keeps its OWN scroll position for
  // as long as the reader is open: chips start at the top, and coming back to
  // one returns you to where you left it instead of to wherever the previous
  // chapter happened to be scrolled.
  //
  // Refs, not state — writing an offset must never re-render the reading — and
  // deliberately screen-scoped: closing the reader unmounts this and every chip
  // starts at the top again, which is the specified behaviour.
  const scrollRef = useRef<ScrollView>(null)
  const scrollOffsets = useRef<Record<string, number>>({})
  // True between a passage change and the moment its saved offset is applied.
  // While it is set, onScroll events belong to the restore (or to the fresh
  // ScrollView settling at 0) and must not overwrite what we are about to
  // restore.
  const restoringScroll = useRef(true)
  useEffect(() => {
    restoringScroll.current = true
  }, [passageKey])
  const rememberScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (restoringScroll.current || !passageKey) return
      scrollOffsets.current[passageKey] = e.nativeEvent.contentOffset.y
    },
    [passageKey],
  )

  const versesInScope = useMemo(() => {
    if (!chapter || !currentPassage) return []
    return Object.keys(chapter.verses)
      .map((n) => Number(n))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b)
      .filter((n) => isVerseInRange(n, currentPassage))
      .map((n) => ({ num: n, text: chapter.verses[String(n)] }))
  }, [chapter, currentPassage])

  // A new day starts on its first passage. Highlights are keyed by passage, so
  // they survive date/chapter switches without being cleared here. The mount run
  // is skipped so it can't stomp on the `initialPassageId` seed above.
  const dateSettled = useRef(false)
  useEffect(() => {
    if (!dateSettled.current) {
      dateSettled.current = true
      return
    }
    setPassageIndex(0)
  }, [date])

  // Reading streak: an opted-in user "reads" a day by loading any of TODAY's
  // passages (browsing past dates doesn't count). Idempotent per day and a
  // no-op while the streak is off.
  useEffect(() => {
    if (chapter && streakDateKey(date) === streakDateKey(new Date())) markReadToday()
  }, [chapter, date])

  const changePassage = useCallback(
    (next: number) => {
      if (next < 0 || next >= passages.length) return
      setPassageIndex((current) => (next === current ? current : next))
    },
    [passages.length],
  )
  const goNext = useCallback(() => changePassage(passageIndex + 1), [changePassage, passageIndex])
  const goPrev = useCallback(() => changePassage(passageIndex - 1), [changePassage, passageIndex])

  // Warm the chapters on either side so a committed swipe lands on real text
  // instead of a spinner. `prefetchToday` only covers today in the DEFAULT
  // translation; this covers whatever date/translation is actually open. Cached
  // and in-flight chapters de-dupe inside `getPassage`, so this is cheap.
  useEffect(() => {
    if (!selectedTranslation) return
    for (const neighbour of [passages[passageIndex - 1], passages[passageIndex + 1]]) {
      if (neighbour) getPassage({ passage: neighbour, translation: selectedTranslation }).catch(() => {})
    }
  }, [passages, passageIndex, selectedTranslation])

  // Identifies exactly what the reading area is showing: the passage, the
  // translation, and which of the four branches below is rendered. ChapterSwipe
  // replays its entrance on every change, so each distinct view arrives with an
  // animation (a settled one never re-animates) — this is what makes a chapter
  // land with a fade whether it came from a swipe, a chip, or a first load.
  const view = loading
    ? 'loading'
    : error
      ? 'error'
      : versesInScope.length === 0
        ? 'empty'
        : 'verses'
  const contentKey = `${passageKey}|${selectedTranslation?.id ?? ''}|${view}`

  // Copy only the current chapter's selected verses; leave the highlights in
  // place so they persist through the day.
  async function onCopy() {
    if (!chapter || !currentPassage || selection.size === 0) return
    const text = buildCopyText(currentPassage, sortedVerses(selection), chapter.verses, translationLabel)
    if (!text) return
    await Clipboard.setStringAsync(text)
    Haptics.selectionAsync().catch(() => {})
  }

  const fontSize = readerFontSize(settings.pt)
  const lineHeight = readerLineHeight(settings.pt, settings.lineSpacing)
  const fontFamily = settings.typeface === 'serif' ? 'Georgia' : undefined
  const readingBase = {
    fontSize,
    lineHeight,
    fontFamily,
    color: t.colors.ink,
    textAlign: (rtl ? 'right' : 'left') as 'right' | 'left',
    writingDirection: (rtl ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
  }

  function toggle(num: number) {
    toggleVerse(passageKey, num)
  }

  // Copy FAB — appears while a selection exists (no count badge). Handed to
  // ChapterSwipe as its overlay so it stays put while the reading slides.
  const copyFab =
    selection.size > 0 ? (
      <Animated.View
        style={{
          position: 'absolute',
          bottom: insets.bottom + t.spacing.xl,
          [rtl ? 'left' : 'right']: t.spacing.lg,
          opacity: fabPress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] }),
          transform: [
            { scale: fabPress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) },
          ],
        }}
      >
        <Pressable
          onPress={onCopy}
          onPressIn={() =>
            Animated.timing(fabPress, { toValue: 1, duration: 90, useNativeDriver: true }).start()
          }
          onPressOut={() => Animated.spring(fabPress, { toValue: 0, useNativeDriver: true }).start()}
          accessibilityRole="button"
          accessibilityLabel={tx('copyVerses', { count: selection.size })}
          style={{ borderRadius: t.radii.pill }}
        >
          {/* Liquid Glass on iOS 26 (accent-tinted); solid accent fill on
              iOS < 26 and Android via GlassSurface's fallback. */}
          <GlassSurface
            isInteractive
            glassTint={t.colors.accent}
            fallbackColor={t.colors.accent}
            style={{
              width: 56,
              height: 56,
              borderRadius: t.radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: t.colors.accent,
              shadowOpacity: 0.45,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 8,
            }}
          >
            <SymbolIcon name="doc.on.doc" size={23} color={t.colors.onAccent} />
          </GlassSurface>
        </Pressable>
      </Animated.View>
    ) : null

  const controlButton = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: t.colors.surfaceAlt,
    borderRadius: t.radii.sm,
    paddingVertical: 8,
    paddingHorizontal: 11,
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      {/* Back to the landing — only when reached via it (pushed reader route).
          Absent in reader-direct mode, so that layout is unchanged. */}
      {showBackToLanding ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: t.spacing.lg,
            paddingBottom: t.spacing.sm,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={tx('backToLanding')}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
          >
            <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
            <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.textAccent }}>
              {tx('landingTitle')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Control bar: translation · date · text options */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          paddingHorizontal: t.spacing.lg,
          paddingBottom: t.spacing.sm,
        }}
      >
        <View style={{ flex: 1, alignItems: 'flex-start' }}>
          <Pressable
            onPress={() => setSheet('translations')}
            accessibilityRole="button"
            accessibilityLabel={tx('chooseTranslation')}
            style={controlButton}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: t.colors.ink }}>
              {translationLabel}
            </Text>
            <SymbolIcon name="chevron.down" size={11} color={t.colors.sec} weight="semibold" />
          </Pressable>
        </View>

        <Pressable
          onPress={() => setSheet('date')}
          accessibilityRole="button"
          accessibilityLabel={tx('chooseDate')}
          style={controlButton}
        >
          <SymbolIcon name="calendar" size={15} color={t.colors.sec} />
          <Text style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: t.colors.ink }}>
            {formatDateLabel(date, i18n.language)}
          </Text>
        </Pressable>

        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Pressable
            onPress={() => setSheet('settings')}
            accessibilityRole="button"
            accessibilityLabel={tx('readerSettings')}
            hitSlop={8}
            style={controlButton}
          >
            <SymbolIcon name="textformat" size={18} color={t.colors.accent} weight="medium" />
          </Pressable>
        </View>
      </View>

      {/* Chapter chips */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            gap: t.spacing.sm,
            paddingHorizontal: t.spacing.lg,
            paddingBottom: t.spacing.md,
          }}
        >
          {passages.map((p, i) => {
            const active = i === passageIndex
            return (
              <Pressable
                key={`${p.bookNumber}-${p.chapter}-${i}`}
                onPress={() => changePassage(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  paddingVertical: 7,
                  paddingHorizontal: 14,
                  borderRadius: t.radii.pill,
                  backgroundColor: active ? t.colors.accentSoft : t.colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: active ? t.colors.accent : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    letterSpacing: -0.2,
                    color: active ? t.colors.textAccent : t.colors.sec,
                  }}
                >
                  {formatPassageLabel(p)}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {/* Reading area. ChapterSwipe owns the horizontal drag (page tracks the
          finger, edge chevron arms at the threshold, release commits) and the
          entrance animation for every content change. Its moving layer wraps
          every state, so an animation never targets an unmounted node; the copy
          FAB goes in `overlay`, outside that layer, so it neither slides nor
          fades with the reading. */}
      <ChapterSwipe
        contentKey={contentKey}
        canGoNext={passageIndex < passages.length - 1}
        canGoPrev={passageIndex > 0}
        onGoNext={goNext}
        onGoPrev={goPrev}
        rtl={rtl}
        overlay={copyFab}
      >
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : error ? (
          <EmptyState
            icon="wifi.slash"
            title={tx('error.title')}
            subtitle={tx('error.subtitle')}
            actionLabel={tx('error.retry')}
            onAction={() => setReloadToken((n) => n + 1)}
          />
        ) : versesInScope.length === 0 ? (
          <EmptyState icon="book.closed" title={tx('empty.title')} subtitle={tx('empty.subtitle')} />
        ) : (
          <ScrollView
            // Remount per passage so a chapter never inherits the previous
            // one's offset, then put back whatever this chip was left at.
            key={passageKey}
            ref={scrollRef}
            scrollEventThrottle={32}
            onScroll={rememberScroll}
            // onScroll is throttled, so it can miss the resting offset by a few
            // points; these two fire at rest and pin the exact value.
            onScrollEndDrag={rememberScroll}
            onMomentumScrollEnd={rememberScroll}
            // A drag is unambiguously the user, so it also ends any restore
            // still armed — a chapter that somehow never reports a content size
            // must not swallow scrolling for the rest of the session.
            onScrollBeginDrag={() => {
              restoringScroll.current = false
            }}
            // The earliest point at which the content is tall enough to scroll
            // to. Fires again as the content grows (e.g. the copy FAB's extra
            // bottom padding), which is why the restore is armed once per
            // passage change rather than on every call. scrollTo clamps, so a
            // saved offset from a longer chapter can't strand the view.
            onContentSizeChange={() => {
              if (!restoringScroll.current) return
              restoringScroll.current = false
              const y = passageKey ? (scrollOffsets.current[passageKey] ?? 0) : 0
              if (y > 0) scrollRef.current?.scrollTo({ y, animated: false })
            }}
            contentContainerStyle={{
              paddingHorizontal: 18,
              paddingTop: t.spacing.xs,
              // Clear the floating native tab bar (insets.bottom includes its
              // height under native tabs) so the last verse scrolls fully above
              // it, plus the copy FAB's own height while a selection is active.
              paddingBottom: insets.bottom + t.spacing.xl + (selection.size > 0 ? COPY_FAB_CLEARANCE : 0),
            }}
          >
              {settings.layout === 'prose' ? (
                <Text style={readingBase}>
                  {versesInScope.map(({ num, text }) => {
                    const isSel = selection.has(num)
                    return (
                      <Text key={num} onPress={() => toggle(num)}>
                        <VerseNumber
                          num={num}
                          fontSize={fontSize}
                          color={t.colors.textAccent}
                          fontFamily={fontFamily}
                        />
                        {/* The numeral is joined to the verse's first word by a
                            NO-BREAK SPACE, so the two wrap as one unit. Without
                            it, prose at larger sizes regularly stranded a verse
                            number alone at the end of a line — the number now
                            moves down to the next line with its text.

                            The highlight starts here rather than at the numeral:
                            the numeral is an inline view (see VerseNumber), and
                            an inline view takes no text background, so keeping it
                            inside the highlighted run would punch a hole in the
                            tint. */}
                        <Text
                          style={{
                            backgroundColor: isSel ? t.colors.accentSoft : 'transparent',
                            textDecorationLine: isSel ? 'underline' : 'none',
                            textDecorationColor: t.colors.accent,
                          }}
                        >
                          {NO_BREAK_SPACE}
                          {text}
                        </Text>
                        {/* Verse separator — a normal, breakable space, and
                            outside the highlight so a selection ends on its own
                            last word. */}
                        {' '}
                      </Text>
                    )
                  })}
                </Text>
              ) : (
                versesInScope.map(({ num, text }) => {
                  const isSel = selection.has(num)
                  return (
                    <Pressable
                      key={num}
                      onPress={() => toggle(num)}
                      style={{
                        paddingVertical: 3,
                        paddingHorizontal: 10,
                        marginHorizontal: -10,
                        marginBottom: 2,
                        borderRadius: 8,
                        backgroundColor: isSel ? t.colors.accentSoft : 'transparent',
                      }}
                    >
                      <Text style={readingBase}>
                        <VerseNumber
                          num={num}
                          fontSize={fontSize}
                          color={t.colors.textAccent}
                          fontFamily={fontFamily}
                        />
                        <Text
                          style={{
                            textDecorationLine: isSel ? 'underline' : 'none',
                            textDecorationColor: t.colors.accent,
                          }}
                        >
                          {NO_BREAK_SPACE}
                          {text}
                        </Text>
                      </Text>
                    </Pressable>
                  )
                })
              )}
          </ScrollView>
        )}
      </ChapterSwipe>

      <TranslationPickerSheet
        visible={sheet === 'translations'}
        onClose={() => setSheet('none')}
        groups={groups}
        selectedId={effectiveId}
        onSelect={(item) => {
          setBibleTranslationPref(item.id)
          setSheet('none')
        }}
      />
      <ReaderSettingsSheet
        visible={sheet === 'settings'}
        onClose={() => setSheet('none')}
        settings={settings}
        onChange={setReaderSettings}
      />
      <DatePickerSheet
        visible={sheet === 'date'}
        onClose={() => setSheet('none')}
        value={date}
        onSelect={(next) => {
          setDate(next)
          setSheet('none')
        }}
      />
    </Screen>
  )
}
