import { useEffect, useMemo, useRef, useState } from 'react'
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
import { useTranslation } from 'react-i18next'
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
import TwoColumnChart from '../components/TwoColumnChart'
import HeaderIconButton from '../components/HeaderIconButton'
import Screen from '../components/Screen'
import StarButton from '../components/StarButton'
import SymbolIcon from '../components/SymbolIcon'
import TransposeBar from '../components/TransposeBar'
import ViewOptionsSheet, {
  type Accidental,
  defaultAccidental,
  resolvePreferFlat,
} from '../components/ViewOptionsSheet'
import PerformerShareSheet, {
  type PerformerShareHandlers,
} from '../components/setlist/PerformerShareSheet'
import { useTheme } from '../theme/ThemeProvider'
import { useSetlistBuilder } from '../lib/useSetlistBuilder'
import { prefetchSong, useSong, usePersonalSong } from '../lib/useSong'
import { useAutoHideChrome, useAutoHidePref } from '../lib/autoHideChrome'
import { getDefaultsSnapshot, setDefaultKeepAwake, useAppDefaults } from '../lib/defaults'
import { useKeepAwakeWhileFocused } from '../lib/keepAwake'
import { useIsTabletWidth } from '../lib/useIsTabletWidth'
import { setColumnMode, useColumnMode } from '../lib/viewerPrefs'
import { exportSetlist, exportSong } from '../lib/exportSong'
import { buildSetlistShareUrl } from '../lib/setlistShare'
import { useSessionController } from '../lib/useSessionController'
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
  const { t: tx } = useTranslation(['setlist', 'song', 'export', 'errors', 'common'])
  const router = useRouter()

  // Read-only reuse of the builder hook for the ordered entries + song
  // metadata. We never mutate here, so its autosave stays idle.
  const { name, items, loading: setLoading, notFound, error: setError } = useSetlistBuilder(setlistId)

  // Leader-side live session (broadcasts current item + transpose to web
  // followers). Idle until "Start session" is tapped; adopts an already-running
  // session for this setlist on mount.
  const sessionCtl = useSessionController(setlistId)

  const [index, setIndex] = useState(0)
  const entry = items[index]
  // Personal-song entries (id `personal:<uuid>`) resolve from personal_songs;
  // catalog entries from the shared cache. Both hooks always run (undefined arg
  // = no-op) to keep hook order stable.
  const isPersonalEntry = typeof entry?.songId === 'string' && entry.songId.startsWith('personal:')
  const personalEntryId = isPersonalEntry ? entry!.songId.slice('personal:'.length) : undefined
  const catalogSong = useSong(isPersonalEntry ? undefined : entry?.song.slug)
  const personalSong = usePersonalSong(personalEntryId)
  const { song, loading: songLoading, error: songError } = isPersonalEntry ? personalSong : catalogSong

  // useSong keeps the previous song while the next loads, so guard every render
  // on the loaded song actually being this entry's song. Until it matches,
  // treat the chart as still loading (no stale flash / mistranspose).
  const songReady = !!(
    song &&
    entry &&
    (isPersonalEntry ? song.id === personalEntryId : song.slug === entry.song.slug)
  )

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
  // Chord style initializes from the app-wide default (read-on-open); in-session
  // changes stay local — no write-back to the global default.
  const [chordStyle, setChordStyle] = useState<ChordStyle>(() => getDefaultsSnapshot().chordStyle)
  const [accidental, setAccidental] = useState<Accidental>('sharp')
  // Seed from each song's key until the user flips it.
  const accidentalTouched = useRef(false)
  const setAccidentalManual = (v: Accidental) => {
    accidentalTouched.current = true
    setAccidental(v)
  }
  const [sheet, setSheet] = useState<null | 'options' | 'share'>(null)
  // Floating-overlay header height → chart top inset (edge-to-edge).
  const [headerH, setHeaderH] = useState(0)
  // Two-column mode: tablet widths only, persisted PER SONG (the current
  // entry's song), exactly as in the Song Viewer. One song at a time — the
  // columns split the current song's sections, never tile multiple songs.
  const isTablet = useIsTabletWidth()
  const currentSlug = entry?.song.slug
  const columnMode = useColumnMode(currentSlug)
  const [chartAreaH, setChartAreaH] = useState(0)
  const twoColumns = isTablet && columnMode === 'double'

  const nativeKey = doc?.meta?.key || entry?.song.default_key || ''
  const targetKey = entryKeys[index] || nativeKey
  const seedSteps = targetKey ? stepsBetween(nativeKey, targetKey) : 0
  const steps = (((seedSteps + delta) % 12) + 12) % 12
  const preferFlat = resolvePreferFlat(accidental)
  const effectiveKey = steps ? transposeSymPrefer(nativeKey, steps, preferFlat) : nativeKey

  useEffect(() => {
    if (!accidentalTouched.current) setAccidental(defaultAccidental(nativeKey))
  }, [nativeKey])

  // Broadcast the leader's current item + transpose whenever they change. The
  // snapshot the session was created from preserves item order, so the current
  // item's stable uid is `i${index}`. `steps` is the net semitone offset from
  // native, which the follower re-applies to the same song. The controller
  // de-dupes + debounces, so calling this on every relevant change is safe.
  useEffect(() => {
    if (!sessionCtl.session) return
    sessionCtl.broadcast({
      itemUid: `i${index}`,
      transpose: steps,
      currentKey: effectiveKey || null,
    })
  }, [sessionCtl, index, steps, effectiveKey])

  // Chrome auto-hide (persisted). Pinned visible while a sheet is open; tap the
  // chart, change songs, or use the transpose bar to bring it back.
  const [autoHide, setAutoHide] = useAutoHidePref()
  // Keep-awake: shared persisted preference (defaults store), engaged only while
  // this screen is focused so it never holds the lock in the background.
  const { keepAwake } = useAppDefaults()
  useKeepAwakeWhileFocused(keepAwake)
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
    if (msg === 'not_signed_in') Alert.alert(tx('export:alerts.signInRequiredTitle'), tx('export:alerts.signInToExport'))
    else if (msg === 'image_unavailable') {
      Alert.alert(tx('export:alerts.imageUnavailableTitle'), tx('export:alerts.imageUnavailableGeneric'))
    } else Alert.alert(title, msg)
  }

  // Start / manage the live session from the header. Starting builds the frozen
  // snapshot from the current entries and opens the native share sheet with the
  // /s/{code} follower link; managing an active session offers re-share or end.
  function onSessionButton() {
    if (sessionCtl.session) {
      Alert.alert(tx('setlist:session.manageTitle'), tx('setlist:session.manageMessage'), [
        { text: tx('setlist:session.shareLink'), onPress: () => { void sessionCtl.reshare() } },
        {
          text: tx('setlist:session.end'),
          style: 'destructive',
          onPress: () => {
            sessionCtl.end().catch((err) => reportError(tx('setlist:session.endFailed'), err))
          },
        },
        { text: tx('common:cancel'), style: 'cancel' },
      ])
      return
    }
    if (!count) {
      Alert.alert(tx('setlist:performer.noSongs'))
      return
    }
    sessionCtl
      .start(items.map((it) => ({ songId: it.songId, toKey: it.toKey, song: it.song })))
      .catch((err) => reportError(tx('setlist:session.startFailed'), err))
  }

  const shareSongFile = async (format: 'pdf' | 'jpg') => {
    if (!entry) return
    const uri = await exportSong({ songId: entry.songId, key: exportKey, format })
    await Sharing.shareAsync(uri)
  }

  async function notLinkedAlert() {
    Alert.alert(
      tx('export:alerts.linkTelegramTitle'),
      tx('export:alerts.linkTelegramMessage'),
      [
        { text: tx('export:alerts.openTelegram'), onPress: () => Linking.openURL(TELEGRAM_BOT_URL) },
        { text: tx('export:alerts.notNow'), style: 'cancel' },
      ],
    )
  }

  const shareHandlers: PerformerShareHandlers = {
    onExportSong: async (format) => {
      try {
        await shareSongFile(format)
        setSheet(null)
      } catch (err) {
        reportError(tx('export:alerts.exportFailedTitle'), err)
      }
    },
    onTelegramSong: async () => {
      if (!entry) return
      try {
        const result = await pushSongToTelegram({ songId: entry.songId, key: exportKey })
        if (result === 'not_linked') return notLinkedAlert()
        setSheet(null)
        Alert.alert(tx('export:alerts.sentTitle'), tx('export:alerts.sentSongMessage'))
      } catch (err) {
        reportError(tx('export:alerts.telegramFailedTitle'), err)
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
        reportError(tx('export:alerts.exportFailedTitle'), err)
      }
    },
    onCopyLink: async () => {
      try {
        await Clipboard.setStringAsync(buildSetlistShareUrl(items))
        setSheet(null)
        Alert.alert(tx('export:alerts.copiedTitle'), tx('export:alerts.setLinkCopied'))
      } catch (err) {
        reportError(tx('export:alerts.couldNotCopyLinkTitle'), err)
      }
    },
    onTelegramSet: async () => {
      try {
        const result = await pushSetToTelegram(
          items.map((it, i) => ({ songId: it.songId, key: entryKeys[i] })),
        )
        if (result === 'not_linked') return notLinkedAlert()
        setSheet(null)
        Alert.alert(tx('export:alerts.sentTitle'), tx('export:alerts.sentSetMessage'))
      } catch (err) {
        reportError(tx('export:alerts.telegramFailedTitle'), err)
      }
    },
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
            {tx('setlist:performer.notFound')}
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
            accessibilityLabel={tx('setlist:performer.backToSetlist')}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
          >
            <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
            <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent, maxWidth: 160 }}>
              {name || tx('setlist:performer.back')}
            </Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
            <Pressable
              onPress={onSessionButton}
              disabled={sessionCtl.busy}
              accessibilityRole="button"
              accessibilityState={{ selected: !!sessionCtl.session }}
              accessibilityLabel={
                sessionCtl.session ? tx('setlist:session.manageTitle') : tx('setlist:session.start')
              }
              hitSlop={8}
              style={{
                width: 40,
                height: 40,
                borderRadius: t.radii.pill,
                backgroundColor: sessionCtl.session ? t.colors.accent : t.colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: sessionCtl.busy ? 0.5 : 1,
              }}
            >
              <SymbolIcon
                name="antenna.radiowaves.left.and.right"
                size={18}
                color={sessionCtl.session ? t.colors.onAccent : t.colors.ink}
              />
            </Pressable>
            <HeaderIconButton icon="ellipsis" label={tx('setlist:performer.viewOptions')} onPress={() => setSheet('options')} />
            <HeaderIconButton
              icon="square.and.arrow.up"
              iconSize={22}
              label={tx('export:exportAndShare')}
              onPress={() => setSheet('share')}
            />
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
                  accessibilityLabel={tx('setlist:performer.goToSong', { number: i + 1 })}
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
                {tx('common:keyOf', { key: keyLabel })}
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
            {!entry ? tx('setlist:performer.noSongs') : tx('errors:couldntLoadSong')}
          </Text>
          {setError || songError ? (
            <Text style={{ marginTop: t.spacing.sm, fontSize: 13.5, color: t.colors.muted, textAlign: 'center' }}>
              {setError || songError}
            </Text>
          ) : null}
        </View>
      ) : (
        <GestureDetector gesture={chartGesture}>
          <Animated.View
            style={[{ flex: 1 }, chartAnim]}
            onLayout={(e) => setChartAreaH(e.nativeEvent.layout.height)}
          >
            {doc ? (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingHorizontal: t.spacing.lg,
                  paddingTop: headerH + t.spacing.sm,
                  paddingBottom: t.spacing.xxl * 2 + TRANSPOSE_BAR_CLEARANCE,
                }}
              >
                {twoColumns ? (
                  <TwoColumnChart
                    doc={doc}
                    steps={steps}
                    preferFlat={preferFlat}
                    showChords={showChords}
                    showSections={showSections}
                    fontScale={fontScale}
                    chordStyle={chordStyle}
                    viewportHeight={Math.max(0, chartAreaH - headerH - t.spacing.sm)}
                  />
                ) : (
                  <ChordChart
                    doc={doc}
                    steps={steps}
                    preferFlat={preferFlat}
                    showChords={showChords}
                    showSections={showSections}
                    fontScale={fontScale}
                    chordStyle={chordStyle}
                  />
                )}
              </ScrollView>
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl, paddingTop: headerH }}>
                <Text style={{ fontSize: t.typography.body.fontSize, fontWeight: '600', color: t.colors.ink }}>
                  {parseError ? tx('song:viewer.chordsUnavailable') : tx('song:viewer.noChart')}
                </Text>
                <Text style={{ marginTop: t.spacing.sm, fontSize: 13.5, color: t.colors.muted }}>
                  {tx('song:viewer.noChartBody')}
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
              accessibilityLabel={tx('setlist:performer.previousSong')}
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
              accessibilityLabel={tx('setlist:performer.nextSong')}
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
        onAccidental={setAccidentalManual}
        columnMode={isTablet && currentSlug ? columnMode : undefined}
        onColumnMode={
          isTablet && currentSlug ? (m) => setColumnMode(currentSlug, m) : undefined
        }
        autoHide={autoHide}
        onAutoHide={setAutoHide}
        keepAwake={keepAwake}
        onKeepAwake={setDefaultKeepAwake}
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
