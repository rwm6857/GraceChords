import { useEffect, useState } from 'react'
import { Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { fetchSongStatsEnabled } from '@gracechords/core'
import { supabase } from './supabase'
import { useCurrentUser } from './currentUser'
import { isSongStatsEnabled, setSongStatsEnabled, songStats } from './songStats'
import { actionFailureMessage } from './errors'

/**
 * The two Song Stats controls — turn it off/on, clear my history — with their
 * confirm dialogs. Shared by the Account screen and the About Song Stats
 * sheet so both say and do exactly the same thing.
 */
export function useSongStatsControls() {
  const { t: tx } = useTranslation(['profile', 'common'])
  const user = useCurrentUser()
  // Seeded from the on-device cache so the switch is right offline; refreshed
  // from users.preferences on mount.
  const [enabled, setEnabled] = useState(isSongStatsEnabled)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    let alive = true
    fetchSongStatsEnabled(supabase, user.id)
      .then((on) => {
        songStats.setEnabled(user.id, on)
        if (alive) setEnabled(on)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [user?.id])

  async function apply(next: boolean) {
    setBusy(true)
    try {
      await setSongStatsEnabled(next)
      setEnabled(next)
    } catch (err) {
      Alert.alert(tx('songStats.toggleFailedTitle'), actionFailureMessage('SongStats.setEnabled', err, tx))
    } finally {
      setBusy(false)
    }
  }

  function toggle(next: boolean) {
    if (busy) return
    if (next) {
      void apply(true)
      return
    }
    Alert.alert(tx('songStats.offAlert.title'), tx('songStats.offAlert.message'), [
      { text: tx('common:cancel'), style: 'cancel' },
      { text: tx('songStats.offAlert.confirm'), onPress: () => void apply(false) },
    ])
  }

  function confirmClear() {
    if (busy) return
    Alert.alert(tx('songStats.clearAlert.title'), tx('songStats.clearAlert.message'), [
      { text: tx('common:cancel'), style: 'cancel' },
      {
        text: tx('songStats.clearAlert.confirm'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true)
          try {
            await songStats.clearHistory()
            Alert.alert(tx('songStats.cleared'))
          } catch (err) {
            Alert.alert(tx('songStats.clearFailedTitle'), actionFailureMessage('SongStats.clear', err, tx))
          } finally {
            setBusy(false)
          }
        },
      },
    ])
  }

  return { enabled, busy, toggle, confirmClear }
}
