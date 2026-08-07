import React from 'react'

// Recovery for route chunks a newer deploy has replaced. A client running an
// older entry bundle asks for chunk hashes the deploy no longer serves, so the
// dynamic import fails and the route dies. Reloading pulls fresh HTML plus the
// current chunk hashes (navigations are network-first in sw.js).
const RELOAD_KEY = 'gc:chunkReloadAt'
const RELOAD_COOLDOWN_MS = 15000

// A reload we started in this page's lifetime. Later callers must be told the
// recovery is already under way rather than being sent down the cooldown path,
// which would surface an error screen while the page is navigating away.
let reloadInFlight = false

/**
 * Reload once to pick up the current deploy's chunk hashes.
 *
 * Returns true when a reload is under way (just started, or started earlier in
 * this page's lifetime) and false when the cooldown says the previous reload
 * already failed to fix things — callers should surface the error instead of
 * looping. The sessionStorage stamp is what carries the cooldown across the
 * reload, so a chunk that is still broken on the second try reports honestly.
 */
export function reloadOnceForStaleChunk(){
  if (typeof window === 'undefined') return false
  if (reloadInFlight) return true
  let last = 0
  try { last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0) } catch {}
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return false
  try { window.sessionStorage.setItem(RELOAD_KEY, String(Date.now())) } catch {}
  reloadInFlight = true
  window.location.reload()
  return true
}

// Stands in for the route only while the recovery reload is in flight, so a
// stale chunk shows the usual loading state instead of flashing ErrorBoundary.
function ReloadingRoute(){
  return React.createElement(
    'div',
    { className: 'container' },
    React.createElement('h3', null, 'Loading...'),
  )
}

function recoverOrRethrow(error){
  if (reloadOnceForStaleChunk()) return { default: ReloadingRoute }
  throw error
}

/**
 * React.lazy for route chunks, hardened against stale-deploy loads.
 *
 * Vite's __vitePreload reports a failed chunk through a cancelable
 * `vite:preloadError` event, and when a listener calls preventDefault() — ours
 * does, in main.jsx, so it can reload instead — it swallows the rejection and
 * the import RESOLVES WITH `undefined`. React.lazy stores that as its result
 * and then dies inside its own initializer reading `_result.default`
 * ("undefined is not an object"), an error that names nothing the reader can
 * act on. So treat a module that arrived without a default export exactly like
 * a rejected import: recover if a reload can still help, otherwise fail with an
 * error that says what actually happened.
 */
export default function lazyRoute(load){
  return React.lazy(() => Promise.resolve().then(load).then(
    (mod) => (mod && mod.default
      ? mod
      : recoverOrRethrow(new Error('Route chunk loaded without a module — its deploy is no longer being served.'))),
    (error) => recoverOrRethrow(error),
  ))
}
