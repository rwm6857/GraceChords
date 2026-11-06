import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { buildSampleSongStats, computeSongStats } from '@gracechords/core'
import { useAuth } from '../../hooks/useAuth'
import { songStatsData, songStatsPreview } from '../../lib/songStats'

/**
 * Admins and dev builds can preview Song Stats below the 10-set gate and with
 * sample history. Nobody else sees the switches.
 */
export function useSongStatsPreview() {
  const { hasMinRole } = useAuth()
  const canPreview = !!import.meta.env.DEV || hasMinRole('admin')
  const state = useSyncExternalStore(songStatsPreview.subscribe, songStatsPreview.get)
  return {
    canPreview,
    bypassGate: canPreview && state.bypassGate,
    sample: canPreview && state.sample,
    set: songStatsPreview.set,
  }
}

/** Load and compute the signed-in user's Song Stats (mirrors the mobile hook). */
export function useSongStatsInsights(range) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const preview = useSongStatsPreview()

  const [plays, setPlays] = useState({ status: 'loading', data: null })
  const [now, setNow] = useState(() => Date.now())
  const [token, setToken] = useState(0)

  useEffect(() => songStatsData.subscribe(() => setToken((n) => n + 1)), [])

  useEffect(() => {
    let alive = true
    const at = Date.now()
    setNow(at)
    if (preview.sample) {
      setPlays({ status: 'ready', data: { plays: buildSampleSongStats(at).plays, titles: {} } })
      return undefined
    }
    if (!userId) {
      setPlays({ status: 'ready', data: { plays: [], titles: {} } })
      return undefined
    }
    setPlays((p) => ({ status: p.data ? p.status : 'loading', data: p.data }))
    songStatsData
      .loadPlays(userId)
      .then((data) => alive && setPlays({ status: 'ready', data }))
      .catch(() => alive && setPlays((p) => ({ status: p.data ? 'ready' : 'error', data: p.data })))
    return () => {
      alive = false
    }
  }, [userId, preview.sample, token])

  const insights = useMemo(() => {
    if (!plays.data) return null
    return computeSongStats({
      plays: plays.data.plays,
      titles: plays.data.titles,
      window: range,
      now,
    })
  }, [plays.data, range, now])

  const reload = useCallback(async () => {
    setNow(Date.now())
    if (preview.sample || !userId) return
    const data = await songStatsData.loadPlays(userId, { force: true }).catch(() => null)
    if (data) setPlays({ status: 'ready', data })
  }, [preview.sample, userId])

  return {
    status: plays.status,
    insights,
    visible: !!insights && (insights.gateMet || preview.bypassGate),
    preview,
    reload,
  }
}
