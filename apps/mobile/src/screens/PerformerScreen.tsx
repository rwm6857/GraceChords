import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import * as Clipboard from 'expo-clipboard'
import * as Sharing from 'expo-sharing'
import type { SongDoc } from '@gracechords/core'
import {
  effectiveKey as computeEffectiveKey,
  formatKeyDisplay,
  parseChordProOrLegacy,
  stepsBetween,
  transposeSymPrefer,
} from '@gracechords/core'
import ChordChart, { type ChordStyle } from '../components/ChordChart'
import Screen from '../components/Screen'
import StarButton from '../components/StarButton'
import SymbolIcon from '../components/SymbolIcon'
import TransposeBar from '../components/TransposeBar'
import ViewOptionsSheet, {
  type Accidental,
  resolvePreferFlat,
} from '../components/ViewOptionsSheet'
import PerformerShareSheet, {
  type PerformerShareHandlers,
} from '../components/setlist/PerformerShareSheet'
import { useTheme } from '../theme/ThemeProvider'
import { useSetlistBuilder } from '../lib/useSetlistBuilder'
import { prefetchSong, useSong } from '../lib/useSong'
import { useAutoHideChrome, useAutoHidePref } from '../lib/autoHideChrome'
import { exportSetlist, exportSong } from '../lib/exportSong'
import { buildSetlistShareUrl } from '../lib/setlistShare'
import {
  pushSetToTelegram,
  pushSongToTelegram,
  TELEGRAM_BOT_URL,
} from '../lib/telegramPush'

const TRANSPOSE_BAR_CLEARANCE = 120
const SWIPE_THRESHOLD = 50

