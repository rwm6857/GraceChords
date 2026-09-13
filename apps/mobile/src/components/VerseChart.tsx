import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import {
  parseVerseId,
  resolveVerseLines,
  type VerseLine,
} from '@gracechords/core'
import { useTheme } from '../theme/ThemeProvider'
import { getPassage, getTranslations } from '../lib/bibleSource'

// Native lyrics-style renderer for a Bible verse item (both session tiers render
// verses identically — no chords). Content is fetched anonymously from the same
// R2 Bible source the Daily Word reader uses (cache-first via getPassage), so an
// anonymous session follower can read it. `verseRef` is the canonical
// `v:<translation>|<Book> <ref>` id.
export default function VerseChart({
  verseRef,
  fontScale = 1,
}: {
  verseRef: string
  fontScale?: number
}) {
  const t = useTheme()
  const [lines, setLines] = useState<VerseLine[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setLines(null)
    setFailed(false)
    ;(async () => {
      const parsed = parseVerseId(verseRef)
      if (!parsed) {
        if (alive) setFailed(true)
        return
      }
      try {
        const { translations } = await getTranslations()
        const translation =
          translations.find((x) => x.id === parsed.translation) || translations[0]
        if (!translation) {
          if (alive) setFailed(true)
          return
        }
        const fetchChapter = (_translationId: string, bookNumber: number, chapter: number) =>
          getPassage({
            passage: { bookNumber, book: '', chapter, range: null },
            translation,
          }).catch(() => null)
        const { lines: resolved } = await resolveVerseLines(parsed, fetchChapter)
        if (alive) setLines(resolved)
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [verseRef])

  if (failed) {
    return (
      <Text style={{ color: t.colors.sec, textAlign: 'center', marginTop: t.spacing.xl }}>
        —
      </Text>
    )
  }
  if (!lines) {
    return (
      <View style={{ alignItems: 'center', marginTop: t.spacing.xl }}>
        <ActivityIndicator color={t.colors.accent} />
      </View>
    )
  }

  return (
    <View style={{ gap: 10, maxWidth: 760, alignSelf: 'center', width: '100%' }}>
      {lines.map((ln, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Text
            style={{
              minWidth: (ln.showChapter ? 46 : 28) * fontScale,
              textAlign: 'right',
              color: t.colors.sec,
              fontWeight: '600',
              // 14 is RN's default size — named here only so it can scale.
              fontSize: 14 * fontScale,
            }}
          >
            {ln.showChapter ? `${ln.chapter}:${ln.number}` : `${ln.number}`}
          </Text>
          <Text style={{ flex: 1, color: t.colors.ink, fontSize: 18 * fontScale, lineHeight: 26 * fontScale }}>
            {ln.text}
          </Text>
        </View>
      ))}
    </View>
  )
}
