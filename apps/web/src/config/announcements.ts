// Site-wide announcement strip content.
//
// Hardcoded today, but shaped so a remote source (Supabase row, R2 JSON) can be
// swapped in behind resolveAnnouncement() without touching the component:
// `platforms` is the audience filter that a remote payload would carry, and the
// startsAt/endsAt window is what lets a campaign expire without a deploy.

import { isAndroid, isIOS } from '../utils/app/platform'

export type AnnouncementPlatform = 'ios' | 'android' | 'desktop'

export interface Announcement {
  /** Also the dismissal identity — a new id re-shows for everyone. */
  id: string
  platforms: AnnouncementPlatform[]
  /** i18n key in the `common` namespace. */
  messageKey: string
  cta: { labelKey: string; href: string }
  /** ISO-8601 with an explicit offset. Bare YYYY-MM-DD parses as UTC midnight,
   *  which silently drops the final day of a window. */
  startsAt: string
  endsAt: string
}

export const announcements: Announcement[] = [
  {
    id: 'ios-launch-2026-08',
    // iOS is included even though iOS Safari never shows the strip: the
    // suppression there is isNativeAppBannerActive(), a client concern, not an
    // audience one. Chrome/Firefox/webviews on iOS get no native banner and do
    // need the strip.
    platforms: ['desktop', 'android', 'ios'],
    messageKey: 'announcement.iosLaunch.message',
    cta: { labelKey: 'announcement.iosLaunch.cta', href: '/download' },
    startsAt: '2026-08-10T00:00:00Z',
    endsAt: '2026-09-30T23:59:59Z',
  },
]

export const DISMISS_KEY_PREFIX = 'announce:dismissed:'

export function dismissKey(id: string): string {
  return `${DISMISS_KEY_PREFIX}${id}`
}

export function currentPlatform(): AnnouncementPlatform {
  if (isIOS()) return 'ios'
  if (isAndroid()) return 'android'
  return 'desktop'
}

function isWithinWindow(a: Announcement, now: number): boolean {
  const start = Date.parse(a.startsAt)
  const end = Date.parse(a.endsAt)
  // An unparseable date must not silently pin a banner to the site forever.
  if (Number.isNaN(start) || Number.isNaN(end)) return false
  return now >= start && now <= end
}

function isDismissed(id: string): boolean {
  try {
    return localStorage.getItem(dismissKey(id)) === '1'
  } catch {
    return false
  }
}

/**
 * The single live announcement, or null. Synchronous by design — the strip
 * calls this from a useState initializer so the decision is made before first
 * paint and the strip never pops in after the fact.
 *
 * Only the first match renders; stacking strips is a worse outcome than
 * dropping the runner-up.
 */
export function resolveAnnouncement(
  now: number = Date.now(),
  platform: AnnouncementPlatform = currentPlatform(),
): Announcement | null {
  return (
    announcements.find(
      (a) => a.platforms.includes(platform) && isWithinWindow(a, now) && !isDismissed(a.id),
    ) || null
  )
}
