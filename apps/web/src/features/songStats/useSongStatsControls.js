import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'
import { isSongStatsEnabled, setSongStatsEnabled, songStats } from '../../lib/songStats'
import { showToast } from '../../utils/app/toast'

/**
 * Turn Song Stats off/on and Clear my history, with their confirms. Used by
 * the About Song Stats dialog; same strings and confirms as the Profile page.
 */
export function useSongStatsControls() {
  const { t } = useTranslation('common')
  const { refreshProfile } = useAuth()
  const [override, setOverride] = useState(null)
  const [busy, setBusy] = useState(false)
  const enabled = override ?? isSongStatsEnabled()

  async function toggle(next) {
    if (busy) return
    if (!next && !window.confirm(t('songStats.offConfirm'))) return
    setBusy(true)
    try {
      await setSongStatsEnabled(next)
      setOverride(next)
      // Keep the Profile page and AuthProvider's cached preferences in step.
      refreshProfile?.()
    } catch (err) {
      console.error('[SongStats] toggle failed:', err)
      showToast(t('songStats.toggleFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function confirmClear() {
    if (busy || !window.confirm(t('songStats.clearConfirm'))) return
    setBusy(true)
    try {
      await songStats.clearHistory()
      showToast(t('songStats.cleared'))
    } catch (err) {
      console.error('[SongStats] clear failed:', err)
      showToast(t('songStats.clearFailed'))
    } finally {
      setBusy(false)
    }
  }

  return { enabled, busy, toggle, confirmClear }
}
