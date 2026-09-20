import { Stack } from 'expo-router'
import ResetPasswordScreen from '../src/screens/ResetPasswordScreen'

// Set-a-new-password route, reached from /auth-link once a recovery link's
// session has been adopted.
//
// Listed with the auth-flow routes in the root layout's gate. The recovery
// session means a session usually EXISTS by the time this mounts, but the gate
// must not bounce it in the window before that lands — and must never redirect
// away from a half-finished reset.

export default function ResetPassword() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ResetPasswordScreen />
    </>
  )
}
