import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Animated, Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import * as Sharing from 'expo-sharing'
import type { SongDoc } from '@gracechords/core'
import {
  formatKeyDisplay,
  parseChordProOrLegacy,
  stepsBetween,
  transposeSymPrefer,
} from '@gracechords/core'
import ChordChart, {
  CHART_FONT_SIZE,
  CHART_LINE_HEIGHT,
  CHART_LYRIC_FONT,
  type ChordStyle,
} from '../../src/components/ChordChart'
// CHART_LINE_HEIGHT / CHART_FONT_SIZE / CHART_LYRIC_FONT drive the raw-text fallback.
import ExportSheet from '../../src/components/ExportSheet'
import HeaderIconButton from '../../src/components/HeaderIconButton'
import KeyPickerSheet from '../../src/components/setlist/KeyPickerSheet'
import Screen from '../../src/components/Screen'
import StarButton from '../../src/components/StarButton'
import SymbolIcon from '../../src/components/SymbolIcon'
import TransposeBar from '../../src/components/TransposeBar'
import TwoColumnChart from '../../src/components/TwoColumnChart'
import ViewOptionsSheet, {
  type Accidental,
  defaultAccidental,
  resolvePreferFlat,
} from '../../src/components/ViewOptionsSheet'
import { capoChipValues } from '../../src/lib/capo'
import { exportSong } from '../../src/lib/exportSong'
import { pushSongToTelegram, TELEGRAM_BOT_URL } from '../../src/lib/telegramPush'
import { useSong } from '../../src/lib/useSong'
import { recordSongOpened, updateRecentKey } from '../../src/lib/recents'
import { useAutoHideChrome, useAutoHidePref } from '../../src/lib/autoHideChrome'
import { getDefaultsSnapshot, setDefaultKeepAwake, useAppDefaults } from '../../src/lib/defaults'
import { useKeepAwakeWhileFocused } from '../../src/lib/keepAwake'
import { useIsTabletWidth } from '../../src/lib/useIsTabletWidth'
import { setColumnMode, useColumnMode } from '../../src/lib/viewerPrefs'
import { useTheme } from '../../src/theme/ThemeProvider'

// Song Viewer. Pass 1 built the static monospaced chart; pass 2 adds the live
// view controls (floating transpose bar, View-options sheet) and the Export &
// share sheet (server-rendered PDF/JPG via the web app's /api/export/song
// Pages Function, system share, Telegram push). View state here is
// session-ephemeral useState — discarded on unmount, never persisted — except
// the tablet-only column mode, which persists per song (src/lib/viewerPrefs).
// The optional `initialKey` param seeds the transpose so a setlist can open
// the Viewer at its own key with no refactor.

// Extra scroll room so the last lines clear the floating transpose bar.
const TRANSPOSE_BAR_CLEARANCE = 96

