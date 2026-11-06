import { useLocalSearchParams } from 'expo-router'
import PerformerScreen from '../../src/screens/PerformerScreen'

// Performer / Setlist Viewer route, pushed over the tab shell like
// viewer/[slug] and setlist/[id]. `?live=1` (from the builder's share sheet)
// starts a live session for the set once it has loaded.
export default function PerformerRoute() {
  const { id, live } = useLocalSearchParams<{ id: string; live?: string }>()
  return <PerformerScreen setlistId={id} autoLive={live === '1'} />
}
