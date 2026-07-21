import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAccessibilityFlags } from './accessibilityFlags'

// "Hide controls when idle" — shared by the Song Viewer and the Setlist
// Performer. Unlike the other view options (transpose, font, chord style),
// this preference PERSISTS across launches, so it lives in AsyncStorage.

const PREF_KEY = 'gc.viewer.autoHideChrome'
const HIDE_DELAY_MS = 4500

// Persisted on/off toggle. Defaults OFF; loads asynchronously so the toggle
// reflects the stored value once it resolves, and writes through on change.
export function useAutoHidePref(): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(false)

  useEffect(() => {
    let alive = true
    AsyncStorage.getItem(PREF_KEY)
      .then((v) => {
        if (alive && v != null) setValue(v === '1')
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const set = useCallback((v: boolean) => {
    setValue(v)
    AsyncStorage.setItem(PREF_KEY, v ? '1' : '0').catch(() => {})
  }, [])

  return [value, set]
}

// Drives the fade: when `enabled`, chrome auto-hides after an idle delay and
// `reveal()` (called on a tap / active control use / song change) brings it
// back and restarts the countdown. When disabled, chrome is pinned visible.
// Returns an Animated opacity for the chrome layers plus `visible` for
// pointerEvents gating and the tap-to-reveal overlay.
export function useAutoHideChrome(enabled: boolean) {
  const [visible, setVisible] = useState(true)
  const opacity = useRef(new Animated.Value(1)).current
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Reduce Motion: snap chrome in/out instead of fading. Default settings keep
  // the 260ms fade.
  const { reduceMotion } = useAccessibilityFlags()

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const schedule = useCallback(() => {
    clearTimer()
    if (enabled) timer.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS)
  }, [enabled, clearTimer])

  const reveal = useCallback(() => {
    setVisible(true)
    schedule()
  }, [schedule])

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: reduceMotion ? 0 : 260,
      useNativeDriver: true,
    }).start()
  }, [visible, opacity, reduceMotion])

  // Enabling starts the hide countdown; disabling pins chrome visible.
  useEffect(() => {
    if (enabled) {
      setVisible(true)
      schedule()
    } else {
      clearTimer()
      setVisible(true)
    }
    return clearTimer
  }, [enabled, schedule, clearTimer])

  return { visible, opacity, reveal }
}
