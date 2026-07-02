import type { BlobStore } from './types'

// In-memory BlobStore for the headless test harness (and any pure logic run).
// Files are a flat Map keyed by relative path; "directories" are path prefixes.
// Mirrors the atomicity/size semantics the expo impl gives on device.

export type MemoryBlobStore = BlobStore & {
  /** Direct view of the backing map (test assertions). */
  files: Map<string, string>
  /** Relative paths currently present, for convenience in tests. */
  keys(): string[]
}

function norm(relPath: string): string {
  return String(relPath || '')
    .split('/')
    .filter((p) => p && p !== '.')
    .join('/')
}

function dirPrefix(relPath: string): string {
  const n = norm(relPath)
  return n ? `${n}/` : ''
}

export function createMemoryBlobStore(): MemoryBlobStore {
  const files = new Map<string, string>()

  const store: MemoryBlobStore = {
    files,
    keys: () => Array.from(files.keys()),

    async exists(relPath) {
      const n = norm(relPath)
      if (files.has(n)) return true
      const prefix = dirPrefix(relPath)
      for (const k of files.keys()) if (k.startsWith(prefix)) return true
      return false
    },

    async readText(relPath) {
      const n = norm(relPath)
      const v = files.get(n)
      if (v == null) throw new Error(`ENOENT: ${n}`)
      return v
    },

    async writeText(relPath, text) {
      files.set(norm(relPath), text)
    },

    async deleteDir(relPath) {
      const prefix = dirPrefix(relPath)
      const n = norm(relPath)
      for (const k of Array.from(files.keys())) {
        if (k === n || k.startsWith(prefix)) files.delete(k)
      }
    },

    async moveDir(fromRel, toRel) {
      const fromPrefix = dirPrefix(fromRel)
      const toPrefix = dirPrefix(toRel)
      // Replace any existing destination tree first (atomic finalize semantics).
      await store.deleteDir(toRel)
      for (const [k, v] of Array.from(files.entries())) {
        if (k.startsWith(fromPrefix)) {
          files.set(toPrefix + k.slice(fromPrefix.length), v)
          files.delete(k)
        }
      }
    },

    async dirSizeBytes(relPath) {
      const prefix = dirPrefix(relPath)
      let total = 0
      for (const [k, v] of files.entries()) {
        if (k.startsWith(prefix)) total += byteLength(v)
      }
      return total
    },
  }

  return store
}

function byteLength(s: string): number {
  // UTF-8 byte length without relying on Buffer/TextEncoder availability.
  let bytes = 0
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4
      i++
    } else bytes += 3
  }
  return bytes
}