export default function ViewerScreen() {
  const t = useTheme()
  const { t: tx } = useTranslation(['song', 'export', 'errors', 'common'])
  const router = useRouter()
  const { slug, title, artist, songKey, initialKey } = useLocalSearchParams<{
    slug: string
    title?: string
    artist?: string
    songKey?: string
    initialKey?: string
  }>()

  const { song, loading, error } = useSong(slug)

  // Record the open for Home's "Continue where you left off" card once the song
  // (with its real title/artist/key) has loaded. Device-local history only.
  useEffect(() => {
    if (!song) return
    recordSongOpened({
      id: song.id,
      slug: song.slug,
      title: song.title,
      artist: song.artist,
      default_key: song.default_key,
      time_signature: song.time_signature,
      tempo: song.tempo,
    })
  }, [song])

  const { doc, parseError } = useMemo<{ doc: SongDoc | null; parseError: boolean }>(() => {
    if (!song?.chordpro_content) return { doc: null, parseError: false }
    try {
      return { doc: parseChordProOrLegacy(song.chordpro_content), parseError: false }
    } catch {
      return { doc: null, parseError: true }
    }
  }, [song])

  // Transpose: `delta` is the user's ±1 taps; the initialKey seed is a pure
  // per-render derivation so it needs no effect and survives the doc-load
  // race (stepsBetween degrades to 0 while keys are unknown). Ephemeral —
  // discarded on unmount, never persisted.
  const [delta, setDelta] = useState(0)
  // View options — all session-ephemeral.
  const [showChords, setShowChords] = useState(true)
  const [showSections, setShowSections] = useState(true)
  const [fontScale, setFontScale] = useState(1)
  // Chord style initializes from the app-wide default (read-on-open); in-viewer
  // changes stay session-local — no write-back to the global default.
  const [chordStyle, setChordStyle] = useState<ChordStyle>(() => getDefaultsSnapshot().chordStyle)
  const [accidental, setAccidental] = useState<Accidental>('sharp')
  // Seed the accidental from the key until the user flips it themselves.
  const accidentalTouched = useRef(false)
  const setAccidentalManual = (v: Accidental) => {
    accidentalTouched.current = true
    setAccidental(v)
  }
  const [sheet, setSheet] = useState<null | 'options' | 'export' | 'key'>(null)
  // Header is a floating overlay so the chart runs edge-to-edge; its measured
  // height seeds the chart's top inset, so the first line starts where the
  // header sits and the user can scroll up into that space.
  const [headerH, setHeaderH] = useState(0)
  // Two-column mode: tablet widths only. Persisted PER SONG (device-local);
  // phones never see the toggle and always take the baseline single path.
  const isTablet = useIsTabletWidth()
  const columnMode = useColumnMode(slug)
  const [chartAreaH, setChartAreaH] = useState(0)
  const twoColumns = isTablet && columnMode === 'double'

  const nativeKey = doc?.meta?.key || song?.default_key || songKey || ''
  const seedSteps = initialKey ? stepsBetween(nativeKey, initialKey) : 0
  const steps = (((seedSteps + delta) % 12) + 12) % 12
  const preferFlat = resolvePreferFlat(accidental)
  const effectiveKey = steps ? transposeSymPrefer(nativeKey, steps, preferFlat) : nativeKey

  // Mirror the displayed key into the recent-songs entry (data only — the
  // Home Recent-songs card reopens the song in this key via initialKey).
  // Runs after the recordSongOpened effect above, so the entry always exists.
  useEffect(() => {
    if (song && effectiveKey) updateRecentKey(song.slug, effectiveKey)
  }, [song, effectiveKey])

  useEffect(() => {
    if (!accidentalTouched.current) setAccidental(defaultAccidental(nativeKey))
  }, [nativeKey])

  // Chrome auto-hide (persisted preference). Pinned visible while a sheet is
  // open so it can't hide behind one. Tap the chart to bring it back.
  const [autoHide, setAutoHide] = useAutoHidePref()
  // Keep-awake: shared persisted preference (defaults store), engaged only while
  // this screen is focused so it never holds the lock in the background.
  const { keepAwake } = useAppDefaults()
  useKeepAwakeWhileFocused(keepAwake)
  // Only arm auto-hide when there's a chart to tap (tap-to-reveal lives on the
  // chart); otherwise the header could hide with no way to bring it back.
  const { visible: chromeVisible, opacity: chromeOpacity, reveal } = useAutoHideChrome(
    autoHide && sheet === null && !!doc,
  )
  const tapReveal = useMemo(
    () => Gesture.Tap().onEnd(() => runOnJS(reveal)()),
    [reveal],
  )

  const transposeBy = (dir: 1 | -1) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    reveal()
    setDelta((d) => d + dir)
  }

  // Long-press key selector: jump straight to a chosen key by deriving the
  // relative delta the transpose model already uses (null = back to the song's
  // own key). Uses the same transpose/accidental state as the ± taps.
  const pickKey = (key: string | null) => {
    Haptics.selectionAsync().catch(() => {})
    if (key === null) {
      setDelta(-seedSteps)
      accidentalTouched.current = false
      setAccidental(defaultAccidental(nativeKey))
    } else {
      setDelta(stepsBetween(nativeKey, key) - seedSteps)
      setAccidentalManual(key.includes('b') ? 'flat' : 'sharp')
    }
  }

  const displayTitle = song?.title || title || slug
  const displayArtist = song?.artist ?? artist ?? ''
  const keyLabel = effectiveKey ? formatKeyDisplay(effectiveKey, chordStyle) : ''
  // Capo chip: only a net DOWNWARD ± transpose (delta < 0) has a capo
  // equivalent — the played shapes sit below the sounding key, which stays the
  // seeded/native key the taps started from. Zero/upward → null → no chip.
  const capoValues = effectiveKey ? capoChipValues(delta, effectiveKey, preferFlat, chordStyle) : null
  const capoText = capoValues ? tx('song:viewer.capo', capoValues) : null

  // --- Export handlers (screen owns errors; the sheet owns busy state) -----
  const exportKey = steps ? effectiveKey : ''

  const shareFile = async (format: 'pdf' | 'jpg') => {
    if (!song) return
    const uri = await exportSong({ songId: song.id, key: exportKey, format })
    await Sharing.shareAsync(uri)
  }

  const handleExport = async (format: 'pdf' | 'jpg') => {
    try {
      await shareFile(format)
      setSheet(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'image_unavailable') {
        Alert.alert(tx('export:alerts.imageUnavailableTitle'), tx('export:alerts.imageUnavailableSong'))
      } else if (msg === 'not_signed_in') {
        Alert.alert(tx('export:alerts.signInRequiredTitle'), tx('export:alerts.signInToExportSongs'))
      } else {
        Alert.alert(tx('export:alerts.exportFailedTitle'), msg)
      }
    }
  }

  const handleTelegram = async () => {
    if (!song) return
    try {
      const result = await pushSongToTelegram({ songId: song.id, key: exportKey })
      if (result === 'not_linked') {
        Alert.alert(
          tx('export:alerts.linkTelegramTitle'),
          tx('export:alerts.linkTelegramMessage'),
          [
            { text: tx('export:alerts.openTelegram'), onPress: () => Linking.openURL(TELEGRAM_BOT_URL) },
            { text: tx('export:alerts.notNow'), style: 'cancel' },
          ],
        )
        return
      }
      setSheet(null)
      Alert.alert(tx('export:alerts.sentTitle'), tx('export:alerts.sentSongMessage'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      Alert.alert(
        msg === 'not_signed_in' ? tx('export:alerts.signInRequiredTitle') : tx('export:alerts.telegramFailedTitle'),
        msg === 'not_signed_in' ? tx('export:alerts.signInToSendTelegram') : msg,
      )
    }
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <Animated.View
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
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
          >
            <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
            <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent }}>{tx('nav:songs')}</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
            <HeaderIconButton icon="ellipsis" label={tx('song:viewer.viewOptions')} onPress={() => setSheet('options')} />
            <HeaderIconButton
              icon="square.and.arrow.up"
              iconSize={22}
              label={tx('export:exportAndShare')}
              onPress={() => setSheet('export')}
            />
          </View>
        </View>

        <View style={{ marginTop: t.spacing.md, flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <Text
            numberOfLines={2}
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
          <StarButton songId={song?.id} />
        </View>
        {/* Subtitle row per the reference: artist · Key pill (+ time sig / BPM) */}
        <View
          style={{
            marginTop: 6,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
          }}
        >
          {displayArtist ? (
            <Text style={{ fontSize: 13.5, color: t.colors.sec }}>{displayArtist}</Text>
          ) : null}
          {displayArtist && keyLabel ? (
            <View
              style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: t.colors.muted }}
            />
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
          {song?.time_signature ? (
            <Text style={{ fontSize: 12.5, color: t.colors.muted }}>{song.time_signature}</Text>
          ) : null}
          {song?.tempo ? (
            <Text style={{ fontSize: 12.5, color: t.colors.muted }}>{tx('common:bpm', { tempo: song.tempo })}</Text>
          ) : null}
        </View>
      </Animated.View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.colors.accent} />
        </View>
      ) : error || !song ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl }}>
          <Text style={{ fontSize: t.typography.body.fontSize, fontWeight: '600', color: t.colors.ink }}>
            {tx('errors:couldntLoadSong')}
          </Text>
          <Text style={{ marginTop: t.spacing.sm, fontSize: 13.5, color: t.colors.muted, textAlign: 'center' }}>
            {error || tx('errors:songNotFound')}
          </Text>
        </View>
      ) : doc ? (
        <View style={{ flex: 1 }} onLayout={(e) => setChartAreaH(e.nativeEvent.layout.height)}>
          <GestureDetector gesture={tapReveal}>
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
          </GestureDetector>
          {keyLabel ? (
            <Animated.View
              pointerEvents={chromeVisible ? 'box-none' : 'none'}
              style={{
                opacity: chromeOpacity,
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 26,
                alignItems: 'center',
              }}
            >
              {capoText ? (
                <View
                  style={{
                    marginBottom: t.spacing.sm,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: t.radii.pill,
                    backgroundColor: t.colors.accentSoft,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.textAccent }}>
                    {capoText}
                  </Text>
                </View>
              ) : null}
              <TransposeBar
                keyLabel={keyLabel}
                onDown={() => transposeBy(-1)}
                onUp={() => transposeBy(1)}
                onLongPress={() => setSheet('key')}
              />
            </Animated.View>
          ) : null}
        </View>
      ) : (
        <RawFallback content={song.chordpro_content || ''} parseError={parseError} />
      )}

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
        columnMode={isTablet ? columnMode : undefined}
        onColumnMode={isTablet ? (m) => setColumnMode(slug, m) : undefined}
        autoHide={autoHide}
        onAutoHide={setAutoHide}
        keepAwake={keepAwake}
        onKeepAwake={setDefaultKeepAwake}
      />
      <KeyPickerSheet
        visible={sheet === 'key'}
        onClose={() => setSheet(null)}
        songTitle={displayTitle}
        currentKey={effectiveKey || null}
        nativeKey={nativeKey || null}
        hasOverride={steps !== 0}
        onPick={pickKey}
      />
      <ExportSheet
        visible={sheet === 'export'}
        onClose={() => setSheet(null)}
        onExport={handleExport}
        onTelegram={handleTelegram}
      />
    </Screen>
  )
}

