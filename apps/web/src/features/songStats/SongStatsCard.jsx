import React from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SONG_STATS_DEFAULT_WINDOW, SONG_STATS_INSIGHT_RULES } from '@gracechords/core'
import { ChevronRightIcon } from '../../components/Icons'
import SongStatsSummary from './SongStatsSummary'
import { useSongStatsInsights } from './useSongStatsInsights'
import '../../styles/song-stats.css'

/**
 * Song Stats summary at the top of the saved-setlists rail, where planning
 * happens. Renders nothing until the user has logged enough sets.
 */
export default function SongStatsCard() {
  const { t } = useTranslation('stats')
  const { insights, visible, preview } = useSongStatsInsights(SONG_STATS_DEFAULT_WINDOW)
  if (!insights || !visible) return null

  const note = preview.sample
    ? t('preview.sampleBadge')
    : !insights.gateMet
      ? t('preview.belowGate', { done: insights.totalSessions, count: SONG_STATS_INSIGHT_RULES.gateSessions })
      : t('cardWindow')

  return (
    <div className="gc-stats-card">
      <Link to="/song-stats" className="gc-stats-card__link">
        <span className="gc-stats-card__head">
          <span>
            <span className="gc-stats-card__title">{t('title')}</span>
            <span className="gc-stats-card__note">{note}</span>
          </span>
          <ChevronRightIcon />
        </span>
        <SongStatsSummary summary={insights.summary} />
      </Link>
    </div>
  )
}
