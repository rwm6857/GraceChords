import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SONG_STATS_RULES } from '@gracechords/core'
import { Button } from '../../components/ui/layout-kit'
import { useSongStatsControls } from './useSongStatsControls'

/**
 * "About Song Stats": what is counted, who can see it, and the two controls.
 * The thresholds come from SONG_STATS_RULES — the capture rule's own
 * constants — so this copy can never describe a rule the code no longer uses.
 */
export default function SongStatsAboutDialog({ open, onClose }) {
  if (!open) return null
  return <AboutContent onClose={onClose} />
}

function AboutContent({ onClose }) {
  const { t, i18n } = useTranslation('stats')
  const controls = useSongStatsControls()
  const num = (n) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(n)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="gc-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gc-stats-about-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="gc-modal gc-stats-about">
        <h2 id="gc-stats-about-title">{t('about.title')}</h2>
        <p>{t('about.intro')}</p>
        <p>
          {t('about.rule', {
            perSong: num(SONG_STATS_RULES.perSongSessionMs / 60_000),
            min: num(SONG_STATS_RULES.minSessionMs / 60_000),
            seconds: num(SONG_STATS_RULES.minSongDisplayMs / 1000),
          })}
        </p>
        <p>{t('about.private')}</p>
        <p>{t('about.control')}</p>
        <div className="gc-stats-about__links">
          <Link to="/privacy" onClick={onClose}>{t('about.privacy')}</Link>
          <button type="button" className="gc-linkbtn" disabled={controls.busy} onClick={controls.confirmClear}>
            {t('about.clear')}
          </button>
          <button
            type="button"
            className="gc-linkbtn"
            disabled={controls.busy}
            onClick={() => controls.toggle(!controls.enabled)}
          >
            {controls.enabled ? t('about.turnOff') : t('about.turnOn')}
          </button>
        </div>
        <div className="gc-modal-actions">
          <Button variant="secondary" onClick={onClose} autoFocus>
            {t('common:close')}
          </Button>
        </div>
      </div>
    </div>
  )
}
