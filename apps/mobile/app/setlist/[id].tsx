import { useLocalSearchParams } from 'expo-router'
import SetlistBuilderScreen from '../../src/screens/SetlistBuilderScreen'

// Builder route, pushed over the tab shell like viewer/[slug].
export default function SetlistBuilderRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <SetlistBuilderScreen setlistId={id} />
}
