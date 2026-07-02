import { useEffect, useState } from 'react'
import { getCachedPassage, getPassage, type BibleTranslation, type ChapterData, type Passage } from './bibleSource'
import { errMessage } from './errors'

// Session-ephemeral reader typography preferences. Per the Daily Word spec these
// "could also live in Profile → reader preferences," but they are not tied to
// app Settings today, so they reset on relaunch (flagged in the plan).
export type Typeface = 'serif' | 'sans'
export type VerseLayout = 'lines' | 'prose'
export type LineSpacing = 'tight' | 'normal' | 'relaxed'

export type ReaderSettings = {
  /** Point size shown in the sheet (12–24). Reading size derives from this. */
  pt: number
  typeface: Typeface
  layout: VerseLayout
  lineSpacing: LineSpacing
}

export const READER_PT_MIN = 12
export const READER_PT_MAX = 24

export const defaultReaderSettings: ReaderSettings = {
  pt: 14,
  typeface: 'serif',
  layout: 'lines',
  lineSpacing: 'normal',
}

// Match the web reader's derivations so the two platforms read alike.
const LINE_HEIGHT_MULTIPLIER: Record<LineSpacing, number> = {
  tight: 1.4,
  normal: 1.6,
  relaxed: 1.85,
}

export function readerFontSize(pt: number) {
  return Math.round((pt * 4) / 3)
}

export function readerLineHeight(pt: number, spacing: LineSpacing) {
  return Math.round(readerFontSize(pt) * LINE_HEIGHT_MULTIPLIER[spacing])
}

type ChapterState = {
  chapter: ChapterData | null
  loading: boolean
  error: string | null
}

/**
 * Fetch the chapter backing `passage` in `translation` via the source seam,
 * aborting in-flight loads when the passage or translation changes. Mirrors the
 * web PassageReader effect.
 */
export function usePassageChapter(
  passage: Passage | null,
  translation: BibleTranslation | null,
  reloadToken = 0
): ChapterState {
  const [state, setState] = useState<ChapterState>({ chapter: null, loading: false, error: null })

  useEffect(() => {
    if (!passage || !translation) {
      setState({ chapter: null, loading: false, error: null })
      return
    }
    // Prefetched / previously-read chapters render immediately, no spinner.
    const cached = getCachedPassage(translation.id, passage.bookNumber, passage.chapter)
    if (cached) {
      setState({ chapter: cached, loading: false, error: null })
      return
    }

    let alive = true
    setState({ chapter: null, loading: true, error: null })

    getPassage({ passage, translation })
      .then((chapter) => {
        if (alive) setState({ chapter, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (alive) setState({ chapter: null, loading: false, error: errMessage(err) })
      })

    return () => {
      alive = false
    }
  }, [passage, translation, reloadToken])

  return state
}
