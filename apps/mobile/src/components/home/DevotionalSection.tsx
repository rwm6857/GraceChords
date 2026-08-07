import { View } from 'react-native'
import DevotionalCard from '../devotional/DevotionalCard'
import DevotionalPlaceholder from '../devotional/DevotionalPlaceholder'
import { useTodayDevotionals } from '../../lib/devotionals/useDevotionalDay'
import { useTheme } from '../../theme/ThemeProvider'

// Today's devotionals on the home dashboard. Sits directly below the Daily Word
// card because these are devotionals ON that card's readings — a devotional is
// matched to a day by scripture, so it belongs beside the passages it speaks to.
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

  // Not downloaded yet: render nothing at all.
  if (!day) return null

  if (day.state === 'open') return <DevotionalPlaceholder />

  return (
    <View style={{ gap: t.spacing.lg }}>
      {day.devotionals.map((devotional) => (
        <DevotionalCard key={devotional.slug} devotional={devotional} dayKey={dayKey} />
      ))}
    </View>
  )
}
