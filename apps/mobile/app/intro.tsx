import { Stack } from 'expo-router'
import IntroScreen from '../src/screens/IntroScreen'

// First-launch intro. A root-Stack sibling of (tabs) — full screen, no tab bar —
// reached from the auth gate in app/_layout.tsx once a session exists and the
// device-local seen-flag (src/lib/introSeen.ts) is unset. IntroScreen owns its
// own safe-area padding, so there is no Screen wrapper here.

export default function Intro() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <IntroScreen />
    </>
  )
}
