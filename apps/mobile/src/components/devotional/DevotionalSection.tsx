import { View } from 'react-native'
import DevotionalCard from './DevotionalCard'
import DevotionalPlaceholder from './DevotionalPlaceholder'
import { useTodayDevotionals } from '../../lib/devotionals/useDevotionalDay'
import { useTheme } from '../../theme/ThemeProvider'

// Today's devotionals on the Daily Word landing screen, directly above the
// reading list. A devotional is matched to a day BY SCRIPTURE, so it only makes
// sense next to the passages it was matched against — and the open-day
// placeholder in particular has no business on Home, where "no devotional today"
// is noise to someone who came to open a song.
//
// Three states, and the distinction between the last two matters:
//
//   * one or two cards — rendered in artifact order, which is the day's reading
//     order, so a devotional on the first reading comes first
//   * the day is genuinely OPEN (~37 days a year) — a quiet placeholder
//   * content has not downloaded yet — NOTHING. No card, no placeholder, no
//     spinner. Claiming "no devotional today" over an entry that exists but is
//     still in flight would be a lie, and a spinner would promise content that
//     may not exist. An absent section is the only honest option, and it fills in
//     silently when the fetch lands.

export default function DevotionalSection() {
  const t = useTheme()
  const { dayKey, day } = useTodayDevotionals()

  // Not downloaded yet: render nothing at all — and no leading margin either, so
  // the reading section keeps its own spacing to the header and nothing hints
  // that something is missing.
  if (!day) return null

  // Matches the gap the reading-section header keeps below the page header.
  const leading = { marginTop: t.spacing.xl }

  if (day.state === 'open') {
    return (
      <View style={leading}>
        <DevotionalPlaceholder />
      </View>
    )
  }

  return (
    <View style={[leading, { gap: t.spacing.lg }]}>
      {day.devotionals.map((devotional) => (
        <DevotionalCard key={devotional.slug} devotional={devotional} dayKey={dayKey} />
      ))}
    </View>
  )
}
