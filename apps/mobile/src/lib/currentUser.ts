import { useSyncExternalStore } from 'react'
import type { Session, User } from '@supabase/supabase-js'

// The single source for "who is signed in".
//
// It makes NO network request and holds NO auth subscription of its own. The root
// layout already resolves exactly one session at launch and already owns the one
// onAuthStateChange subscription, so both places it sets a session also call
// setCurrentUserFromSession — see app/_layout.tsx. Identity therefore has one
// source, and it is the same session the splash gate resolved.
//
// What this replaces: a per-component hook that called supabase.auth.getUser()
// AND opened its own onAuthStateChange. Home mounted it twice (directly, and
// again inside useProfileSprite), so opening Home cost two round trips to
// /auth/v1/user plus two extra subscriptions, and Settings cost two more.
//
// getUser() vs the session's user, stated plainly because it is a real trade:
// getUser() validates the token server-side and returns the current server-side
// record; the session's `user` is the snapshot from the last token issuance. So a
// display name or email changed on the web now lags on mobile by up to one token
// refresh (<=1 h) or a relaunch. For a greeting and an avatar that is fine, and
// it buys the case that matters more — offline. getUser() cannot answer without a
// network, so an offline launch used to greet a signed-in user as "friend"; the
// session can answer from storage, so it now greets them by name.
//
// No authorization depends on this. RLS decides access server-side, and a
// rejected token still fails every query, so a stale cached name is cosmetic.
//
// Module-level store + useSyncExternalStore, the same pattern as defaults.ts and
// eight other stores in src/lib. RN-free, so it unit-tests headless.

export type CurrentUserState = {
  user: User | null
  /**
   * False only before the root layout has resolved the session. Screens that
   * must not act on "signed out" until auth is known should check this — the
   * root publishes before `ready` flips, so in practice a mounted screen always
   * sees true, but a screen mounted outside that gate (or a test) can tell the
   * difference between "no user" and "not known yet".
   */
  resolved: boolean
}

const UNRESOLVED: CurrentUserState = { user: null, resolved: false }

let state: CurrentUserState = UNRESOLVED
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/**
 * Subscribe to identity changes. Exported because useSyncExternalStore needs a
 * stable reference and because it is the seam the unit tests observe — a
 * non-React consumer should read getCurrentUserSnapshot instead.
 */
export function subscribeCurrentUser(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): CurrentUserState {
  return state
}

/**
 * True when two User objects carry the same identity as far as this app's UI is
 * concerned.
 *
 * This matters because auth-js hands over a NEW User object on every
 * TOKEN_REFRESHED — roughly hourly — with identical content. Replacing state
 * then would re-render Home, Settings and the Daily Word landing for nothing,
 * and would break the reference stability useSyncExternalStore requires of
 * getSnapshot. Compared fields are exactly the ones read by getDisplayName
 * (greetings.ts) and useProfileSprite.
 */
function sameIdentity(a: User | null, b: User | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.id !== b.id || a.email !== b.email) return false
  const am = (a.user_metadata ?? {}) as Record<string, unknown>
  const bm = (b.user_metadata ?? {}) as Record<string, unknown>
  return am.full_name === bm.full_name && am.name === bm.name && am.avatar_url === bm.avatar_url
}

/**
 * Publish the signed-in user. Called ONLY from app/_layout.tsx, from the two
 * places that already own a session: the launch hydration join and the
 * onAuthStateChange callback.
 */
export function setCurrentUserFromSession(session: Session | null): void {
  const next = session?.user ?? null
  if (state.resolved && sameIdentity(state.user, next)) return
  state = { user: next, resolved: true }
  emit()
}

/** Synchronous read, safe before the root has published (returns unresolved). */
export function getCurrentUserSnapshot(): CurrentUserState {
  return state
}

/**
 * The signed-in user, or null. Same signature as the hook this replaces, so call
 * sites are unchanged.
 */
export function useCurrentUser(): User | null {
  return useSyncExternalStore(subscribeCurrentUser, getSnapshot, getSnapshot).user
}

/** The user plus whether auth has resolved yet. */
export function useCurrentUserState(): CurrentUserState {
  return useSyncExternalStore(subscribeCurrentUser, getSnapshot, getSnapshot)
}

/**
 * Test-only: drop back to the unresolved state so each test starts clean.
 * Production code must go through setCurrentUserFromSession.
 */
export function resetCurrentUserForTests(): void {
  state = UNRESOLVED
  listeners.clear()
}
