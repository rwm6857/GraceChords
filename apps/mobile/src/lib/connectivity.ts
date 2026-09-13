import { useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import * as Network from 'expo-network'

// Whether the device currently has a usable network.
//
// Module-level store + useSyncExternalStore, the same pattern as currentUser.ts
// and the other stores in src/lib, so every consumer shares ONE subscription
// rather than each polling for itself.
//
// This drives an offline BANNER, nothing else. It deliberately does not gate any
// request: expo-network reports the interface, not reachability, so a captive
// portal or a dead uplink both read as online. Requests keep their own deadlines
// (requestBudget.ts) and remain the real source of truth about whether something
// worked — the banner only explains a failure the user is already seeing.

let online = true
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function setOnline(next: boolean) {
  if (online === next) return
  online = next
  emit()
}

async function probe(): Promise<void> {
  try {
    const state = await Network.getNetworkStateAsync()
    // `isInternetReachable` is undefined on some platforms/versions; fall back to
    // isConnected so an unknown value never reads as offline. Being wrong in the
    // optimistic direction just means no banner, which is the safer mistake.
    const reachable = state.isInternetReachable ?? state.isConnected ?? true
    setOnline(Boolean(reachable))
  } catch {
    setOnline(true)
  }
}

let started = false
let poll: ReturnType<typeof setInterval> | null = null
let appStateSub: { remove: () => void } | null = null

// 20 s: slow enough to be invisible on battery, fast enough that the banner
// clears on its own shortly after the user walks back into coverage. There is no
// connectivity event on expo-network, so this is a poll or nothing.
const POLL_MS = 20000

/** Begin tracking connectivity. Idempotent; call once at app root. */
export function startConnectivityWatch(): () => void {
  if (started) return () => {}
  started = true
  void probe()
  poll = setInterval(() => void probe(), POLL_MS)
  // Foregrounding is the most likely moment for the answer to have changed, and
  // it is the moment a user is actually looking at the screen.
  appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void probe()
  })
  return () => {
    if (poll) clearInterval(poll)
    poll = null
    appStateSub?.remove()
    appStateSub = null
    started = false
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): boolean {
  return online
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Test seam: reset module state between cases. */
export function __resetConnectivityForTests(): void {
  online = true
  listeners.clear()
  if (poll) clearInterval(poll)
  poll = null
  appStateSub?.remove()
  appStateSub = null
  started = false
}
