// Read-only access to the setlists the old builder kept in localStorage.
//
// That store is gone — signed-out visitors now get a single draft instead of a
// named local library — but anyone who used the old page still has sets sitting
// under this key. Dropping them silently would be data loss, so the workspace
// offers a one-time import and only then clears the key.
//
// Deliberately read-only apart from the clear: nothing writes this shape again.
const STORAGE_KEY = 'gracechords.sets.v1'
const DISMISSED_KEY = 'gracechords.sets.v1.dismissed'

/** @returns {Array<{ id: string, name: string, items: Array<{ id: string, toKey: string }>, updatedAt: number }>} */
export function readLegacyLocalSets() {
  try {
    if (localStorage.getItem(DISMISSED_KEY) === '1') return []
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const store = JSON.parse(raw)
    const sets = (store && store.sets) || {}
    return Object.values(sets)
      .filter((s) => s && typeof s.id === 'string')
      .map((s) => ({
        id: s.id,
        name: typeof s.name === 'string' ? s.name : '',
        items: Array.isArray(s.items)
          ? s.items.filter((i) => i && i.id).map((i) => ({ id: String(i.id), toKey: i.toKey || '' }))
          : [],
        updatedAt: Number(s.updatedAt) || 0,
      }))
      .sort((a, b) => a.updatedAt - b.updatedAt)
  } catch {
    return []
  }
}

/** Drop the old store once its sets have been imported. */
export function clearLegacyLocalSets() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(DISMISSED_KEY)
  } catch {
    /* nothing to clear */
  }
}

/** Keep the sets but stop offering the import, so the banner doesn't nag. */
export function dismissLegacyLocalSets() {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    /* the banner will simply reappear next visit */
  }
}
