import { Stack } from 'expo-router'
import Screen from '../src/components/Screen'
import AuthScreen from '../src/screens/AuthScreen'

// Auth route. The root layout redirects here whenever there is no session, and
// back to the tabs once signed in. AuthScreen holds both the sign-in and
// sign-up modes; sign-up continues to /choose-icon.

export default function Login() {
  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <AuthScreen />
    </Screen>
  )
}
