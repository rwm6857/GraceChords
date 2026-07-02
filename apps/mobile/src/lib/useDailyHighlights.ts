import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { toggleSelection } from '@gracechords/core'

// Daily Word verse highlights, persisted to disk so they survive a cold
// restart. Stored per passage (keyed by passageId) and stamped with the
// calendar day: highlights persist all day, and the first open on a new day
// starts clean. Deselecting a verse removes it (and empties are dropped).

const STORAGE_KEY = 'dailyword:highlights'

type Stored = { day: string; selections: Record<string, number[]> }

function todayStamp() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useDailyHighlights() {
  const [selections, setSelections] = useState<Record<string, Set<number>>>({})
  const [hydrated, setHydrated] = useState(false)

  // Load once. Only restore highlights that belong to today.
  useEffect(() => {
    let alive = true
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!alive) return
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Stored
            if (parsed?.day === todayStamp() && parsed.selections) {
              const restored: Record<string, Set<number>> = {}
              for (const [key, arr] of Object.entries(parsed.selections)) {
                if (Array.isArray(arr) && arr.length) restored[key] = new Set(arr)
              }
              setSelections(restored)
            }
          } catch {}
        }
        setHydrated(true)
      })
      .catch(() => {
        if (alive) setHydrated(true)
      })
    return () => {
      alive = false
    }
  }, [])

  // Persist after hydration. Day-stamped, so a new day's first write clears the
  // previous day's highlights.
  useEffect(() => {
    if (!hydrated) return
    const serializable: Record<string, number[]> = {}
    for (const [key, set] of Object.entries(selections)) {
      if (set.size) serializable[key] = Array.from(set).sort((a, b) => a - b)
    }
    const payload: Stored = { day: todayStamp(), selections: serializable }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => {})
  }, [selections, hydrated])

  const toggleVerse = useCallback((passageKey: string, verse: number) => {
    if (!passageKey) return
    setSelections((prev) => {
      const current = prev[passageKey] ?? new Set<number>()
      const next = toggleSelection(current, verse)
      const updated = { ...prev, [passageKey]: next }
      if (next.size === 0) delete updated[passageKey]
      return updated
    })
  }, [])

  return { selections, toggleVerse }
}
