import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import type { SongDoc } from '@gracechords/core'
import { parseChordProOrLegacy, stepsBetween, transposeSymPrefer } from '@gracechords/core'
import ChordChart, {
  CHART_FONT_SIZE,
  CHART_LINE_HEIGHT,
  CHART_MONO,
} from '../../src/components/ChordChart'
import Screen from '../../src/components/Screen'
import SymbolIcon from '../../src/components/SymbolIcon'
import { useSong } from '../../src/lib/useSong'
import { useTheme } from '../../src/theme/ThemeProvider'

// Song Viewer, pass 1: static chord chart. Fetches the ChordPro body by slug,
// parses it with core, and renders a monospaced chart (ChordChart). The
// optional `initialKey` param transposes the whole chart at open — ephemeral
// local state only, discarded on unmount — so a setlist can later open the
// Viewer at its own key with no refactor. Interactive controls are pass 2.

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

  // Transpose target: ephemeral, never persisted. steps stays 0 when no
  // initialKey was passed or either key is unknown (stepsBetween degrades to 0).
  const [targetKey] = useState(() => initialKey || '')
  const nativeKey = doc?.meta?.key || song?.default_key || songKey || ''
  const steps = targetKey ? stepsBetween(nativeKey, targetKey) : 0
  const preferFlat = /^[A-G]b/.test(nativeKey)
  const effectiveKey = steps ? transposeSymPrefer(nativeKey, steps, preferFlat) : nativeKey

  const displayTitle = song?.title || title || slug
  const displayArtist = song?.artist ?? artist ?? ''

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' }}
        >
          <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
          <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent }}>Songs</Text>
        </Pressable>

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
        {displayArtist ? (
          <Text style={{ marginTop: 4, fontSize: 13.5, color: t.colors.sec }}>{displayArtist}</Text>
        ) : null}
        <View
          style={{
            marginTop: t.spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
          }}
        >
          {effectiveKey ? (
            <View
              style={{
                backgroundColor: t.colors.accentSoft,
                borderRadius: t.radii.pill,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.textAccent }}>
                Key of {effectiveKey}
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
      </View>

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
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxl * 2 }}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <ChordChart doc={doc} steps={steps} preferFlat={preferFlat} />
          </ScrollView>
        </ScrollView>
      ) : (
        <RawFallback content={song.chordpro_content || ''} parseError={parseError} />
      )}
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
