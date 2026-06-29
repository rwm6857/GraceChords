#!/usr/bin/env node
// Verify that every locale under src/i18n/locales/<lng>/<ns>.json has the same
// set of leaf keys as the English source-of-truth. Exits non-zero on drift so
// CI can catch missing translations.

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const LOCALES_DIR = path.resolve(__dirname, '..', 'src', 'i18n', 'locales')
const SOURCE_LOCALE = 'en'
const META_KEY = '_meta'

function flatten(obj, prefix = '') {
  const out = []
  for (const [key, value] of Object.entries(obj || {})) {
    if (key === META_KEY) continue
    const next = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...flatten(value, next))
    } else {
      out.push(next)
    }
  }
  return out
}

function loadNamespace(locale, ns) {
  const file = path.join(LOCALES_DIR, locale, `${ns}.json`)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function listNamespaces(locale) {
  const dir = path.join(LOCALES_DIR, locale)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace(/\.json$/, ''))
}

const sourceNamespaces = listNamespaces(SOURCE_LOCALE)
const otherLocales = fs.readdirSync(LOCALES_DIR)
  .filter(name => name !== SOURCE_LOCALE && fs.statSync(path.join(LOCALES_DIR, name)).isDirectory())

let problems = 0
const report = []

for (const locale of otherLocales) {
  const localeProblems = []
  const targetNamespaces = listNamespaces(locale)
  const missingNs = sourceNamespaces.filter(ns => !targetNamespaces.includes(ns))
  const extraNs = targetNamespaces.filter(ns => !sourceNamespaces.includes(ns))

  for (const ns of missingNs) localeProblems.push(`  • missing namespace file: ${ns}.json`)
  for (const ns of extraNs) localeProblems.push(`  • extra namespace file (not in en/): ${ns}.json`)

  for (const ns of sourceNamespaces) {
    const sourceData = loadNamespace(SOURCE_LOCALE, ns)
    const targetData = loadNamespace(locale, ns)
    if (!targetData) continue
    const sourceKeys = new Set(flatten(sourceData))
    const targetKeys = new Set(flatten(targetData))
    const missingKeys = [...sourceKeys].filter(k => !targetKeys.has(k))
    const extraKeys = [...targetKeys].filter(k => !sourceKeys.has(k))
    for (const k of missingKeys) localeProblems.push(`  • [${ns}] missing key: ${k}`)
    for (const k of extraKeys) localeProblems.push(`  • [${ns}] extra key: ${k}`)
  }

  if (localeProblems.length) {
    problems += localeProblems.length
    report.push(`\n[${locale}]`)
    report.push(...localeProblems)
  } else {
    report.push(`\n[${locale}] ✓ in sync with en/`)
  }
}

console.log(report.join('\n'))
console.log(`\nTotal issues: ${problems}`)
process.exit(problems === 0 ? 0 : 1)
