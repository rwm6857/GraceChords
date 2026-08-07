import React from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { dismissKey, resolveAnnouncement } from '../config/announcements'
import { isNativeAppBannerActive } from '../utils/app/platform'
import { CloseIcon } from './Icons'

export default function AnnouncementStrip(){
  // Resolved in the initializer, not an effect: localStorage is synchronous and
  // React commits before the browser paints, so the strip is either in the very
  // first frame or never in the DOM. An effect would land it one frame late and
  // shove the whole page down — the layout shift this design exists to avoid.
  const [announcement, setAnnouncement] = React.useState(() => (
    isNativeAppBannerActive() ? null : resolveAnnouncement()
  ))
  const { t } = useTranslation('common')

  if (!announcement) return null

  function dismiss(){
    try { localStorage.setItem(dismissKey(announcement.id), '1') } catch {}
    setAnnouncement(null)
  }

  return (
    <aside className="gc-announce" aria-label={t('announcement.regionLabel')}>
      <div className="gc-announce__inner">
        {/* Message and CTA wrap as a unit so the dismiss control keeps its
            place on the first line instead of dropping to a row of its own. */}
        <div className="gc-announce__content">
          <p className="gc-announce__message">{t(announcement.messageKey)}</p>
          <Link className="gc-announce__cta" to={announcement.cta.href}>
            {t(announcement.cta.labelKey)}
          </Link>
        </div>
        <button
          type="button"
          className="gc-announce__dismiss"
          onClick={dismiss}
          aria-label={t('announcement.dismiss')}
        >
          <CloseIcon />
        </button>
      </div>
    </aside>
  )
}
