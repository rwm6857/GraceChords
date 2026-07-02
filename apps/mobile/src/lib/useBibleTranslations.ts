import { useEffect, useState } from 'react'
import {
  buildBibleTranslationGroups,
  getFallbackBibleTranslations,
  getDefaultBibleTranslationId,
  type BibleTranslation,
  type BibleTranslationGroup,
} from '@gracechords/core'
import { getTranslations } from './bibleSource'

// Loads the Bible translation manifest once per app run and exposes it both as
// a flat list and grouped-by-language (for the picker). Falls back to the
// built-in ESV entry if the manifest can't be reached, so the Reader always has
// at least one usable translation.

type State = {
  translations: BibleTranslation[]
  groups: BibleTranslationGroup[]
  defaultTranslationId: string
  loading: boolean
}

export function useBibleTranslations(): State {
  const fallback = getFallbackBibleTranslations()
  const [state, setState] = useState<State>({
    translations: fallback,
    groups: buildBibleTranslationGroups(fallback),
    defaultTranslationId: getDefaultBibleTranslationId(),
    loading: true,
  })

  useEffect(() => {
    let alive = true
    // getTranslations is memoized in bibleSource, so this shares the manifest
    // fetch with the app-open prefetch.
    getTranslations().then((result) => {
      if (!alive) return
      setState({
        translations: result.translations,
        groups: buildBibleTranslationGroups(result.translations),
        defaultTranslationId: result.defaultTranslationId,
        loading: false,
      })
    })
    return () => {
      alive = false
    }
  }, [])

  return state
}
