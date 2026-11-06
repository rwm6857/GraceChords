import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  buildSampleSongStats,
  computeSongStats,
  hasMinRole,
  type FetchedOpen,
  type SongStatsPlayData,
  type SongStatsWindow,
} from '@gracechords/core'
import { useCurrentUser } from './currentUser'
import { useUserRole } from './useUserRole'
import { songStatsData, songStatsPreview } from './songStats'

type Status = 'loading' | 'ready' | 'error'

/**
 * Admins and dev builds can preview Song Stats below the 10-set gate and with
 * sample history. Nobody else sees the switches.
 */
export function useSongStatsPreview() {
  const { role } = useUserRole()
  const canPreview = __DEV__ || hasMinRole(role, 'admin')
  const state = useSyncExternalStore(songStatsPreview.subscribe, songStatsPreview.get)
  return {
    canPreview,
    bypassGate: canPreview && state.bypassGate,
    sample: canPreview && state.sample,
    set: songStatsPreview.set,
  }
}

/**
 * Load and compute the signed-in user's Song Stats. `withOpens` loads song
 * opens too — only the detail view needs them, so the Setlists card never
 * pays for that fetch.
 */
export function useSongStatsInsights(window: SongStatsWindow, opts: { withOpens?: boolean } = {}) {
  const userId = useCurrentUser()?.id ?? null
  const preview = useSongStatsPreview()
  const withOpens = !!opts.withOpens

  const [plays, setPlays] = useState<{ status: Status; data: SongStatsPlayData | null }>({
    status: 'loading',
    data: null,
  })
  const [opens, setOpens] = useState<FetchedOpen[] | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [token, setToken] = useState(0)

  // A set queued or uploaded, or history cleared: reload from the new cache.
  useEffect(() => songStatsData.subscribe(() => setToken((n) => n + 1)), [])

  useEffect(() => {
    let alive = true
    const at = Date.now()
    setNow(at)
    if (preview.sample) {
      setPlays({ status: 'ready', data: { plays: buildSampleSongStats(at).plays, titles: {} } })
      return
    }
    if (!userId) {
      setPlays({ status: 'ready', data: { plays: [], titles: {} } })
      return
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

  useEffect(() => {
    if (!withOpens) return
    let alive = true
    if (preview.sample) {
      setOpens(buildSampleSongStats(Date.now()).opens)
      return
    }
    if (!userId) {
      setOpens([])
      return
    }
    songStatsData
      .loadOpens(userId, window)
      .then((rows) => alive && setOpens(rows))
      // Opens are one section of the detail view; a failure hides that section only.
      .catch(() => alive && setOpens(null))
    return () => {
      alive = false
    }
  }, [userId, window, withOpens, preview.sample, token])

  const insights = useMemo(() => {
    if (!plays.data) return null
    return computeSongStats({
      plays: plays.data.plays,
      opens: withOpens ? opens : null,
      titles: plays.data.titles,
      window,
      now,
    })
  }, [plays.data, opens, withOpens, window, now])

  /** Pull-to-refresh: bypass the day-long cache. Resolves when done; never throws. */
  const reload = useCallback(async () => {
    setNow(Date.now())
    if (preview.sample || !userId) return
    const [data, rows] = await Promise.all([
      songStatsData.loadPlays(userId, { force: true }).catch(() => null),
      withOpens ? songStatsData.loadOpens(userId, window, { force: true }).catch(() => null) : null,
    ])
    if (data) setPlays({ status: 'ready', data })
    if (withOpens) setOpens(rows)
  }, [preview.sample, userId, withOpens, window])

  return {
    status: plays.status,
    insights,
    /** Show the stats: the gate is met, or an admin/dev preview bypasses it. */
    visible: !!insights && (insights.gateMet || preview.bypassGate),
    preview,
    reload,
  }
}
