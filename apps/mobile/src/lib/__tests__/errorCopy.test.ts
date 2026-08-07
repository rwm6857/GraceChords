import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Every user-facing failure message in the app is now an i18n KEY chosen in a
// hook and rendered by a screen, which moves a whole class of bug from
// "impossible" to "silent": i18next resolves a MISSING key to its last segment,
// so a typo in 'errors:load.starred' renders the literal word "starred" to the
// user in every language. Nothing else in the suite would catch that.
//
// This test scrapes the keys the source actually references and requires each one
// to exist in every locale.

const LIB = path.resolve(__dirname, '..')
const SRC = path.resolve(LIB, '..')
const LOCALES = path.join(SRC, 'i18n', 'locales')

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

/** Every namespace-prefixed errors key literal in src/ and app/, deduped. */
function referencedErrorKeys(): string[] {
  const roots = [SRC, path.resolve(SRC, '..', 'app')]
  const found = new Set<string>()
  for (const root of roots) {
    for (const file of walk(root)) {
      const source = fs.readFileSync(file, 'utf8')
      for (const match of source.matchAll(/['"`]errors:([A-Za-z0-9_.]+)['"`]/g)) {
        found.add(match[1])
      }
    }
  }
  return [...found].sort()
}

function loadLocale(locale: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(LOCALES, locale, 'errors.json'), 'utf8'))
}

function resolve(bundle: Record<string, unknown>, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((node, segment) => {
    if (!node || typeof node !== 'object') return undefined
    return (node as Record<string, unknown>)[segment]
  }, bundle)
}

const locales = fs
  .readdirSync(LOCALES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

describe('errors namespace copy', () => {
  it('finds the keys the app references', () => {
    const keys = referencedErrorKeys()
    // A guard on the guard: if the scrape silently matched nothing, every
    // assertion below would vacuously pass.
    expect(keys.length).toBeGreaterThanOrEqual(8)
    expect(keys).toContain('load.hint')
    expect(keys).toContain('tryAgain')
    expect(keys).toContain('saveFailed')
  })

  it('has all four locales', () => {
    expect(locales).toStrictEqual(['en', 'es', 'ko', 'tr'])
  })

  it.each(locales)('%s defines every referenced key as a non-empty string', (locale) => {
    const bundle = loadLocale(locale)
    const missing: string[] = []
    for (const key of referencedErrorKeys()) {
      const value = resolve(bundle, key)
      if (typeof value !== 'string' || value.trim() === '') missing.push(key)
    }
    expect(missing).toStrictEqual([])
  })

  it.each(locales)('%s has no leftover placeholder copy', (locale) => {
    const flat = JSON.stringify(loadLocale(locale))
    expect(flat).not.toMatch(/TODO|FIXME|XXX/i)
    // The tokens the request-deadline work exists to keep away from users.
    expect(flat).not.toMatch(/request_timeout|RequestTimeoutError|AbortError|ABORT_ERR/)
  })
})
