import { Stack } from 'expo-router'
import Screen from '../src/components/Screen'
import SpritePickerScreen from '../src/screens/SpritePickerScreen'

// Post-signup avatar picker. Reached from the sign-up flow only; the root
// layout's auth gate allows this route with OR without a session (signup with
// email confirmation OFF signs in immediately, ON leaves no session yet).

export default function ChooseIcon() {
  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <SpritePickerScreen />
    </Screen>
  )
}
