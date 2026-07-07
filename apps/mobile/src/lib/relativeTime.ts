// Compact relative timestamp for setlist metadata: "just now", "5m ago",
// "3h ago", "2d ago", then a localized "Mar 16" beyond a month. RN-free: the
// caller passes its i18n `t` (common namespace) and the active locale so this
// stays unit-testable headless.

export type Translator = (key: string, options?: Record<string, unknown>) => string

export function timeAgo(
  iso: string | null | undefined,
  t: Translator,
  locale?: string
): string | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const mins = Math.floor((Date.now() - then) / 60_000)
  if (mins < 1) return t('timeAgo.justNow')
  if (mins < 60) return t('timeAgo.minutes', { count: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('timeAgo.hours', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 31) return t('timeAgo.days', { count: days })
  return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}
