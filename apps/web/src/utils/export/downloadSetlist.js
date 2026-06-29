import { combinePptxFiles } from './combinePptx'
import { publicUrl } from '../network/publicUrl'

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
  const { availablePptxMap = null, onEmpty } = options

  const songUrls = []

  for (const entry of songs) {
    const slug = songToSlug(entry)
    if (!slug) continue
    if (availablePptxMap && !availablePptxMap[slug]) continue
    songUrls.push(publicUrl(`pptx/${slug}.pptx`))
  }

  if (!songUrls.length) {
    if (typeof onEmpty === 'function') onEmpty()
    return
  }

  await combinePptxFiles(songUrls, name)
}
