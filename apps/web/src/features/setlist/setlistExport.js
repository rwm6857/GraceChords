// Export and share for a setlist: PDF, PPTX (combined + ZIP), and the shared
// link / Worship Mode URLs.
//
// Lifted out of the old SetlistPage so the workspace and its mobile action
// sheet call one implementation. The transposition and Bible-chapter handling
// are carried over unchanged — this is a move, not a rewrite.
import { isVerseId, parseVerseId } from '@gracechords/core'
import { stepsBetween, transposeSymPrefer } from '../../utils/chordpro'
import { formatChord, formatKeyDisplay } from '../../utils/chordpro/solfege'
import { transposeInstrumental } from '../../utils/songs/instrumental'
import { parseChordProOrLegacy } from '../../utils/chordpro/parser'
import { fetchBibleChapter } from '../../utils/bible/chapters'
import { downloadSetlistAsPptx } from '../../utils/export/downloadSetlist'
import { publicUrl } from '../../utils/network/publicUrl'

let pdfLibPromise
export const loadPdfLib = () => pdfLibPromise || (pdfLibPromise = import('../../utils/pdf_mvp'))
/** Warm the lazy PDF chunk on hover/focus so the click feels instant. */
export const prefetchPdf = () => {
  loadPdfLib()
}

/** The full catalog song behind a working item, or null for a verse. */
export function catalogSongFor(item, catalog) {
  if (!item || !item.song || !item.song.slug) return null
  return (catalog && catalog.byId && catalog.byId.get(item.song.slug)) || null
}

/** The PPTX slug for a catalog song (source_filename, which can differ from the slug). */
export function pptxSlug(song) {
  if (!song) return ''
  return String(song.filename || '').replace(/\.chordpro$/i, '') || song.id || ''
}

function listVerseNumbers(chapterData) {
  return Object.keys(chapterData?.verses || {})
    .map((n) => Number(n))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b)
}

// Render one verse entry as a synthetic single-column "song" for the PDF.
async function verseToPdfSong(item, { chapterCache, onMessage, t }) {
  const parsed = parseVerseId(item.songId)
  if (!parsed) {
    onMessage(t('setlist.checkVerse'))
    return null
  }

  async function loadChapter(translationId, book, chapter) {
    const key = `${translationId}::${book}::${chapter}`
    if (chapterCache.has(key)) return chapterCache.get(key)
    try {
      const json = await fetchBibleChapter({ translationId, book, chapter })
      chapterCache.set(key, json)
      return json
    } catch {
      chapterCache.set(key, null)
      return null
    }
  }

  try {
    const segments = parsed.segments || []
    const multiChapter = segments.length > 1
    const lines = []
    const seen = new Set()

    for (const segment of segments) {
      const chapterData = await loadChapter(
        parsed.translation,
        String(parsed.bookNumber),
        segment.chapter
      )
      if (!chapterData?.verses) continue
      const verseMap = chapterData.verses || {}
      const allNums = listVerseNumbers(chapterData)
      const max = allNums.length ? allNums[allNums.length - 1] : 0
      const push = (num) => {
        const key = `${segment.chapter}:${num}`
        if (seen.has(key)) return
        const text = verseMap[String(num)]
        if (!text) return
        lines.push({ plain: `${multiChapter ? `${segment.chapter}:${num}` : `${num}`} ${text}` })
        seen.add(key)
      }
      if (!segment.ranges) {
        for (const num of allNums) push(num)
        continue
      }
      for (const range of segment.ranges) {
        const end = range.end == null ? max : range.end
        for (let v = range.start; v <= end; v += 1) push(v)
      }
    }

    if (!lines.length) {
      onMessage(t('setlist.noVersesFound', { ref: parsed.refDisplay }))
      return null
    }
    return {
      title: parsed.refDisplay || parsed.id,
      key: '',
      pdfColumns: 1,
      sections: [{ label: '', lines }],
    }
  } catch (err) {
    console.error('[setlistExport] verse:', err)
    onMessage(t('setlist.failedLoadVerse', { ref: parsed.refDisplay }))
    return null
  }
}

