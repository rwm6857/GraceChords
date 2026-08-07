import { useLocalSearchParams } from 'expo-router'
import DevotionalScreen from '../../../src/screens/DevotionalScreen'

// /devotional/{MM-DD}/{slug} — the full devotional read, pushed over the tabs
// alongside the other daily/* routes.
//
// The date is in the path because slugs are unique WITHIN a day but not globally:
// 13 recur across the year, so a slug alone cannot identify an entry. Both params
// are untrusted (this route is deep-linkable via Android App Links), and the
// screen renders a not-found state for anything it cannot resolve.
export default function DevotionalRoute() {
  const { date, slug } = useLocalSearchParams<{ date?: string, slug?: string }>()
  return <DevotionalScreen dayKey={date} slug={slug} />
}
