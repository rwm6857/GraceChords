// Shared verse → renderable-lines resolver. Extracted from the web Worship Mode
// verse path so the session followers (web + native) and the native leader all
// build the same `lines` shape from a parsed verse id. The chapter fetch is
// injected so each platform uses its own anonymous Bible source (web same-origin
// /bible proxy, native direct R2) with its own cache.

export type VerseLine = {
  verse: true
  chapter: number
  number: number
  text: string
  showChapter: boolean
}

type ChapterData = { verses?: Record<string, string> } | null

type Segment = { chapter: number; ranges?: Array<{ start: number; end: number | null }> | null }

// Loosely typed on purpose: parseVerseId's return is a union that also includes
// an error shape, so callers pass it straight through. Missing fields just yield
// no segments (empty lines).
type ParsedVerse = {
  translation?: string
  bookNumber?: number
  segments?: Segment[]
} | null

// A platform-injected fetch: resolve one chapter's verses (or null on failure).
export type FetchChapter = (
  translationId: string,
  bookNumber: number,
  chapter: number,
) => Promise<ChapterData>

function listChapterVerses(chapterData: ChapterData): number[] {
  return Object.keys(chapterData?.verses || {})
    .map((n) => Number(n))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b)
}

// The verse numbers a segment selects from a chapter. `ranges == null` means the
// whole chapter; `range.end == null` means "to the end of the chapter".
export function selectSegmentVerseNumbers(chapterData: ChapterData, segment: Segment): number[] {
  const all = listChapterVerses(chapterData)
  if (!segment.ranges) return all
  const max = all.length ? all[all.length - 1] : 0
  const out: number[] = []
  for (const range of segment.ranges) {
    const start = range.start
    const end = range.end == null ? max : range.end
    for (let v = start; v <= end; v += 1) {
      if (chapterData?.verses?.[String(v)]) out.push(v)
    }
  }
  return out
}

// Resolve a parsed verse id (from parseVerseId) into ordered display lines,
// fetching each referenced chapter via the injected `fetchChapter`.
export async function resolveVerseLines(
  parsed: ParsedVerse,
  fetchChapter: FetchChapter,
): Promise<{ lines: VerseLine[] }> {
  const segments = parsed?.segments || []
  const multiChapter = segments.length > 1
  const lines: VerseLine[] = []
  for (const segment of segments) {
    const chapterData = await fetchChapter(parsed?.translation || '', parsed?.bookNumber || 0, segment.chapter)
    if (!chapterData) continue
    for (const num of selectSegmentVerseNumbers(chapterData, segment)) {
      lines.push({
        verse: true,
        chapter: segment.chapter,
        number: num,
        text: chapterData.verses?.[String(num)] || '',
        showChapter: multiChapter,
      })
    }
  }
  return { lines }
}
