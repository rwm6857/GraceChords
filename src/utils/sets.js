// src/utils/sets.js
const STORAGE_KEY = 'gracechords.sets.v1'

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : { sets: {} }
  } catch {
    return { sets: {} }
  }
}
function writeStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/**
 * Set shape:
 * { id, name, items: [{ id, toKey }], createdAt, updatedAt }
 */
export function listSets() {
  const { sets } = readStore()
  return Object.values(sets).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}
export function getSet(id) {
  const { sets } = readStore()
  return sets[id] || null
}
export function saveSet(input) {
  const now = Date.now()
  const set = {
    id: input.id || uuid(),
    name: input.name?.trim() || 'Untitled Set',
    items: Array.isArray(input.items) ? input.items : [],
    createdAt: input.createdAt || now,
    updatedAt: now,
  }
  const store = readStore()
  store.sets[set.id] = set
  writeStore(store)
  return set
}
export function deleteSet(id) {
  const store = readStore()
  if (store.sets[id]) {
    delete store.sets[id]
    writeStore(store)
    return true
  }
  return false
}
export function duplicateSet(id) {
  const orig = getSet(id)
  if (!orig) return null
  return saveSet({
    name: `Copy of ${orig.name}`,
    items: orig.items.map(i => ({ ...i })),
  })
}
export function newEmptySet(name = 'Untitled Set') {
  return { id: null, name, items: [], createdAt: null, updatedAt: null }
}
