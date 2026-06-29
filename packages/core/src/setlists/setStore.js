// Pure, storage-agnostic setlist helpers. The persistence binding lives in the
// app (web: localStorage; mobile: AsyncStorage); this module only shapes data.
//
// Set shape: { id, name, items: [{ id, toKey }], createdAt, updatedAt }

export function makeSetId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function newEmptySet(name = 'Untitled Set') {
  return { id: null, name, items: [], createdAt: null, updatedAt: null }
}

export function normalizeSet(input, now = Date.now()) {
  return {
    id: input.id || makeSetId(),
    name: input.name?.trim() || 'Untitled Set',
    items: Array.isArray(input.items) ? input.items : [],
    createdAt: input.createdAt || now,
    updatedAt: now,
  }
}

export function sortSetsByUpdated(setsObj) {
  return Object.values(setsObj || {}).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export function duplicateSetData(orig) {
  return { name: `Copy of ${orig.name}`, items: orig.items.map(i => ({ ...i })) }
}