// Parse, transpose and shape one catalog song for the PDF engine.
function songToPdfSong(item, song, { chordStyle, onMessage, t }) {
  try {
    const doc = parseChordProOrLegacy(song.chordpro_content || '')
    const baseKey = doc.meta?.key || doc.meta?.originalkey || song.originalKey || 'C'
    const toKey = item.toKey || baseKey
    const steps = stepsBetween(baseKey, toKey)
    const baseRootRaw = (String(baseKey).match(/^([A-G][#b]?)/) || [, ''])[1]
    const preferFlat = !!(baseRootRaw && /b$/.test(baseRootRaw))

    const lyricsBlocks = (doc.sections || []).map((sec) => ({
      section: sec.label,
      lines: (sec.lines || []).map((ln) => {
        if (ln.instrumental) {
          return {
            instrumental: transposeInstrumental(ln.instrumental, steps, preferFlat, {
              style: chordStyle,
            }),
          }
        }
        if (ln.comment) {
          return { plain: ln.comment, chordPositions: [], comment: ln.comment }
        }
        return {
          plain: ln.lyrics || '',
          chordPositions: (ln.chords || []).map((c) => ({
            sym: formatChord(transposeSymPrefer(c.sym, steps, preferFlat), { style: chordStyle }),
            index: c.index,
          })),
        }
      }),
    }))

    return {
      title: doc.meta?.title || song.title,
      key: formatKeyDisplay(toKey, chordStyle),
      capo: doc.meta?.capo,
      lyricsBlocks,
    }
  } catch (err) {
    console.error('[setlistExport] song:', err)
    onMessage(t('setlist.failedProcess', { title: song.title }))
    return null
  }
}

/**
 * Download the whole set as one PDF.
 *
 * @param {import('../../utils/setlists/entries').SetlistItem[]} items
 * @param {object} catalog  buildSongCatalog() result
 */
export async function exportSetPdf(items, catalog, { chordStyle, t, onMessage, verseCache }) {
  const { downloadMultiSongPdf } = await loadPdfLib()
  const chapterCache = verseCache || new Map()
  const songs = []

  for (const item of items) {
    if (isVerseId(item.songId)) {
      const verse = await verseToPdfSong(item, { chapterCache, onMessage, t })
      if (verse) songs.push(verse)
      continue
    }
    const song = catalogSongFor(item, catalog)
    if (!song) continue
    const built = songToPdfSong(item, song, { chordStyle, onMessage, t })
    if (built) songs.push(built)
  }

  if (songs.length) await downloadMultiSongPdf(songs)
  return songs.length
}

/** A ZIP of the individual decks that exist for this set. */
export async function bundlePptxZip(items, catalog, pptxMap, { t, onProgress, onMessage }) {
  onProgress(t('setlist.bundling', { current: 0, total: items.length }))
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  let added = 0

  for (let i = 0; i < items.length; i += 1) {
    onProgress(t('setlist.bundling', { current: i + 1, total: items.length }))
    const song = catalogSongFor(items[i], catalog)
    if (!song) continue
    const slug = pptxSlug(song)
    if (!pptxMap[slug]) continue
    try {
      const res = await fetch(publicUrl(`pptx/${slug}.pptx`))
      if (!res.ok) continue
      const blob = await res.blob()
      added += 1
      zip.file(`${String(added).padStart(2, '0')}-${slug}.pptx`, blob)
    } catch {
      /* skip a deck that won't fetch */
    }
  }

  if (added > 0) {
    const blob = await zip.generateAsync({ type: 'blob' })
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `setlist-pptx-${date}.zip`
    a.click()
    URL.revokeObjectURL(a.href)
  } else {
    onMessage(t('setlist.noPptxFound'))
  }
  onProgress('')
  return added
}

/** One combined deck rebuilt from the individual PPTX files. */
export async function combineSetPptx(items, catalog, pptxMap, name, { t, onMessage }) {
  const songs = []
  const missing = []

  for (const item of items) {
    const song = catalogSongFor(item, catalog)
    if (!song) continue
    if (!pptxMap[pptxSlug(song)]) {
      missing.push(song.title || pptxSlug(song))
      continue
    }
    songs.push(song)
  }

  if (!songs.length) {
    onMessage(t('setlist.noPptxFound'))
    return 0
  }
  if (missing.length) {
    onMessage(
      missing.length === 1
        ? t('setlist.pptUnavailable', { title: missing[0] })
        : t('setlist.songsMissingPpt', { count: missing.length })
    )
  }
  await downloadSetlistAsPptx({ name: name || 'Setlist', songs }, {})
  return songs.length
}

// --- Links -----------------------------------------------------------------
// Both use slugs, not uuids: this is the contract the mobile app's deep-link
// import (apps/mobile/src/lib/setlistImport.ts) parses. Don't change the shape.

function idsAndKeys(items) {
  const ids = items.map((i) => encodeURIComponent(i.song.slug || i.songId)).join(',')
  const keys = items.map((i) => encodeURIComponent(i.toKey || '')).join(',')
  return { ids, keys }
}

/** The shareable `/setlist/<slugs>?toKeys=` URL, absolute. */
export function buildShareUrl(items) {
  const { ids, keys } = idsAndKeys(items)
  let origin = ''
  try {
    origin = `${window.location.origin || ''}/`
  } catch {
    origin = ''
  }
  return `${origin}setlist/${ids}?toKeys=${keys}`
}

/**
 * The Worship Mode path. `setlistId` rides along as `?set=` so leaving Worship
 * Mode can return to the saved set rather than a draft URL.
 */
export function buildWorshipPath(items, setlistId) {
  if (!items.length) return '/worship'
  const { ids, keys } = idsAndKeys(items)
  const set = setlistId ? `&set=${encodeURIComponent(setlistId)}` : ''
  return `/worship/${ids}?toKeys=${keys}${set}`
}
