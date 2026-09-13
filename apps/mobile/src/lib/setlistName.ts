import { uniqueName } from '@gracechords/core'

// The default name for a new setlist: "9/12 Worship".
//
// It used to be "New Setlist" for every set, which is what QA report Nº 6994's
// S-02 was about — a list of sets that all read the same is a list you cannot
// scan. A date is the one thing known at creation time that actually
// distinguishes one set from another.
//
// The month/day ORDER is locale-formatted (so es reads "12/9"), and the word
// around it comes from the `setlist:defaultName` string, so a language that puts
// it before the date can say so in its own translation rather than being forced
// into English word order.

/** Locale-ordered month/day, e.g. "9/12" (en) or "12/9" (es). */
export function formatSetDate(date: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).format(date)
  } catch {
    // Hermes ships a reduced Intl; a wrong separator beats no name at all.
    return `${date.getMonth() + 1}/${date.getDate()}`
  }
}

/**
 * The name to give a set created now.
 *
 * `t` is injected (rather than importing i18next here) so this module stays
 * unit-testable headless, matching greetings.ts and authValidation.ts.
 * `existingNames` may be empty where the caller has no list to check against —
 * then the name is simply not de-duplicated.
 */
export function defaultSetlistName(
  t: (key: string, opts: { date: string }) => string,
  locale: string,
  existingNames: readonly string[] = [],
  now: Date = new Date(),
): string {
  const base = t('defaultName', { date: formatSetDate(now, locale) })
  return uniqueName(base, existingNames)
}
