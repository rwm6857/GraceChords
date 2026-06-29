import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Button,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { fetchSongList } from '@gracechords/core'
import { supabase } from '../lib/supabase'

type SongRow = { id: string; slug: string; title: string }

export default function SongListScreen() {
  const [songs, setSongs] = useState<SongRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchSongList(supabase)
      .then((rows) => {
        if (alive) setSongs(rows as SongRow[])
      })
      .catch((err) => {
        if (alive) setError(err?.message ?? String(err))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  if (loading) return <ActivityIndicator style={styles.pad} />
  if (error) return <Text style={styles.error}>{error}</Text>

  return (
    <View style={styles.fill}>
      <View style={styles.bar}>
        <Text style={styles.count}>{songs.length} songs</Text>
        <Button title="Sign out" onPress={() => supabase.auth.signOut()} />
      </View>
      <FlatList
        data={songs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Text style={styles.item}>{item.title}</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: 24 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  count: { fontWeight: '600' },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  error: { color: 'red', padding: 24 },
})
