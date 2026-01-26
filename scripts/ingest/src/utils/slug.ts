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

  const normalized = withoutQualifiers
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized
}
