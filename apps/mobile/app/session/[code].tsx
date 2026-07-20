import { useLocalSearchParams } from 'expo-router'
import SessionFollowerScreen from '../../src/screens/SessionFollowerScreen'

// Live-session follower route, reached from a /s/{code} deep link (see
// app/+native-intent.tsx) or the custom scheme. Public/anonymous — the auth gate
// in app/_layout.tsx whitelists the `session` segment.
export default function SessionRoute() {
  const { code } = useLocalSearchParams<{ code: string }>()
  return <SessionFollowerScreen code={code} />
}
