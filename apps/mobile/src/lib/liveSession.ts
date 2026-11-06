import { SESSION_HEARTBEAT_MS } from '@gracechords/core'

// App-level live Session state for the LEADER (RN-free so vitest can drive it;
// the supabase-bound instance, hooks and alerts live in useLiveSession.ts).
//
// One store per app process owns the session row's lifecycle: create, adopt on
// relaunch, broadcast, heartbeat, end. Screens (Performer, Song Viewer) attach
// as the session's SOURCE while they're mounted and detach on unmount. Detach
// writes current_item_uid = null — the session stays live and followers show
// "Waiting for the leader…" — so leaving a screen never ends or orphans it.
//
// The heartbeat re-sends the full position (null included) rather than only
// last_active_at, so a broadcast lost to a network blip recovers on the next
// beat without the leader doing anything.

const BROADCAST_DEBOUNCE_MS = 250

export type LiveSource = { kind: 'set'; setlistId: string } | { kind: 'song'; slug: string }
export type LivePosition = { itemUid: string | null; transpose: number; currentKey: string | null }
export type LiveActive = {
  id: string
  code: string
  chordCode: string | null
  /** null when an adopted row can't be mapped back to a screen (setlist deleted). */
  source: LiveSource | null
  label: string | null
}
export type LiveState = { active: LiveActive | null; busy: boolean }

export type LiveRow = {
  id: string
  code: string
  chord_code?: string | null
  setlist_id: string | null
  items: Array<{ uid: string; kind: 'song' | 'verse' | 'unavailable'; slug?: string; title?: string }>
  current_item_uid: string | null
  transpose?: number | null
  current_key?: string | null
}

export type LiveDeps = {
  buildSnapshot: (entries: unknown[]) => LiveRow['items']
  createSession: (input: { setlistId: string | null; items: LiveRow['items'] }) => Promise<LiveRow>
  updateCurrentItem: (id: string, pos: LivePosition) => Promise<void>
  endSession: (id: string) => Promise<void>
}

const NULL_POSITION: LivePosition = { itemUid: null, transpose: 0, currentKey: null }

export function sameSource(a: LiveSource | null | undefined, b: LiveSource | null | undefined): boolean {
  if (!a || !b || a.kind !== b.kind) return false
  return a.kind === 'set' ? a.setlistId === (b as typeof a).setlistId : a.slug === (b as typeof a).slug
}

/** Map an adopted row back to the screen that leads it. */
export function sourceFromRow(row: Pick<LiveRow, 'setlist_id' | 'items'>): LiveSource | null {
  if (row.setlist_id) return { kind: 'set', setlistId: row.setlist_id }
  const items = row.items || []
  if (items.length === 1 && items[0].kind === 'song' && items[0].slug) return { kind: 'song', slug: items[0].slug }
  return null
}

/** The route a source is led from. */
export function sourceRoute(source: LiveSource): string {
  return source.kind === 'set'
    ? `/perform/${encodeURIComponent(source.setlistId)}`
    : `/viewer/${encodeURIComponent(source.slug)}`
}

/** Snapshot uids are index-derived (`i3`). */
export function parseItemIndex(uid: string | null | undefined): number | null {
  const m = typeof uid === 'string' ? /^i(\d+)$/.exec(uid) : null
  return m ? Number(m[1]) : null
}

function positionKey(p: LivePosition): string {
  return `${p.itemUid ?? ''}|${p.transpose}|${p.currentKey ?? ''}`
}

