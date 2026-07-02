import { useLocalSearchParams } from 'expo-router'
import PerformerScreen from '../../src/screens/PerformerScreen'

// Performer / Setlist Viewer route, pushed over the tab shell like
// viewer/[slug] and setlist/[id].
export default function PerformerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <PerformerScreen setlistId={id} />
}
