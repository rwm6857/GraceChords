import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import type { Session } from '@supabase/supabase-js'
import { transposeSym } from '@gracechords/core'
import { supabase } from '../src/lib/supabase'
import LoginScreen from '../src/screens/LoginScreen'
import SongListScreen from '../src/screens/SongListScreen'

export default function Index() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Phase 2 proof: a pure function imported from @gracechords/core (consumed as
  // TS source and transpiled by Metro) rendered on screen. C + 2 semitones = D.
  const coreProof = `@gracechords/core: transposeSym('C', 2) = ${transposeSym('C', 2)}`

  return (
    <View style={styles.fill}>
      <Stack.Screen options={{ title: 'GraceChords (dev slice)' }} />
      <Text style={styles.proof}>{coreProof}</Text>
      {loading ? (
        <ActivityIndicator style={styles.pad} />
      ) : session ? (
        <SongListScreen />
      ) : (
        <LoginScreen />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: 24 },
  proof: {
    padding: 8,
    fontSize: 12,
    color: '#333',
    backgroundColor: '#eee',
    textAlign: 'center',
  },
})
