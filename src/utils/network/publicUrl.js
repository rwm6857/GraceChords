export function publicUrl(input = '') {
  const raw = String(input ?? '').trim()
  if (!raw) return '/'
  if (/^https?:\/\//i.test(raw)) return raw
  let cleaned = raw.replace(/^\.\/+/, '')
  if (!cleaned.startsWith('/')) cleaned = `/${cleaned}`
  cleaned = cleaned.replace(/\/{2,}/g, '/')
  if (import.meta?.env?.DEV) {
    if (cleaned.includes('/songs/songs/') || cleaned.includes('/resources/resources/')) {
      console.warn('publicUrl produced a double segment:', cleaned)
    }
  }
  return cleaned
}
