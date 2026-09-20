import { Stack } from 'expo-router'
import Screen from '../src/components/Screen'
import AuthLinkScreen from '../src/screens/AuthLinkScreen'

// Landing route for an auth email opened on this device. app/+native-intent.tsx
// routes here for the two claimed /app/… paths, having stashed the link's
// payload — the tokens are never route params.
//
// Sits OUTSIDE the auth gate: a recovery or confirmation link is by definition
// opened without a session, and this screen is what creates one.

export default function AuthLink() {
  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <AuthLinkScreen />
    </Screen>
  )
}
