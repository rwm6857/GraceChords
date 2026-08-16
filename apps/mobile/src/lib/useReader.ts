import { useEffect, useState } from 'react'
import { getCachedPassage, getPassage, type BibleTranslation, type ChapterData, type Passage } from './bibleSource'
import { failureDetailKey } from './errors'

// The reader's chapter-loading seam. Its typography PREFERENCES (size,
// typeface, verse layout, line spacing) live in `readerSettings.ts`, which is
// RN-free and persists them device-local — this module imports native-backed
// `bibleSource`, so nothing testable belongs here.

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
        // The reader renders its own localized copy and only reads this for
        // truthiness, so the value was never shown — but it held raw error text,
        // which made it a trap for anyone who later decided to render it, and
        // nothing logged reader failures at all. An i18n key closes both.
        if (alive) {
          setState({ chapter: null, loading: false, error: failureDetailKey('usePassageChapter', err) })
        }
      })

    return () => {
      alive = false
    }
  }, [passage, translation, reloadToken])

  return state
}
