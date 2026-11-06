import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Alert, Share } from 'react-native'
import { buildSnapshot, createSession, endSession, updateCurrentItem } from '@gracechords/core'
import { supabase } from './supabase'
import { buildSessionShareUrl } from './setlistShare'
import {
  createLiveSessionStore,
  sameSource,
  type LivePosition,
  type LiveSource,
  type LiveState,
} from './liveSession'

// Loose translator type: callers pass react-i18next's namespaced `t`.
type Tx = (key: string, options?: Record<string, unknown>) => string

// The app's one live-session store, bound to Supabase. See liveSession.ts.
export const liveSession = createLiveSessionStore({
  buildSnapshot: (entries) => buildSnapshot(entries as Parameters<typeof buildSnapshot>[0]),
  // items always come from buildSnapshot above, so the narrower core type holds.
  createSession: (input) => createSession(supabase, input as Parameters<typeof createSession>[1]),
  updateCurrentItem: (id, pos) => updateCurrentItem(supabase, id, pos),
  endSession: (id) => endSession(supabase, id),
})

export function useLiveSession(): LiveState {
  return useSyncExternalStore(liveSession.subscribe, liveSession.getState, liveSession.getState)
}

/**
 * A screen that can lead a session (Performer, Song Viewer). While the live
 * session's source is this screen, it is attached: `broadcast` sends its
 * position, and unmounting detaches (followers see "nothing open"). `restore`
 * is the position to jump to on attach; call `release()` once applied —
 * broadcasts are held until then. `restoreToken` changes on every attach.
 */
export function useLiveSessionSource(source: LiveSource | null) {
  const state = useLiveSession()
  const live = !!source && !!state.active && sameSource(state.active.source, source)
  const sourceKey = source ? (source.kind === 'set' ? `set:${source.setlistId}` : `song:${source.slug}`) : ''
  const [attachment, setAttachment] = useState<{ token: number; restore: LivePosition | null }>({
    token: 0,
    restore: null,
  })

  useEffect(() => {
    if (!live || !source) return
    const restore = liveSession.attach(source)
    setAttachment((a) => ({ token: a.token + 1, restore }))
    return () => liveSession.detach()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, sourceKey, state.active?.id])

  const broadcast = useCallback((pos: LivePosition) => liveSession.setPosition(pos), [])
  const release = useCallback(() => liveSession.release(), [])

  return {
    live,
    busy: state.busy,
    active: state.active,
    restore: attachment.restore,
    restoreToken: attachment.token,
    broadcast,
    release,
  }
}

async function shareLink(code: string | null) {
  if (!code) return
  await Share.share({ message: buildSessionShareUrl(code) }).catch(() => {})
}

/** The live-session menu: share either link, or end. End keeps state on failure. */
export function showLiveSessionMenu(tx: Tx) {
  const active = liveSession.getState().active
  if (!active) return
  Alert.alert(tx('setlist:session.manageTitle'), undefined, [
    { text: tx('setlist:session.shareTeam'), onPress: () => void shareLink(active.chordCode) },
    { text: tx('setlist:session.shareEveryone'), onPress: () => void shareLink(active.code) },
    {
      text: tx('setlist:session.end'),
      style: 'destructive',
      onPress: () => {
        liveSession.end().catch((err) => {
          Alert.alert(tx('setlist:session.endFailed'), err instanceof Error ? err.message : String(err))
        })
      },
    },
    { text: tx('common:cancel'), style: 'cancel' },
  ])
}

/**
 * Start (or manage) a session led from `source`. If a session for another
 * source is live, confirm ending it first. Opens the share menu once live.
 */
export function startOrManageLiveSession(
  tx: Tx,
  source: LiveSource,
  entries: unknown[],
  label: string | null,
) {
  const { active, busy } = liveSession.getState()
  if (busy) return
  if (active && sameSource(active.source, source)) {
    showLiveSessionMenu(tx)
    return
  }
  const begin = () => {
    liveSession
      .start(source, entries, label)
      .then(() => showLiveSessionMenu(tx))
      .catch((err) => {
        Alert.alert(tx('setlist:session.startFailed'), err instanceof Error ? err.message : String(err))
      })
  }
  if (!active) {
    begin()
    return
  }
  Alert.alert(tx('setlist:session.switchTitle'), tx('setlist:session.switchMessage'), [
    { text: tx('common:cancel'), style: 'cancel' },
    {
      text: tx('setlist:session.switchConfirm'),
      style: 'destructive',
      onPress: () => {
        liveSession
          .end()
          .then(begin)
          .catch((err) => {
            Alert.alert(tx('setlist:session.endFailed'), err instanceof Error ? err.message : String(err))
          })
      },
    },
  ])
}