// Setlist Viewer / Performer Mode: runs the set one song at a time. Reuses the
// Song Viewer's chart + transpose + view-options pieces (transpose is
// session-ephemeral here too — it seeds from each entry's setlist key but is
// never written back). Navigation is Prev/Next, horizontal swipe, and a
// tappable progress rail, all sliding between songs.
export default function PerformerScreen({ setlistId }: { setlistId: string }) {
  const t = useTheme()
  const router = useRouter()

  // Read-only reuse of the builder hook for the ordered entries + song
  // metadata. We never mutate here, so its autosave stays idle.
  const { name, items, loading: setLoading, notFound, error: setError } = useSetlistBuilder(setlistId)

  const [index, setIndex] = useState(0)
  const entry = items[index]
  const { song, loading: songLoading, error: songError } = useSong(entry?.song.slug)

  // useSong keeps the previous song while the next slug loads, so guard every
  // render on the loaded song actually being this entry's song. Until it
  // matches, treat the chart as still loading (no stale flash / mistranspose).
  const songReady = !!(song && entry && song.slug === entry.song.slug)

  const { doc, parseError } = useMemo<{ doc: SongDoc | null; parseError: boolean }>(() => {
    if (!songReady || !song?.chordpro_content) return { doc: null, parseError: false }
    try {
      return { doc: parseChordProOrLegacy(song.chordpro_content), parseError: false }
    } catch {
      return { doc: null, parseError: true }
    }
  }, [songReady, song])

  // Each entry's setlist key (override ?? native). Used to seed transpose and
  // to key the whole-set export/share payloads.
  const entryKeys = useMemo(
    () => items.map((it) => computeEffectiveKey(it, it.song)),
    [items],
  )

  // Prefetch every song's chart body in the background so Prev/Next/rail jumps
  // render instantly (the current song is fetched on demand by useSong below).
  useEffect(() => {
    for (const it of items) prefetchSong(it.song.slug)
  }, [items])

  // Transpose — ephemeral, reset on song change. nativeKey comes from the
  // entry's own catalog metadata (always current, unlike the loading `song`).
  const [delta, setDelta] = useState(0)
  // View options — session-ephemeral.
  const [showChords, setShowChords] = useState(true)
  const [showSections, setShowSections] = useState(true)
  const [fontScale, setFontScale] = useState(1)
  const [chordStyle, setChordStyle] = useState<ChordStyle>('letters')
  const [accidental, setAccidental] = useState<Accidental>('auto')
  const [sheet, setSheet] = useState<null | 'options' | 'share'>(null)
  // Floating-overlay header height → chart top inset (edge-to-edge).
  const [headerH, setHeaderH] = useState(0)

  const nativeKey = doc?.meta?.key || entry?.song.default_key || ''
  const targetKey = entryKeys[index] || nativeKey
  const seedSteps = targetKey ? stepsBetween(nativeKey, targetKey) : 0
  const steps = (((seedSteps + delta) % 12) + 12) % 12
  const preferFlat = resolvePreferFlat(accidental, nativeKey)
  const effectiveKey = steps ? transposeSymPrefer(nativeKey, steps, preferFlat) : nativeKey

  // Chrome auto-hide (persisted). Pinned visible while a sheet is open; tap the
  // chart, change songs, or use the transpose bar to bring it back.
  const [autoHide, setAutoHide] = useAutoHidePref()
  // Arm only when a chart is on screen (tap-to-reveal lives on the chart) and
  // no sheet is open, so chrome can't hide behind a spinner or a sheet.
  const { visible: chromeVisible, opacity: chromeOpacity, reveal } = useAutoHideChrome(
    autoHide && sheet === null && songReady,
  )

  // Slide transition between songs (reanimated).
  const slideX = useSharedValue(0)
  const slideOpacity = useSharedValue(1)
  const chartAnim = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
    opacity: slideOpacity.value,
  }))

  const count = items.length

  function goTo(next: number, dir: 'next' | 'prev') {
    if (next < 0 || next >= count || next === index) return
    setSheet(null)
    setDelta(0)
    reveal()
    slideX.value = dir === 'next' ? 26 : -26
    slideOpacity.value = 0.15
    setIndex(next)
    slideX.value = withTiming(0, { duration: 260 })
    slideOpacity.value = withTiming(1, { duration: 240 })
    Haptics.selectionAsync().catch(() => {})
  }

  const goNext = () => goTo(index + 1, 'next')
  const goPrev = () => goTo(index - 1, 'prev')

  const transposeBy = (dir: 1 | -1) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    reveal()
    setDelta((d) => d + dir)
  }

  // Horizontal swipe to change songs. activeOffsetX/failOffsetY keep it from
  // fighting vertical scroll; the ~50px threshold + horizontal-dominance check
  // mirror the reference.
  const swipe = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .failOffsetY([-24, 24])
    .onEnd((e) => {
      const dx = e.translationX
      const dy = e.translationY
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) + 8) {
        if (dx < 0) runOnJS(goNext)()
        else runOnJS(goPrev)()
      }
    })

  // A quick tap on the chart reveals hidden chrome (and resets the idle
  // timer); it races the swipe so a drag still changes songs.
  const tapReveal = Gesture.Tap().onEnd(() => runOnJS(reveal)())
  const chartGesture = Gesture.Race(swipe, tapReveal)

  // Use the entry's catalog metadata for the header so it tracks the current
  // song immediately, not the still-loading `song`.
  const displayTitle = entry?.song.title || ''
  const displayArtist = entry?.song.artist ?? ''
  const keyLabel = effectiveKey ? formatKeyDisplay(effectiveKey, chordStyle) : ''
  // The song-scope export key is whatever the performer is currently viewing:
  // '' (native) when not transposed away from native, else the displayed key.
  // This matches the on-screen chart even after transposing back to native.
  const exportKey = effectiveKey && effectiveKey !== nativeKey ? effectiveKey : ''

  // --- Export / share handlers (screen owns errors) ------------------------
  function reportError(title: string, err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'not_signed_in') Alert.alert('Sign in required', 'Sign in to export.')
    else if (msg === 'image_unavailable') {
      Alert.alert('Image unavailable', 'The server could not render an image. Try PDF instead.')
    } else Alert.alert(title, msg)
  }

  const shareSongFile = async (format: 'pdf' | 'jpg') => {
    if (!entry) return
    const uri = await exportSong({ songId: entry.songId, key: exportKey, format })
    await Sharing.shareAsync(uri)
  }

  async function notLinkedAlert() {
    Alert.alert(
      'Link your Telegram',
      'Send /link to the GraceChords bot on Telegram, then connect it from your profile on the website.',
      [
        { text: 'Open Telegram', onPress: () => Linking.openURL(TELEGRAM_BOT_URL) },
        { text: 'Not now', style: 'cancel' },
      ],
    )
  }

  const shareHandlers: PerformerShareHandlers = {
    onShareSong: async () => {
      try {
        await shareSongFile('pdf')
        setSheet(null)
      } catch (err) {
        reportError('Share failed', err)
      }
    },
    onExportSong: async (format) => {
      try {
        await shareSongFile(format)
        setSheet(null)
      } catch (err) {
        reportError('Export failed', err)
      }
    },
    onTelegramSong: async () => {
      if (!entry) return
      try {
        const result = await pushSongToTelegram({ songId: entry.songId, key: exportKey })
        if (result === 'not_linked') return notLinkedAlert()
        setSheet(null)
        Alert.alert('Sent', 'The chart is on its way to your Telegram chat.')
      } catch (err) {
        reportError('Telegram failed', err)
      }
    },
    onExportSet: async () => {
      try {
        const uri = await exportSetlist(
          items.map((it, i) => ({ songId: it.songId, key: entryKeys[i] })),
        )
        await Sharing.shareAsync(uri)
        setSheet(null)
      } catch (err) {
        reportError('Export failed', err)
      }
    },
    onCopyLink: async () => {
      try {
        await Clipboard.setStringAsync(buildSetlistShareUrl(items))
        setSheet(null)
        Alert.alert('Copied', 'Set link copied to the clipboard.')
      } catch (err) {
        reportError('Could not copy link', err)
      }
    },
    onTelegramSet: async () => {
      try {
        const result = await pushSetToTelegram(
          items.map((it, i) => ({ songId: it.songId, key: entryKeys[i] })),
        )
        if (result === 'not_linked') return notLinkedAlert()
        setSheet(null)
        Alert.alert('Sent', 'The set is on its way to your Telegram chat.')
      } catch (err) {
        reportError('Telegram failed', err)
      }
    },
  }

  const headerButtonStyle = {
    width: 40,
    height: 40,
    borderRadius: t.radii.pill,
    backgroundColor: t.colors.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }

  const navButtonStyle = (disabled: boolean) => ({
    width: 50,
    height: 50,
    borderRadius: t.radii.pill,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    opacity: disabled ? 0.4 : 1,
  })

  if (notFound) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl }}>
          <Text style={{ fontSize: t.typography.body.fontSize, color: t.colors.muted }}>
            This setlist no longer exists.
          </Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      {/* Header — floating overlay so the chart runs edge-to-edge; auto-hides
          with the rest of the chrome. */}
      <RNAnimated.View
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
        pointerEvents={chromeVisible ? 'auto' : 'none'}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          opacity: chromeOpacity,
          backgroundColor: t.colors.bg,
          paddingHorizontal: t.spacing.lg,
          paddingTop: t.spacing.sm,
          paddingBottom: t.spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to setlist"
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
          >
            <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
            <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent, maxWidth: 160 }}>
              {name || 'Setlist'}
            </Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
            <Pressable
              onPress={() => setSheet('options')}
              accessibilityRole="button"
              accessibilityLabel="View options"
              style={headerButtonStyle}
            >
              <SymbolIcon name="ellipsis" size={17} color={t.colors.ink} />
            </Pressable>
            <Pressable
              onPress={() => setSheet('share')}
              accessibilityRole="button"
              accessibilityLabel="Export and share"
              style={headerButtonStyle}
            >
              <SymbolIcon name="square.and.arrow.up" size={17} color={t.colors.ink} />
            </Pressable>
          </View>
        </View>

        {/* Progress rail (multi-song only) */}
        {count > 1 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: t.spacing.md }}>
            {items.map((it, i) => {
              const isCurrent = i === index
              const isPast = i < index
              return (
                <Pressable
                  key={it.entryKey}
                  onPress={() => goTo(i, i > index ? 'next' : 'prev')}
                  accessibilityRole="button"
                  accessibilityLabel={`Go to song ${i + 1}`}
                  hitSlop={{ top: 10, bottom: 10 }}
                  style={{ flex: isCurrent ? 1.6 : 1 }}
                >
                  <View
                    style={{
                      height: 4,
                      borderRadius: 2,
                      // Done = faded accent, current = lit accent, upcoming = empty.
                      backgroundColor: isCurrent
                        ? t.colors.accent
                        : isPast
                          ? t.colors.accentSoft
                          : t.colors.surfaceAlt,
                    }}
                  />
                </Pressable>
              )
            })}
          </View>
        ) : null}

        {/* Title (+ favorite) + artist + key */}
        <View style={{ marginTop: t.spacing.md, flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontSize: t.typography.largeTitle.fontSize,
              fontWeight: t.typography.largeTitle.fontWeight,
              letterSpacing: t.typography.largeTitle.letterSpacing,
              color: t.colors.ink,
            }}
          >
            {displayTitle}
          </Text>
          <StarButton songId={entry?.song.id} />
        </View>
        <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          {displayArtist ? (
            <Text style={{ fontSize: 13.5, color: t.colors.sec }}>{displayArtist}</Text>
          ) : null}
          {displayArtist && keyLabel ? (
            <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: t.colors.muted }} />
          ) : null}
          {keyLabel ? (
            <View
              style={{
                backgroundColor: t.colors.accentSoft,
                borderRadius: t.radii.pill,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.textAccent }}>
                Key of {keyLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </RNAnimated.View>

      {/* Chart area */}
      {setLoading || songLoading || (entry && !songReady && !songError) ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.colors.accent} />
        </View>
      ) : setError || songError || !entry ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl }}>
          <Text style={{ fontSize: t.typography.body.fontSize, fontWeight: '600', color: t.colors.ink }}>
            {!entry ? 'This set has no songs' : "Couldn't load song"}
          </Text>
          {setError || songError ? (
            <Text style={{ marginTop: t.spacing.sm, fontSize: 13.5, color: t.colors.muted, textAlign: 'center' }}>
              {setError || songError}
            </Text>
          ) : null}
        </View>
      ) : (
        <GestureDetector gesture={chartGesture}>
          <Animated.View style={[{ flex: 1 }, chartAnim]}>
            {doc ? (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingHorizontal: t.spacing.lg,
                  paddingTop: headerH + t.spacing.sm,
                  paddingBottom: t.spacing.xxl * 2 + TRANSPOSE_BAR_CLEARANCE,
                }}
              >
                <ChordChart
                  doc={doc}
                  steps={steps}
                  preferFlat={preferFlat}
                  showChords={showChords}
                  showSections={showSections}
                  fontScale={fontScale}
                  chordStyle={chordStyle}
                />
              </ScrollView>
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl, paddingTop: headerH }}>
                <Text style={{ fontSize: t.typography.body.fontSize, fontWeight: '600', color: t.colors.ink }}>
                  {parseError ? 'Chords unavailable' : 'No chart available'}
                </Text>
                <Text style={{ marginTop: t.spacing.sm, fontSize: 13.5, color: t.colors.muted }}>
                  This song has no ChordPro content yet.
                </Text>
              </View>
            )}
          </Animated.View>
        </GestureDetector>
      )}

      {/* Bottom controls: equal gutters hold Prev/Next so the transpose island
          stays dead-center regardless of nav presence (auto-hides too). */}
      <RNAnimated.View
        pointerEvents={chromeVisible ? 'box-none' : 'none'}
        style={{
          opacity: chromeOpacity,
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 26,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: t.spacing.lg,
        }}
      >
        <View style={{ width: 50, alignItems: 'flex-start' }}>
          {count > 1 ? (
            <Pressable
              onPress={goPrev}
              disabled={index === 0}
              accessibilityRole="button"
              accessibilityLabel="Previous song"
              style={navButtonStyle(index === 0)}
            >
              <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} weight="semibold" />
            </Pressable>
          ) : null}
        </View>

        <View style={{ flex: 1, alignItems: 'center' }}>
          {keyLabel ? (
            <TransposeBar keyLabel={keyLabel} onDown={() => transposeBy(-1)} onUp={() => transposeBy(1)} />
          ) : null}
        </View>

        <View style={{ width: 50, alignItems: 'flex-end' }}>
          {count > 1 ? (
            <Pressable
              onPress={goNext}
              disabled={index === count - 1}
              accessibilityRole="button"
              accessibilityLabel="Next song"
              style={navButtonStyle(index === count - 1)}
            >
              <SymbolIcon name="chevron.right" size={22} color={t.colors.accent} weight="semibold" />
            </Pressable>
          ) : null}
        </View>
      </RNAnimated.View>

      <ViewOptionsSheet
        visible={sheet === 'options'}
        onClose={() => setSheet(null)}
        showChords={showChords}
        onShowChords={setShowChords}
        showSections={showSections}
        onShowSections={setShowSections}
        fontScale={fontScale}
        onFontScale={setFontScale}
        chordStyle={chordStyle}
        onChordStyle={setChordStyle}
        accidental={accidental}
        onAccidental={setAccidental}
        autoHide={autoHide}
        onAutoHide={setAutoHide}
      />
      <PerformerShareSheet
        visible={sheet === 'share'}
        onClose={() => setSheet(null)}
        songCount={count}
        initialScope={count > 1 ? 'set' : 'song'}
        handlers={shareHandlers}
      />
    </Screen>
  )
}
