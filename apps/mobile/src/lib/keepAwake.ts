import { useEffect } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'

// "Keep screen awake" — engaged from the Song Viewer / Setlist Performer view
// options. The on/off preference persists in defaults.ts (shared across both
// viewers); this hook only owns activation. The lock is tied to screen focus:
// it holds ONLY while the toggle is on AND the screen is focused, and releases
// on blur, unmount, or toggle-off, so it never keeps the display awake in the
// background.

const TAG = 'gc-viewer-keep-awake'

export function useKeepAwakeWhileFocused(enabled: boolean): void {
  const isFocused = useIsFocused()

  useEffect(() => {
    if (!(enabled && isFocused)) return
    activateKeepAwakeAsync(TAG).catch(() => {})
    return () => {
      deactivateKeepAwake(TAG).catch(() => {})
    }
  }, [enabled, isFocused])
}