// Parse failed (or the body is empty): still show the lyrics if we can by
// stripping [Chord] tokens and {directive} lines from the raw ChordPro text.
function RawFallback({ content, parseError }: { content: string; parseError: boolean }) {
  const t = useTheme()
  const { t: tx } = useTranslation('song')
  const lines = useMemo(
    () =>
      content
        .replace(/\r\n/g, '\n')
        .split('\n')
        .filter((ln) => !/^\s*\{[^}]*\}\s*$/.test(ln) && !/^\s*#/.test(ln))
        .map((ln) => ln.replace(/\[[^\]]*\]/g, '')),
    [content]
  )

  if (!lines.some((ln) => ln.trim())) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl }}>
        <Text style={{ fontSize: t.typography.body.fontSize, fontWeight: '600', color: t.colors.ink }}>
          {tx('viewer.noChart')}
        </Text>
        <Text style={{ marginTop: t.spacing.sm, fontSize: 13.5, color: t.colors.muted }}>
          {tx('viewer.noChartBody')}
        </Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxl * 2 }}
    >
      {parseError ? (
        <Text style={{ marginBottom: t.spacing.md, fontSize: 13, color: t.colors.muted }}>
          {tx('viewer.rawFallback')}
        </Text>
      ) : null}
      {lines.map((ln, i) => (
        <Text
          key={i}
          style={{
            fontFamily: CHART_LYRIC_FONT,
            fontSize: CHART_FONT_SIZE,
            lineHeight: CHART_LINE_HEIGHT,
            color: t.colors.ink,
          }}
        >
          {ln || ' '}
        </Text>
      ))}
    </ScrollView>
  )
}
