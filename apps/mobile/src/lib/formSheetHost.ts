import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { router } from 'expo-router'

// Host for sheets presented via the native `formSheet` route (app/sheet.tsx).
//
// Router screens can't receive function props, but our sheets are controlled
// components whose state/callbacks live in the owning screen. The bridge: the
// screen registers a render function (closing over its live state) here and
// pushes the /sheet route; the route renders whatever is registered. While the
// sheet is open the owner re-publishes on every render, so toggles/segments
// inside the sheet stay live.
//
// Only one sheet can be hosted at a time — matches the app's one-sheet-at-a-
// time UX (iOS can't present two sheets anyway).

type Entry = {
  render: () => ReactNode
  /** Fires when the route unmounts (native swipe-dismiss or programmatic close). */
  onRouteClosed: () => void
}

let entry: Entry | null = null
let version = 0
const listeners = new Set<() => void>()

function emit() {
  version++
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Route-side: the currently hosted sheet content (null when none). */
export function useFormSheetContent(): ReactNode {
  useSyncExternalStore(subscribe, () => version)
  return entry ? entry.render() : null
}

/** Route-side: called when the sheet route unmounts. */
export function notifyFormSheetRouteClosed() {
  const closed = entry
  entry = null
  emit()
  closed?.onRouteClosed()
}

/**
 * Screen-side: present `render()` in the native formSheet route while
 * `visible` is true. `onDismissed` fires when the sheet is dismissed natively
 * (swipe/scrim) so the owner can sync its `visible` state; owner-initiated
 * closes (`visible` → false) dismiss the route without firing it.
 */
export function useFormSheet(visible: boolean, render: () => ReactNode, onDismissed: () => void) {
  const renderRef = useRef(render)
  renderRef.current = render
  const dismissedRef = useRef(onDismissed)
  dismissedRef.current = onDismissed
  const openRef = useRef(false)

  useEffect(() => {
    if (visible && !openRef.current) {
      openRef.current = true
      entry = {
        render: () => renderRef.current(),
        onRouteClosed: () => {
          if (openRef.current) {
            openRef.current = false
            dismissedRef.current()
          }
        },
      }
      emit()
      router.push('/sheet')
    } else if (!visible && openRef.current) {
      // Owner-initiated close. Keep `entry` registered so the content stays
      // visible through the exit animation; the route unmount clears it.
      openRef.current = false
      if (router.canGoBack()) router.back()
    }
  }, [visible])

  // While open, re-publish on every owner render so the sheet reflects the
  // owner's latest state (switch flips, segment changes, live counts).
  useEffect(() => {
    if (openRef.current) emit()
  })

  // Owner unmounting with the sheet still up: dismiss the route.
  useEffect(
    () => () => {
      if (openRef.current) {
        openRef.current = false
        if (router.canGoBack()) router.back()
      }
    },
    [],
  )
}
