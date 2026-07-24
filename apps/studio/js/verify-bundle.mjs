// Parity harness for the JavaScriptCore spike.
//
//   node "apps/studio/js/verify-bundle.mjs"
//
// Runs the built bundle the way Swift does — evaluated as global-scope source in
// a bare context, then called through the global object — and compares every
// result against the exact modules apps/mobile resolves through Metro
// (chordpro/index.js for transpose, chordpro/parser.ts for the document parser).
// Any drift between the bundle and the source mobile uses fails the run.
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

import { transposeSymPrefer } from '@gracechords/core/chordpro/index.js'

// parser.ts cannot be imported by Node's ESM loader: it carries a type-only
// import written as a value import (`import { SongDoc } from './types'`), which
// Node's type-stripping keeps and then fails to link, and './types' is
// extensionless besides. Metro and Vite both erase it during transpilation, so
// the reference side does the same thing to the same file — esbuild's transform
// (not the Studio bundle pipeline) applied to the source that
// `@gracechords/core/chordpro/parser.ts` resolves to.
async function loadReferenceParser() {
  let esbuild
  try {
    esbuild = await import('esbuild')
  } catch (err) {
    console.error(
      'esbuild could not be resolved (needed to transpile the reference parser).\n' +
        `Run \`npm install\` at the repo root. Original error: ${err.message}`,
    )
    process.exit(1)
  }
  const sourcePath = fileURLToPath(import.meta.resolve('@gracechords/core/chordpro/parser.ts'))
  const source = await readFile(sourcePath, 'utf8')
  const { code } = await esbuild.transform(source, { loader: 'ts', format: 'esm' })
  const dataURL = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  const module = await import(dataURL)
  return { parseChordProOrLegacy: module.parseChordProOrLegacy, sourcePath }
}

const { parseChordProOrLegacy, sourcePath: parserSourcePath } = await loadReferenceParser()

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = resolve(here, '../GraceChords Studio/GraceChords Studio/Resources/GraceChordsCore.js')
// Real songs the web app's parser tests already cover — read-only.
const fixtureDir = resolve(here, '../../web/src/__tests__/fixtures/chordpro')
const sampleFixture = resolve(here, '../../web/src/__tests__/fixtures/sample.chordpro')

/** [symbol, steps, preferFlat, expected] */
export const CASES = [
  ['G', 2, false, 'A'],
  ['G', 0, false, 'G'],
  ['G', -2, false, 'F'],
  ['Bb', 2, false, 'C'],
  ['Bb', 1, false, 'B'],
  ['A#', 1, false, 'B'],
  ['C', 1, true, 'Db'],
  ['C', 1, false, 'C#'],
  ['Em', 3, false, 'Gm'],
  ['D/F#', 2, false, 'E/G#'],
  ['Ebmaj7', 5, false, 'Abmaj7'],
  ['H7', 2, false, 'H7'], // core passes unrecognized symbols through unchanged
]

const source = await readFile(bundlePath, 'utf8')

// Closest analogue to JSContext.evaluateScript: no module loader, no Node
// globals, top-level `var` lands on the context's global object.
const sandbox = {}
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: bundlePath })

const namespace = sandbox.GraceChordsCore
let failures = 0
const fail = (message) => {
  failures += 1
  console.log(`FAIL  ${message}`)
}

if (!namespace) {
  console.log('FAIL  bundle did not define a GraceChordsCore global')
  process.exit(1)
}
for (const exported of ['transpose', 'parseToJSON']) {
  if (typeof namespace[exported] !== 'function') {
    console.log(`FAIL  GraceChordsCore.${exported} is not a function`)
    process.exit(1)
  }
}
console.log('PASS  bundle evaluated in a bare context; transpose + parseToJSON are callable\n')

