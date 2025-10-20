import { combinePptxFiles } from './combinePptx'

function normalizeBaseUrl(input) {
  const base = input || '/'
  return base.endsWith('/') ? base : `${base}/`
}

function songToSlug(song) {
  if (!song) return ''
  if (song.slug) return song.slug
  if (song.filename) return song.filename.replace(/\.chordpro$/i, '')
  if (song.title) {
    return song.title
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_.-]/g, '')
  }
  return ''
}

export async function downloadSetlistAsPptx(setlist = {}, options = {}) {
  const { name = 'Setlist', songs = [] } = setlist || {}
  const { availablePptxMap = null, baseUrl = import.meta?.env?.BASE_URL || '/', onEmpty } = options

  const resolvedBase = normalizeBaseUrl(baseUrl)
  const songUrls = []

  for (const entry of songs) {
    const slug = songToSlug(entry)
    if (!slug) continue
    if (availablePptxMap && !availablePptxMap[slug]) continue
    songUrls.push(`${resolvedBase}pptx/${slug}.pptx`)
  }

  if (!songUrls.length) {
    if (typeof onEmpty === 'function') onEmpty()
    return
  }

  await combinePptxFiles(songUrls, name)
}
