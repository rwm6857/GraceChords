import { useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Animated, Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
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
  CHART_MONO,
  type ChordStyle,
} from '../../src/components/ChordChart'
import ExportSheet from '../../src/components/ExportSheet'
import Screen from '../../src/components/Screen'
import SymbolIcon from '../../src/components/SymbolIcon'
import TransposeBar from '../../src/components/TransposeBar'
import ViewOptionsSheet from '../../src/components/ViewOptionsSheet'
import { exportSong } from '../../src/lib/exportSong'
import { pushSongToTelegram, TELEGRAM_BOT_URL } from '../../src/lib/telegramPush'
import { useSong } from '../../src/lib/useSong'
import { useAutoHideChrome, useAutoHidePref } from '../../src/lib/autoHideChrome'
import { useTheme } from '../../src/theme/ThemeProvider'

// Song Viewer. Pass 1 built the static monospaced chart; pass 2 adds the live
// view controls (floating transpose bar, View-options sheet) and the Export &
// share sheet (server-rendered PDF/JPG via the web app's /api/export/song
// Pages Function, system share, Telegram push). ALL
// view state here is session-ephemeral useState — discarded on unmount, never
// persisted. The optional `initialKey` param seeds the transpose so a setlist
// can open the Viewer at its own key with no refactor.

// Extra scroll room so the last lines clear the floating transpose bar.
const TRANSPOSE_BAR_CLEARANCE = 96

export default function ViewerScreen() {
  const t = useTheme()
  const router = useRouter()
  const { slug, title, artist, songKey, initialKey } = useLocalSearchParams<{
    slug: string
    title?: string
    artist?: string
    songKey?: string
    initialKey?: string
  }>()

  const { song, loading, error } = useSong(slug)

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
  const nativeKey = doc?.meta?.key || song?.default_key || songKey || ''
  const seedSteps = initialKey ? stepsBetween(nativeKey, initialKey) : 0
  const steps = (((seedSteps + delta) % 12) + 12) % 12
  const preferFlat = /^[A-G]b/.test(nativeKey)
  const effectiveKey = steps ? transposeSymPrefer(nativeKey, steps, preferFlat) : nativeKey

  // View options — all session-ephemeral.
  const [showChords, setShowChords] = useState(true)
  const [showSections, setShowSections] = useState(true)
  const [fontScale, setFontScale] = useState(1)
  const [chordStyle, setChordStyle] = useState<ChordStyle>('letters')
  const [sheet, setSheet] = useState<null | 'options' | 'export'>(null)

  // Chrome auto-hide (persisted preference). Pinned visible while a sheet is
  // open so it can't hide behind one. Tap the chart to bring it back.
  const [autoHide, setAutoHide] = useAutoHidePref()
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

  const displayTitle = song?.title || title || slug
  const displayArtist = song?.artist ?? artist ?? ''
  const keyLabel = effectiveKey ? formatKeyDisplay(effectiveKey, chordStyle) : ''

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
        Alert.alert('Image unavailable', 'The server could not render an image for this song. Try PDF instead.')
      } else if (msg === 'not_signed_in') {
        Alert.alert('Sign in required', 'Sign in to export songs.')
      } else {
        Alert.alert('Export failed', msg)
      }
    }
  }

  const handleTelegram = async () => {
    if (!song) return
    try {
      const result = await pushSongToTelegram({ songId: song.id, key: exportKey })
      if (result === 'not_linked') {
        Alert.alert(
          'Link your Telegram',
          'Send /link to the GraceChords bot on Telegram, then connect it from your profile on the website.',
          [
            { text: 'Open Telegram', onPress: () => Linking.openURL(TELEGRAM_BOT_URL) },
            { text: 'Not now', style: 'cancel' },
          ],
        )
        return
      }
      setSheet(null)
      Alert.alert('Sent', 'The chart is on its way to your Telegram chat.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      Alert.alert(
        msg === 'not_signed_in' ? 'Sign in required' : 'Telegram failed',
        msg === 'not_signed_in' ? 'Sign in to send songs to Telegram.' : msg,
      )
    }
  }

  const headerButtonStyle = {
    width: 40,
    height: 40,
    borderRadius: t.radii.pill,
    backgroundColor: t.colors.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <Animated.View
        pointerEvents={chromeVisible ? 'auto' : 'none'}
        style={{ opacity: chromeOpacity, paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
          >
            <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
            <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent }}>Songs</Text>
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
              onPress={() => setSheet('export')}
              accessibilityRole="button"
              accessibilityLabel="Export and share"
              style={headerButtonStyle}
            >
              <SymbolIcon name="square.and.arrow.up" size={17} color={t.colors.ink} />
            </Pressable>
          </View>
        </View>

        <Text
          style={{
            marginTop: t.spacing.md,
            fontSize: t.typography.largeTitle.fontSize,
            fontWeight: t.typography.largeTitle.fontWeight,
            letterSpacing: t.typography.largeTitle.letterSpacing,
            color: t.colors.ink,
          }}
        >
          {displayTitle}
        </Text>
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
                Key of {keyLabel}
              </Text>
            </View>
          ) : null}
          {song?.time_signature ? (
            <Text style={{ fontSize: 12.5, color: t.colors.muted }}>{song.time_signature}</Text>
          ) : null}
          {song?.tempo ? (
            <Text style={{ fontSize: 12.5, color: t.colors.muted }}>{song.tempo} BPM</Text>
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
            Couldn't load song
          </Text>
          <Text style={{ marginTop: t.spacing.sm, fontSize: 13.5, color: t.colors.muted, textAlign: 'center' }}>
            {error || 'This song could not be found.'}
          </Text>
        </View>
      ) : doc ? (
        <View style={{ flex: 1 }}>
          <GestureDetector gesture={tapReveal}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                padding: t.spacing.lg,
                paddingBottom: t.spacing.xxl * 2 + TRANSPOSE_BAR_CLEARANCE,
              }}
            >
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
              <TransposeBar keyLabel={keyLabel} onDown={() => transposeBy(-1)} onUp={() => transposeBy(1)} />
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
        autoHide={autoHide}
        onAutoHide={setAutoHide}
      />
      <ExportSheet
        visible={sheet === 'export'}
        onClose={() => setSheet(null)}
        onShare={() => shareFile('pdf').then(() => setSheet(null)).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err)
          Alert.alert(msg === 'not_signed_in' ? 'Sign in required' : 'Share failed',
            msg === 'not_signed_in' ? 'Sign in to share songs.' : msg)
        })}
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
          No chart available
        </Text>
        <Text style={{ marginTop: t.spacing.sm, fontSize: 13.5, color: t.colors.muted }}>
          This song has no ChordPro content yet.
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
          Chords unavailable — showing raw text
        </Text>
      ) : null}
      {lines.map((ln, i) => (
        <Text
          key={i}
          style={{
            fontFamily: CHART_MONO,
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
