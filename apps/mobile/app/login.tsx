import { Stack } from 'expo-router'
import Screen from '../src/components/Screen'
import LoginScreen from '../src/screens/LoginScreen'

// Auth route. The root layout redirects here whenever there is no session, and
// back to the tabs once signed in. Wraps the existing LoginScreen (unchanged
// behavior) in the themed, safe-area Screen surface.

export default function Login() {
  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <LoginScreen />
    </Screen>
  )
}
