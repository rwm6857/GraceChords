import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import {
  isRtlBibleLanguage,
  resolveBibleTranslationSelection,
  sortedVerses,
  buildCopyText,
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
import ReaderSettingsSheet from '../components/reader/ReaderSettingsSheet'
import TranslationPickerSheet from '../components/reader/TranslationPickerSheet'
import DatePickerSheet from '../components/reader/DatePickerSheet'
import { useTheme } from '../theme/ThemeProvider'
import { expandReadings, getPlanForDate } from '../lib/bibleSource'
import { markReadToday, streakDateKey } from '../lib/readingStreak'
import { useBibleTranslations } from '../lib/useBibleTranslations'
import { useDailyHighlights } from '../lib/useDailyHighlights'
import {
  defaultReaderSettings,
  readerFontSize,
  readerLineHeight,
  usePassageChapter,
  type ReaderSettings,
} from '../lib/useReader'

type Sheet = 'none' | 'translations' | 'settings' | 'date'

// Stable empty set for passages with no selection (never mutated).
const EMPTY_SELECTION: ReadonlySet<number> = new Set<number>()

function formatDateLabel(d: Date) {
  const now = new Date()
  const base = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`
}

function chipLabel(passage: Passage) {
  const head = `${passage.book} ${passage.chapter}`
  if (!passage.range) return head
  const { start, end } = passage.range
  if (end === null) return `${head}:${start}-`
  if (start === end) return `${head}:${start}`
  return `${head}:${start}-${end}`
}

export default function DailyWordScreen() {
  const t = useTheme()
  // Native tabs float over the screen; this bottom inset includes the tab bar
  // height so the Copy FAB clears it (see FAB position below).
  const insets = useSafeAreaInsets()
  const { translations, groups, defaultTranslationId } = useBibleTranslations()

  const [date, setDate] = useState(() => new Date())
  const [passageIndex, setPassageIndex] = useState(0)
  const [selectedId, setSelectedId] = useState('')
  // Highlights persist per passage (keyed by passageId), stored to disk and
  // day-scoped, so switching chapters, copying, or a cold restart never clears
  // them — but a new day starts clean.
  const { selections: selectionsByPassage, toggleVerse } = useDailyHighlights()
  const [settings, setSettings] = useState<ReaderSettings>(defaultReaderSettings)
  const [sheet, setSheet] = useState<Sheet>('none')
  const [reloadToken, setReloadToken] = useState(0)

  const fade = useRef(new Animated.Value(1)).current
  // Copy FAB press feedback: 0 = resting, 1 = pressed (scale-down + dim).
  const fabPress = useRef(new Animated.Value(0)).current

  const passages = useMemo(() => expandReadings(getPlanForDate(date).readings), [date])
  const currentPassage: Passage | null = passages[passageIndex] || passages[0] || null

  // Resolve a valid translation even before the user picks one.
  const effectiveId = useMemo(
    () => resolveBibleTranslationSelection(selectedId, translations, defaultTranslationId),
    [selectedId, translations, defaultTranslationId]
  )
  const selectedTranslation: BibleTranslation | null =
    translations.find((x) => x.id === effectiveId) || translations[0] || null
  const translationLabel = selectedTranslation?.label || 'ESV'
  const rtl = isRtlBibleLanguage(selectedTranslation?.language)

  const { chapter, loading, error } = usePassageChapter(currentPassage, selectedTranslation, reloadToken)

  const passageKey = currentPassage ? passageId(currentPassage) : ''
  const selection = (passageKey ? selectionsByPassage[passageKey] : undefined) || EMPTY_SELECTION

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
  // they survive date/chapter switches without being cleared here.
  useEffect(() => {
    setPassageIndex(0)
  }, [date])

  // Reading streak: an opted-in user "reads" a day by loading any of TODAY's
  // passages (browsing past dates doesn't count). Idempotent per day and a
  // no-op while the streak is off.
  useEffect(() => {
    if (chapter && streakDateKey(date) === streakDateKey(new Date())) markReadToday()
  }, [chapter, date])

  // Fade the reading region in whenever new chapter content arrives (chapter
  // switch, translation switch, or first load). The Animated.View is persistent
  // (wraps every state), so the animation never targets an unmounted node.
  useEffect(() => {
    if (!chapter) return
    fade.setValue(0)
    Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start()
  }, [chapter, fade])

  function changePassage(next: number) {
    if (next < 0 || next >= passages.length || next === passageIndex) return
    setPassageIndex(next)
  }

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) < 50) return
        const forward = g.dx < 0 ? 1 : -1
        const dir = rtlRef.current ? -forward : forward
        changePassageRef.current(indexRef.current + dir)
      },
    })
  ).current
  // Keep the PanResponder (created once) reading current values.
  const rtlRef = useRef(rtl)
  rtlRef.current = rtl
  const indexRef = useRef(passageIndex)
  indexRef.current = passageIndex
  const changePassageRef = useRef(changePassage)
  changePassageRef.current = changePassage

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
  const numStyle = { fontSize: Math.round(fontSize * 0.72), fontWeight: '700' as const, color: t.colors.accent }
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
      {/* Control bar: translation · date · Aa */}
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
            accessibilityLabel="Choose translation"
            style={controlButton}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: t.colors.ink }}>
              {translationLabel}
            </Text>
            <SymbolIcon name="chevron.down" size={11} color={t.colors.muted} weight="semibold" />
          </Pressable>
        </View>

        <Pressable
          onPress={() => setSheet('date')}
          accessibilityRole="button"
          accessibilityLabel="Choose date"
          style={controlButton}
        >
          <SymbolIcon name="calendar" size={15} color={t.colors.muted} />
          <Text style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: t.colors.ink }}>
            {formatDateLabel(date)}
          </Text>
        </Pressable>

        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Pressable
            onPress={() => setSheet('settings')}
            accessibilityRole="button"
            accessibilityLabel="Reader settings"
            style={[controlButton, { paddingHorizontal: 12 }]}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.accent }}>A</Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: t.colors.accent, marginLeft: -3 }}>a</Text>
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
                  {chipLabel(p)}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {/* Reading area — one persistent Animated.View wraps every state so the
          fade never targets an unmounted node. */}
      <Animated.View style={{ flex: 1, opacity: fade }} {...pan.panHandlers}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : error ? (
          <EmptyState
            icon="wifi.slash"
            title="Can't load today's reading"
            subtitle="Connect to the internet and try again, or download this translation in Settings → Offline & Downloads to read it offline."
            actionLabel="Retry"
            onAction={() => setReloadToken((n) => n + 1)}
          />
        ) : versesInScope.length === 0 ? (
          <EmptyState icon="book.closed" title="No reading for this day" subtitle="Pick another date to keep reading." />
        ) : (
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 18,
              paddingTop: t.spacing.xs,
              // Clear the floating native tab bar (insets.bottom includes its
              // height under native tabs) so the last verse scrolls fully above it.
              paddingBottom: insets.bottom + t.spacing.xl,
            }}
          >
              {settings.layout === 'prose' ? (
                <Text style={readingBase}>
                  {versesInScope.map(({ num, text }) => {
                    const isSel = selection.has(num)
                    return (
                      <Text
                        key={num}
                        onPress={() => toggle(num)}
                        style={{ backgroundColor: isSel ? t.colors.accentSoft : 'transparent' }}
                      >
                        <Text style={numStyle}>{num} </Text>
                        <Text
                          style={{
                            textDecorationLine: isSel ? 'underline' : 'none',
                            textDecorationColor: t.colors.accent,
                          }}
                        >
                          {text}{' '}
                        </Text>
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
                        <Text style={numStyle}>{num} </Text>
                        <Text
                          style={{
                            textDecorationLine: isSel ? 'underline' : 'none',
                            textDecorationColor: t.colors.accent,
                          }}
                        >
                          {text}
                        </Text>
                      </Text>
                    </Pressable>
                  )
                })
              )}
          </ScrollView>
        )}

        {/* Copy FAB — appears while a selection exists (no count badge). */}
        {selection.size > 0 ? (
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
              onPressOut={() =>
                Animated.spring(fabPress, { toValue: 0, useNativeDriver: true }).start()
              }
              accessibilityRole="button"
              accessibilityLabel={`Copy ${selection.size} verse${selection.size === 1 ? '' : 's'}`}
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
        ) : null}
      </Animated.View>

      <TranslationPickerSheet
        visible={sheet === 'translations'}
        onClose={() => setSheet('none')}
        groups={groups}
        selectedId={effectiveId}
        onSelect={(item) => {
          setSelectedId(item.id)
          setSheet('none')
        }}
      />
      <ReaderSettingsSheet
        visible={sheet === 'settings'}
        onClose={() => setSheet('none')}
        settings={settings}
        onChange={setSettings}
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
