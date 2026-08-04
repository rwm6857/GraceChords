// Run the PDF importer's heuristics over a saved extraction, without Xcode.
//
//   node "apps/studio/js/pdf-draft.mjs" <extraction.json>
//   node "apps/studio/js/pdf-draft.mjs" <extraction.json> --json
//
// The input is exactly what Studio's editor banner copies with "Copy Diagnostics"
// when an import comes out badly — the complete input to core's `buildSongDraft`.
// So a chart that imported wrong becomes a file you can iterate against in seconds:
// tweak packages/core/src/songs/pdfImport.ts, re-run this, and when it looks right
// add the case to apps/web/src/__tests__/pdfImport*.test.js.
//
// Reads the TypeScript source through esbuild rather than the built Studio bundle,
// so there is no rebuild step between an edit and seeing its effect.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const [input, ...flags] = process.argv.slice(2)
if (!input) {
  console.error('usage: node "apps/studio/js/pdf-draft.mjs" <extraction.json> [--json]')
  process.exit(2)
}

let esbuild
try {
  esbuild = await import('esbuild')
} catch (err) {
  console.error(`esbuild could not be resolved. Run \`npm install\` at the repo root. (${err.message})`)
  process.exit(1)
}

const sourcePath = fileURLToPath(import.meta.resolve('@gracechords/core/songs/pdfImport.ts'))
const built = await esbuild.build({
  entryPoints: [sourcePath],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  loader: { '.ts': 'ts' },
  resolveExtensions: ['.ts', '.js', '.mjs', '.json'],
})
const { buildSongDraft } = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
)

let extraction
try {
  extraction = JSON.parse(await readFile(input, 'utf8'))
} catch (err) {
  console.error(`could not read ${input}: ${err.message}`)
  process.exit(1)
}

const draft = buildSongDraft(extraction)

if (flags.includes('--json')) {
  console.log(JSON.stringify(draft, null, 2))
  process.exit(0)
}

const pages = extraction.pages ?? []
console.log(`${extraction.lines?.length ?? 0} line(s) over ${pages.length} page(s)`)
for (const page of pages) {
  const note = page.layoutTrusted === false ? ', layout NOT trusted' : ''
  console.log(`  page ${page.index + 1}: ${page.columnCount} column(s)${note}`)
}
console.log('')
console.log(`title      ${draft.title ?? '—'}`)
console.log(`key        ${draft.key ?? '—'}`)
console.log(`artist     ${draft.artist ?? '—'}`)
console.log(`confidence ${draft.confidence}`)
console.log(
  `stats      ${draft.stats.sections} section(s), ${draft.stats.chords} chord(s), ` +
    `${draft.stats.lyricLines} lyric line(s), ${draft.stats.suspiciousInsertions} snapped, ` +
    `${draft.stats.unpairedChordLines} unpaired`,
)
if (draft.warnings.length) {
  console.log('\nwarnings')
  for (const warning of draft.warnings) console.log(`  [${warning.code}] ${warning.message}`)
}
console.log('\n─── chordpro ───')
console.log(draft.chordpro)
