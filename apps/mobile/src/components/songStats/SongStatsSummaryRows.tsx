import { useTranslation } from 'react-i18next'
import type { SongStatsSummary } from '@gracechords/core'
import ListRow from '../ListRow'

// The four summary numbers, one line each, no charts. Shared by the Setlists
// card and the top of the detail view so they can never disagree.
export default function SongStatsSummaryRows({
  summary,
  isLast = true,
  onPress,
}: {
  summary: SongStatsSummary
  isLast?: boolean
  /** Rows are Pressables; inside a tappable card each row must carry the tap itself. */
  onPress?: () => void
}) {
  const { t: tx, i18n } = useTranslation('stats')
  const num = (n: number) => new Intl.NumberFormat(i18n.language).format(n)
  const rows: Array<[string, string]> = [
    [tx('summary.sets'), num(summary.sessions)],
    [tx('summary.songs'), num(summary.distinctSongs)],
    [tx('summary.perSet'), summary.avgSongsPerSet == null ? '—' : num(summary.avgSongsPerSet)],
  ]
  // All time has no "new" figure: every song is new.
  if (summary.newSongs != null) rows.push([tx('summary.newSongs'), num(summary.newSongs)])
  return (
    <>
      {rows.map(([label, value], i) => (
        <ListRow
          key={label}
          title={label}
          value={value}
          accessibilityLabel={`${label}, ${value}`}
          isLast={isLast && i === rows.length - 1}
          onPress={onPress}
        />
      ))}
    </>
  )
}
