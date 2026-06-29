import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { registerAuthAutoRefresh } from '../src/lib/supabase'

export default function RootLayout() {
  useEffect(() => registerAuthAutoRefresh(), [])
  return <Stack screenOptions={{ headerShown: true }} />
}
