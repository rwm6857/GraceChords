import { Stack } from 'expo-router'
import Screen from '../src/components/Screen'
import ForgotPasswordScreen from '../src/screens/ForgotPasswordScreen'

// Reached from "Forgot?" on /login, so it sits OUTSIDE the auth gate — a signed
// out user has to be able to open it.

export default function ForgotPassword() {
  return (
    <Screen edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ForgotPasswordScreen />
    </Screen>
  )
}
