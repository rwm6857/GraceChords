import { mkdir, copyFile, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

export async function readText(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

export async function writeText(path: string, contents: string): Promise<void> {
  await ensureDir(dirname(path))
  await writeFile(path, contents, 'utf8')
}

export async function copyFileSafe(from: string, to: string): Promise<void> {
  await ensureDir(dirname(to))
  await copyFile(from, to)
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
