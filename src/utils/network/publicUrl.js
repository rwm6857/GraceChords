const R2_BASE_URL = import.meta.env.VITE_BIBLE_CDN_URL || ''

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

  // Bible files are served from R2, not the app bundle
  if (R2_BASE_URL && cleaned.startsWith('/bible/')) {
    return `${R2_BASE_URL}${cleaned}`
  }

  return cleaned
}
