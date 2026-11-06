import React from 'react'
import { useTranslation } from 'react-i18next'

// The four summary numbers, one line each, no charts. Shared by the setlists
// rail card and the detail page so they can never disagree.
export default function SongStatsSummary({ summary }) {
  const { t, i18n } = useTranslation('stats')
  const num = (n) => new Intl.NumberFormat(i18n.language).format(n)
  const rows = [
    [t('summary.sets'), num(summary.sessions)],
    [t('summary.songs'), num(summary.distinctSongs)],
    [t('summary.perSet'), summary.avgSongsPerSet == null ? '—' : num(summary.avgSongsPerSet)],
  ]
  // All time has no "new" figure: every song is new.
  if (summary.newSongs != null) rows.push([t('summary.newSongs'), num(summary.newSongs)])
  return (
    <dl className="gc-stats-summary">
      {rows.map(([label, value]) => (
        <div key={label} className="gc-stats-summary__row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
