import { File, Paths } from 'expo-file-system'
import { apiError, apiPost } from './api'

// Server-side song export. Calls the web app's Pages Function
// POST /api/export/song, which renders with the same pure pdf_mvp engine the
// web app uses and returns the bytes (PDF, or a PNG raster of page 1 for
// 'jpg' — the server has no JPG encoder, and share sheets don't care).
// The bytes are written to the app cache and the local URI returned for
// expo-sharing / the system share sheet.

export type ExportFormat = 'pdf' | 'jpg'

export async function exportSong(opts: {
  songId: string
  key?: string
  format?: ExportFormat
}): Promise<string> {
  const format = opts.format ?? 'pdf'
  const res = await apiPost('/api/export/song', {
    song_id: opts.songId,
    key: opts.key || '',
    format,
  })

  // 501 = server rasteriser unavailable; caller should offer PDF instead.
  if (res.status === 501) throw new Error('image_unavailable')
  if (!res.ok) throw await apiError(res, 'export_failed')

  const contentType = res.headers.get('content-type') || ''
  const ext = contentType.includes('pdf') ? 'pdf' : 'png'
  const disposition = res.headers.get('content-disposition') || ''
  const nameMatch = disposition.match(/filename="([^"]+)"/)
  const filename = nameMatch?.[1] || `song-export.${ext}`

  const file = new File(Paths.cache, filename)
  if (file.exists) file.delete()
  file.write(new Uint8Array(await res.arrayBuffer()))
  return file.uri
}
