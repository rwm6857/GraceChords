#!/usr/bin/env node
// Fetch the 24 CCEL Morning & Evening HTML files into analysis/ingest/.
//
// Source: the CCEL `/s/` plain-HTML transcription, marked "Public Domain — Copy
// Freely". Deliberately NOT the CCEL PDF build (morneve.pdf), which carries
// CCEL's own copyright requiring written permission for commercial use.
//
// ingest/ is gitignored. Only the parser and its derived output are committed.
//
//   node analysis/fetch_me.mjs

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const INGEST = join(HERE, 'ingest')
// http:// 301-redirects to https://; fetch follows redirects by default.
const BASE = 'https://ccel.org/s/spurgeon/morn_eve'

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
const SLOTS = ['AM', 'PM']

await mkdir(INGEST, { recursive: true })

let failures = 0
for (const mm of MONTHS) {
  for (const slot of SLOTS) {
    const name = `ME${mm}${slot}.html`
    const url = `${BASE}/${name}`
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`FAIL ${name}: HTTP ${res.status}`)
      failures += 1
      continue
    }
    const text = await res.text()
    await writeFile(join(INGEST, name), text, 'utf8')
    console.log(`ok   ${name}  ${text.length} bytes`)
  }
}

if (failures) {
  console.error(`\n${failures} file(s) failed to download.`)
  process.exit(1)
}
console.log(`\nFetched 24 files into ${INGEST}`)
