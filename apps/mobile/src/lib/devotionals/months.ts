import type { MonthFile } from '@gracechords/core/devotional/types'

// The bundled devotional baseline: the same twelve month artifacts R2 serves,
// committed into the app so the feature works on first launch with no network.
//
// A STATIC MAP of twelve requires, not a computed path. Metro resolves requires
// at build time, so `require('../../../assets/devotionals/' + mm + '.json')`
// would not bundle anything — the map has to be spelled out.
//
// Requires sit inside thunks so a month's JSON is only evaluated when that month
// is actually read. Metro inlines JSON into the bundle either way, so all twelve
// are present in the binary; what the thunk avoids is parsing eleven months of
// object literals to show one day.

type MonthLoader = () => unknown

const BUNDLED: Record<string, MonthLoader> = {
  '01': () => require('../../../assets/devotionals/01.json'),
  '02': () => require('../../../assets/devotionals/02.json'),
  '03': () => require('../../../assets/devotionals/03.json'),
  '04': () => require('../../../assets/devotionals/04.json'),
  '05': () => require('../../../assets/devotionals/05.json'),
  '06': () => require('../../../assets/devotionals/06.json'),
  '07': () => require('../../../assets/devotionals/07.json'),
  '08': () => require('../../../assets/devotionals/08.json'),
  '09': () => require('../../../assets/devotionals/09.json'),
  '10': () => require('../../../assets/devotionals/10.json'),
  '11': () => require('../../../assets/devotionals/11.json'),
  '12': () => require('../../../assets/devotionals/12.json'),
}

/**
 * The bundled month payload, unvalidated. Synchronous — this is what lets the
 * first paint render real content with no spinner.
 *
 * Returns null for an unknown key rather than throwing: a corrupt or missing
 * month must degrade to an empty devotional slot, never take down Daily Word.
 */
export function loadBundledMonth(monthKey: string): unknown {
  const loader = BUNDLED[monthKey]
  if (!loader) return null
  try {
    return loader()
  } catch (e) {
    if (__DEV__) console.warn(`[devotionals] bundled month ${monthKey} failed to load`, e)
    return null
  }
}

export type { MonthFile }