console.log('sym         steps  flat   bundle   mobile   expected')
console.log('----------------------------------------------------')
for (const [sym, steps, preferFlat, expected] of CASES) {
  let bundled
  try {
    bundled = namespace.transpose(sym, steps, preferFlat)
  } catch (err) {
    fail(`transpose(${sym}, ${steps}) threw: ${err.message}`)
    continue
  }
  const mobile = transposeSymPrefer(sym, steps, preferFlat)
  const ok = bundled === mobile && bundled === expected
  const row = [
    sym.padEnd(11),
    String(steps).padStart(5),
    String(preferFlat).padEnd(6),
    String(bundled).padEnd(8),
    String(mobile).padEnd(8),
    String(expected),
  ].join(' ')
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${row}`)
  if (!ok) failures += 1
}

console.log('\nerror paths (must throw, not crash or return garbage):')
const badArgs = [
  ['empty symbol', ['', 2, false]],
  ['null symbol', [null, 2, false]],
  ['non-integer steps', ['G', 1.5, false]],
  ['missing steps', ['G', undefined, false]],
  ['non-boolean preferFlat', ['G', 2, 'yes']],
]
for (const [label, args] of badArgs) {
  try {
    const value = namespace.transpose(...args)
    fail(`${label}: returned ${JSON.stringify(value)} instead of throwing`)
  } catch (err) {
    console.log(`PASS  ${label} → ${err.constructor.name}: ${err.message}`)
  }
}

// ── parser parity ────────────────────────────────────────────────────────────
// Structural equality of the whole SongDoc, not a spot check: both sides run the
// same code path, so JSON.stringify key order matches and string comparison is a
// deep comparison.
const PARSE_CASES = [
  ['empty body', ''],
  ['legacy plain headers', 'Verse 1\n[G]Amazing [C]grace\n\nChorus\n[D]How sweet the [G]sound'],
  [
    'chordpro environments',
    '{title: Test Song}\n{key: G}\n{sov: Verse 1}\n[G]Line one\n{eov}\n{soc}\n[C]Chorus line\n{eoc}',
  ],
  ['short env with label', '{sov Verse 2}\n[Am]Words here\n{eov}'],
  ['comment directive', 'Verse\n[G]Line\n{c: hold the last chord}\n[C]More'],
  ['instrumental directives', '{i: G C D x2}\n{instrumental: Am, F, C}\n{inst}'],
  ['capo + columns + column_break', '{capo: 2}\n{columns: 2}\nVerse\n[G]Line\n{column_break}\nChorus\n[C]Line'],
  ['define + unknown directive', '{define: G base-fret 1 frets 3 2 0 0 0 3}\n{unknown_directive}\nVerse\n[G]Line'],
  ['arbitrary + nested meta', '{artist: Someone}\n{meta: tempo 72}\nVerse\n[G]Line'],
  ['hash comments and blank lines', '# a comment\n\nVerse\n[G]Line\n\n\n[C]Another'],
  ['chords past end of lyrics', 'Verse\nSing along[G]\n[C][D]'],
  ['crlf line endings', 'Verse 1\r\n[G]Amazing [C]grace\r\n\r\nChorus\r\n[D]Sound'],
]

for (const name of await readdir(fixtureDir)) {
  if (name.endsWith('.chordpro')) {
    PARSE_CASES.push([`fixture ${name}`, await readFile(join(fixtureDir, name), 'utf8')])
  }
}
PARSE_CASES.push(['fixture sample.chordpro', await readFile(sampleFixture, 'utf8')])

console.log(`\nparser parity (full SongDoc, bundle vs. ${relative(process.cwd(), parserSourcePath)}):`)
for (const [label, input] of PARSE_CASES) {
  let bundled
  try {
    bundled = namespace.parseToJSON(input)
  } catch (err) {
    fail(`${label}: parseToJSON threw — ${err.message}`)
    continue
  }
  const expected = JSON.stringify(parseChordProOrLegacy(input))
  if (bundled === expected) {
    const doc = JSON.parse(bundled)
    const lines = doc.sections.reduce((n, s) => n + s.lines.length, 0)
    console.log(`PASS  ${label.padEnd(42)} ${doc.sections.length} section(s), ${lines} line(s)`)
  } else {
    fail(`${label}: SongDoc differs\n      bundle:   ${bundled}\n      expected: ${expected}`)
  }
}

console.log('\nparseToJSON error paths:')
for (const [label, value] of [
  ['null input', null],
  ['missing input', undefined],
  ['number input', 42],
]) {
  try {
    namespace.parseToJSON(value)
    fail(`${label}: returned instead of throwing`)
  } catch (err) {
    console.log(`PASS  ${label} → ${err.constructor.name}: ${err.message}`)
  }
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
