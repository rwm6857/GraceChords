import { useState } from 'react'
import { Button, StyleSheet, Text, TextInput, View } from 'react-native'
import { supabase } from '../lib/supabase'

// TODO: OAuth — Google sign-in is planned for a later slice. It needs
// expo-auth-session + a deep-link redirect (the app `scheme` is already
// "gracechords") wired through supabase.auth.signInWithOAuth. Out of scope here.
export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setBusy(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (signInError) setError(signInError.message)
    setBusy(false)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
      />
      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholder="password"
      />
      <Button
        title={busy ? 'Signing in…' : 'Sign in'}
        onPress={signIn}
        disabled={busy || !email || !password}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8 },
  label: { fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  error: { color: 'red', marginTop: 12 },
})
