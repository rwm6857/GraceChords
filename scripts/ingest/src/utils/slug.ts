function transliterateForSlug(input: string): string {
  const turkishMap: Record<string, string> = {
    ç: 'c',
    Ç: 'c',
    ğ: 'g',
    Ğ: 'g',
    ı: 'i',
    I: 'i',
    İ: 'i',
    ö: 'o',
    Ö: 'o',
    ş: 's',
    Ş: 's',
    ü: 'u',
    Ü: 'u'
  }

  const mapped = input.replace(/[çÇğĞıIİöÖşŞüÜ]/g, (char) => turkishMap[char] || char)
  return mapped.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function slugifyTitle(input: string): string {
  const raw = input
    .replace(/\.[^.]+$/, '')
    .trim()

  if (!raw) return ''

  const withoutParens = raw.replace(/\([^)]*\)/g, ' ')
  const spacing = withoutParens
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')

  const withoutKey = spacing.replace(/\bkey\s*of\s*[A-G](?:#|b)?(?:m)?\b/gi, ' ')
  const withoutQualifiers = withoutKey.replace(/\b(hymn|hebrew)\b/gi, ' ')

  const normalized = transliterateForSlug(withoutQualifiers)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized
}
