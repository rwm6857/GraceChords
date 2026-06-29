// src/utils/setlists/sets.js — localStorage-backed CRUD over the pure,
// storage-agnostic set helpers in @gracechords/core.
import {
  newEmptySet as coreNewEmptySet,
  normalizeSet,
  sortSetsByUpdated,
  duplicateSetData,
} from '@gracechords/core/setlists/setStore'

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

export function listSets() {
  return sortSetsByUpdated(readStore().sets)
}
export function getSet(id) {
  const { sets } = readStore()
  return sets[id] || null
}
export function saveSet(input) {
  const set = normalizeSet(input)
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
  return saveSet(duplicateSetData(orig))
}
export function newEmptySet(name) {
  return coreNewEmptySet(name)
}
