import { Directory, File, Paths } from 'expo-file-system'
import type { BlobStore } from './types'

// Production BlobStore backed by the expo-file-system class API (File/Directory/
// Paths — the same API src/lib/exportSong.ts uses). Rooted at the app DOCUMENT
// directory so downloads survive relaunch (unlike Paths.cache). All expo FS ops
// here are synchronous except File.text(); we present an async interface so the
// logic layer is storage-agnostic.

function seg(relPath: string): string[] {
  return String(relPath || '')
    .split('/')
    .filter((p) => p && p !== '.')
}

function fileAt(relPath: string): File {
  return new File(Paths.document, ...seg(relPath))
}

function dirAt(relPath: string): Directory {
  return new Directory(Paths.document, ...seg(relPath))
}

function ensureDir(relPath: string): void {
  const dir = dirAt(relPath)
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true })
}

function parentRel(relPath: string): string {
  const parts = seg(relPath)
  return parts.slice(0, -1).join('/')
}

export const expoBlobStore: BlobStore = {
  async exists(relPath) {
    const file = fileAt(relPath)
    if (file.exists) return true
    return dirAt(relPath).exists
  },

  async readText(relPath) {
    return fileAt(relPath).text()
  },

  async writeText(relPath, text) {
    ensureDir(parentRel(relPath))
    const file = fileAt(relPath)
    file.create({ intermediates: true, overwrite: true })
    file.write(text)
  },

  async deleteDir(relPath) {
    const dir = dirAt(relPath)
    if (dir.exists) dir.delete()
  },

  async moveDir(fromRel, toRel) {
    const from = dirAt(fromRel)
    if (!from.exists) return
    ensureDir(parentRel(toRel))
    const to = dirAt(toRel)
    if (to.exists) to.delete()
    from.move(to)
  },

  async dirSizeBytes(relPath) {
    const dir = dirAt(relPath)
    if (!dir.exists) return 0
    return dir.size ?? 0
  },
}