export function createLiveSessionStore(deps: LiveDeps) {
  let state: LiveState = { active: null, busy: false }
  const listeners = new Set<() => void>()

  // The position currently on screen (NULL_POSITION while no source is attached).
  let position: LivePosition = NULL_POSITION
  let attached = false
  // An adopted row's position, offered once to the first screen that attaches.
  let rowPosition: LivePosition | null = null
  // The last real position this process broadcast, so leaving and reopening the
  // source in the same run lands where the leader was.
  let lastPosition: LivePosition | null = null
  // While a screen applies a restore position, drop its broadcasts so it can't
  // send its default (first song) before it has moved to the restored one.
  let holding = false
  let lastSent = ''
  let debounce: ReturnType<typeof setTimeout> | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null

  function set(next: Partial<LiveState>) {
    state = { ...state, ...next }
    for (const l of listeners) l()
  }

  function write(pos: LivePosition) {
    const active = state.active
    if (!active) return
    lastSent = positionKey(pos)
    deps.updateCurrentItem(active.id, pos).catch(() => {})
  }

  function clearDebounce() {
    if (debounce) clearTimeout(debounce)
    debounce = null
  }

  function startHeartbeat() {
    if (heartbeat) clearInterval(heartbeat)
    heartbeat = setInterval(() => write(position), SESSION_HEARTBEAT_MS)
  }

  function clear() {
    clearDebounce()
    if (heartbeat) clearInterval(heartbeat)
    heartbeat = null
    position = NULL_POSITION
    attached = false
    rowPosition = null
    lastPosition = null
    holding = false
    lastSent = ''
    set({ active: null })
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    matches(source: LiveSource | null | undefined) {
      return !!state.active && sameSource(state.active.source, source)
    },

    /** Create a fresh session led from `source`. Refuses while another is live. */
    async start(source: LiveSource, entries: unknown[], label: string | null) {
      if (state.busy) return
      if (state.active) throw new Error('session_active')
      set({ busy: true })
      try {
        const items = deps.buildSnapshot(entries)
        const row = await deps.createSession({
          setlistId: source.kind === 'set' ? source.setlistId : null,
          items,
        })
        position = NULL_POSITION
        attached = false
        rowPosition = null
        lastPosition = null
        holding = false
        lastSent = ''
        set({ active: { id: row.id, code: row.code, chordCode: row.chord_code ?? null, source, label } })
        startHeartbeat()
      } finally {
        set({ busy: false })
      }
    },

    /** Take over a still-live row found on relaunch. */
    adopt(row: LiveRow, label: string | null = null) {
      if (state.active?.id === row.id) return
      clear()
      rowPosition = row.current_item_uid
        ? { itemUid: row.current_item_uid, transpose: row.transpose || 0, currentKey: row.current_key ?? null }
        : null
      // Until a screen attaches, keep re-sending what the row already says.
      position = rowPosition ?? NULL_POSITION
      set({
        active: { id: row.id, code: row.code, chordCode: row.chord_code ?? null, source: sourceFromRow(row), label },
      })
      startHeartbeat()
    },

    /**
     * A source screen mounted (or the session just started on it). Returns the
     * position it should restore, if any; broadcasts are held until release().
     */
    attach(source: LiveSource): LivePosition | null {
      if (!state.active || !sameSource(state.active.source, source)) return null
      attached = true
      const restore = rowPosition ?? lastPosition
      rowPosition = null
      holding = !!restore
      return restore
    },

    /** The attached screen has applied its restore position. */
    release() {
      holding = false
    },

    setPosition(pos: LivePosition) {
      if (!state.active || !attached || holding) return
      position = pos
      if (pos.itemUid) lastPosition = pos
      const key = positionKey(pos)
      if (key === lastSent) {
        clearDebounce()
        return
      }
      clearDebounce()
      debounce = setTimeout(() => {
        debounce = null
        write(position)
      }, BROADCAST_DEBOUNCE_MS)
    },

    /** The source screen went away: show followers "nothing open". */
    detach() {
      if (!state.active || !attached) return
      attached = false
      holding = false
      clearDebounce()
      position = NULL_POSITION
      write(position)
    },

    /** End the session. State is kept if the write fails, so End can be retried. */
    async end() {
      const active = state.active
      if (!active || state.busy) return
      set({ busy: true })
      try {
        await deps.endSession(active.id)
        clear()
      } finally {
        set({ busy: false })
      }
    },

    /** Forget the session locally without touching the row (sign-out). */
    reset() {
      clear()
    },
  }
}

export type LiveSessionStore = ReturnType<typeof createLiveSessionStore>
