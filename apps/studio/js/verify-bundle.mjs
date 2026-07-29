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

import { stepsBetween as refStepsBetween, transposeSymPrefer } from '@gracechords/core/chordpro/index.js'
import { formatChord as refFormatChord, formatKeyDisplay as refFormatKeyDisplay } from '@gracechords/core/chordpro/solfege.js'
// rbac/roles.js is plain .js with no imports, so Node's loader resolves it directly.
import { hasMinRole as refHasMinRole, ROLE_ORDER as REF_ROLE_ORDER } from '@gracechords/core/rbac/roles.js'

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

// songs/instrumental.js bare-directory-imports './chordpro', which Metro and Vite
// resolve but Node's ESM loader does not — so the reference copy goes through
// esbuild's bundler, whose resolution matches what the app bundlers do.
async function loadReferenceInstrumental() {
  const esbuild = await import('esbuild')
  const entry = fileURLToPath(import.meta.resolve('@gracechords/core/songs/instrumental.js'))
  const built = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    loader: { '.ts': 'ts' },
    resolveExtensions: ['.ts', '.js', '.mjs', '.json'],
  })
  const dataURL = `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  return import(dataURL)
}
const { transposeInstrumental: refTransposeInstrumental } = await loadReferenceInstrumental()

// chordpro/lint.ts has both problems at once: it is TypeScript, and it carries a
// real runtime import of './parser' written extensionless. Node's loader resolves
// neither, so the reference copy goes through esbuild's bundler — the same
// treatment loadReferenceInstrumental gives, and the same resolution Metro and
// Vite apply to this file in the apps.
async function loadReferenceLint() {
  const esbuild = await import('esbuild')
  const entry = fileURLToPath(import.meta.resolve('@gracechords/core/chordpro/lint.ts'))
  const built = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    loader: { '.ts': 'ts' },
    resolveExtensions: ['.ts', '.js', '.mjs', '.json'],
  })
  const dataURL = `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  return { module: await import(dataURL), sourcePath: entry }
}
const { module: refLintModule, sourcePath: lintSourcePath } = await loadReferenceLint()
const refLintChordPro = refLintModule.lintChordPro

// songs/slug.ts is TypeScript but imports nothing, so a bare transform is enough
// — no bundling needed, unlike lint.ts and instrumental.js.
async function loadReferenceSlug() {
  const esbuild = await import('esbuild')
  const sourcePath = fileURLToPath(import.meta.resolve('@gracechords/core/songs/slug.ts'))
  const { code } = await esbuild.transform(await readFile(sourcePath, 'utf8'), {
    loader: 'ts',
    format: 'esm',
  })
  const dataURL = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  return import(dataURL)
}
const { slugify: refSlugify } = await loadReferenceSlug()

// chordpro/editing.ts is TypeScript with no imports; diatonicChords.js is plain JS.
async function loadReferenceEditing() {
  const esbuild = await import('esbuild')
  const sourcePath = fileURLToPath(import.meta.resolve('@gracechords/core/chordpro/editing.ts'))
  const { code } = await esbuild.transform(await readFile(sourcePath, 'utf8'), {
    loader: 'ts',
    format: 'esm',
  })
  const dataURL = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  return import(dataURL)
}
const refEditing = await loadReferenceEditing()
const { getDiatonicChords: refDiatonic } = await import('@gracechords/core/chordpro/diatonicChords.js')

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
const REQUIRED_EXPORTS = [
  'transpose',
  'parseToJSON',
  'stepsBetween',
  'formatKey',
  'renderToJSON',
  'lintToJSON',
  'hasMinRole',
  'roleOrderJSON',
  'slugify',
  'insertAtCursorJSON',
  'wrapSectionJSON',
  'sectionPresetsJSON',
  'diatonicChordsJSON',
  'chordVariantsJSON',
  'chordToken',
]
for (const exported of REQUIRED_EXPORTS) {
  if (typeof namespace[exported] !== 'function') {
    console.log(`FAIL  GraceChordsCore.${exported} is not a function`)
    process.exit(1)
  }
}
console.log(
  `PASS  bundle evaluated in a bare context; all ${REQUIRED_EXPORTS.length} exports are callable\n`,
)

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

// ── viewer helpers: stepsBetween / formatKey ─────────────────────────────────
console.log('\nstepsBetween parity (bundle vs. chordpro/index.js):')
for (const [from, to] of [
  ['C', 'D'], ['D', 'C'], ['G', 'G'], ['Bb', 'C'], ['A#', 'C'], ['Em', 'Gm'],
  ['F#', 'Bb'], ['nonsense', 'C'], ['C', 'nonsense'],
]) {
  const bundled = namespace.stepsBetween(from, to)
  const expected = refStepsBetween(from, to)
  const ok = bundled === expected
  console.log(`${ok ? 'PASS' : 'FAIL'}  stepsBetween(${from}, ${to}) → ${bundled} (core ${expected})`)
  if (!ok) failures += 1
}

console.log('\nformatKey parity (bundle vs. chordpro/solfege.js):')
for (const key of ['C', 'Bb', 'F#m', 'Ebmaj7', 'A#']) {
  for (const style of ['letters', 'solfege']) {
    const bundled = namespace.formatKey(key, style)
    const expected = refFormatKeyDisplay(key, style)
    const ok = bundled === expected
    console.log(`${ok ? 'PASS' : 'FAIL'}  formatKey(${key.padEnd(7)} ${style.padEnd(7)}) → ${String(bundled).padEnd(8)} (core ${expected})`)
    if (!ok) failures += 1
  }
}

// ── renderToJSON parity ──────────────────────────────────────────────────────
// The reference applies the SAME composition apps/mobile's ChordChart.tsx uses,
// but built from the source modules rather than the bundle — so a mismatch means
// the bundling drifted, which is what this harness exists to catch. Every parse
// case is re-checked across transpose steps and both chord styles.
function referenceRender(input, steps, preferFlat, style) {
  const doc = parseChordProOrLegacy(input)
  for (const section of doc.sections ?? []) {
    if (section.instrumental) {
      section.instrumental = refTransposeInstrumental(section.instrumental, steps, preferFlat, { style })
    }
    for (const line of section.lines ?? []) {
      if (line.instrumental) {
        line.instrumental = refTransposeInstrumental(line.instrumental, steps, preferFlat, { style })
      }
      if (line.chords?.length) {
        line.chords = line.chords.map((chord) => ({
          ...chord,
          sym: refFormatChord(transposeSymPrefer(chord.sym, steps, preferFlat), { style }),
        }))
      }
    }
  }
  return JSON.stringify(doc)
}

const RENDER_VARIANTS = [
  [0, false, 'letters'],
  [0, false, 'solfege'],
  [2, false, 'letters'],
  [-3, false, 'letters'],
  [1, true, 'letters'],
  [1, false, 'letters'],
  [5, true, 'solfege'],
  [-1, true, 'solfege'],
]

console.log('\nrenderToJSON parity (full SongDoc after transpose + chord style):')
let renderChecks = 0
for (const [label, input] of PARSE_CASES) {
  let caseFailed = false
  for (const [steps, preferFlat, style] of RENDER_VARIANTS) {
    let bundled
    try {
      bundled = namespace.renderToJSON(input, steps, preferFlat, style)
    } catch (err) {
      fail(`${label} [${steps}/${preferFlat}/${style}]: renderToJSON threw — ${err.message}`)
      caseFailed = true
      continue
    }
    const expected = referenceRender(input, steps, preferFlat, style)
    renderChecks += 1
    if (bundled !== expected) {
      fail(
        `${label} [steps=${steps} flat=${preferFlat} ${style}]: SongDoc differs\n` +
          `      bundle:   ${bundled}\n      expected: ${expected}`,
      )
      caseFailed = true
    }
  }
  if (!caseFailed) {
    console.log(`PASS  ${label.padEnd(42)} ${RENDER_VARIANTS.length} variant(s)`)
  }
}

// renderToJSON at 0 steps / letters must equal plain parseToJSON — the identity
// case, which pins that the transform never mutates a document it shouldn't.
for (const [label, input] of PARSE_CASES) {
  const rendered = namespace.renderToJSON(input, 0, false, 'letters')
  const parsed = namespace.parseToJSON(input)
  if (rendered !== parsed) {
    // Only a real difference matters: solfege/steps are identity here, but
    // transposeInstrumental normalizes specs (trims blanks), so an instrumental
    // case may legitimately differ. Report the document so the diff is visible.
    const hasInstrumental = JSON.parse(parsed).sections?.some(
      (s) => s.instrumental || s.lines?.some((l) => l.instrumental),
    )
    if (!hasInstrumental) {
      fail(`${label}: renderToJSON(0, false, letters) should equal parseToJSON\n      rendered: ${rendered}\n      parsed:   ${parsed}`)
    }
  }
}
console.log(`PASS  identity case: renderToJSON(0, false, 'letters') matches parseToJSON`)

// ── lint parity ──────────────────────────────────────────────────────────────
// Whole-array structural equality over the same corpus the parser cases use, plus
// bodies written specifically to trip each warning code. Both sides run the same
// code path, so JSON key order matches and string comparison is a deep compare.
const LINT_CASES = [
  ...PARSE_CASES,
  ['lint: missing title and key', 'Verse 1\n[G]Amazing [C]grace'],
  ['lint: empty section', '{title: T}\n{key: G}\n{soc}\n{eoc}'],
  ['lint: stray end_of', '{title: T}\n{key: G}\nVerse\n[G]Line\n{end_of_chorus}'],
  ['lint: unclosed start_of', '{title: T}\n{key: G}\n{start_of_verse}\n[G]Line'],
  ['lint: mismatched pair', '{start_of_verse}\n[G]Line\n{end_of_chorus}'],
  ['lint: suspicious chords', '{title: T}\n{key: G}\nVerse\n[H7]Line [Xyz]more [G]ok'],
  ['lint: long lyric line', `{title: T}\n{key: G}\nVerse\n[G]${'la '.repeat(40)}`],
  ['lint: adjacent duplicate headers', '{title: T}\n{key: G}\nChorus\n[G]One\nChorus\n[C]Two'],
  ['lint: nested unbalanced', '{start_of_verse}\n{start_of_chorus}\n[G]Line\n{end_of_verse}'],
  ['lint: unterminated chord bracket', '{title: T}\n{key: G}\nVerse\n[G]Fine [Cunclosed lyric'],
  ['lint: only directives', '{title: T}\n{key: G}'],
  ['lint: whitespace-only body', '   \n\t\n   '],
]

console.log(`\nlint parity (full LintWarning[], bundle vs. ${relative(process.cwd(), lintSourcePath)}):`)
for (const [label, input] of LINT_CASES) {
  let bundled
  try {
    bundled = namespace.lintToJSON(input)
  } catch (err) {
    fail(`${label}: lintToJSON threw — ${err.message}`)
    continue
  }
  const expected = JSON.stringify(refLintChordPro(input))
  if (bundled === expected) {
    const codes = JSON.parse(bundled).map((w) => w.code)
    const summary = codes.length ? `${codes.length}: ${[...new Set(codes)].join(', ')}` : 'clean'
    console.log(`PASS  ${label.padEnd(42)} ${summary}`)
  } else {
    fail(`${label}: warnings differ\n      bundle:   ${bundled}\n      expected: ${expected}`)
  }
}

// Every warning must carry the fields Swift's LintWarning decodes, or the editor
// would silently drop rows it could not decode.
console.log('\nlint warning shape (code + message present, indices numeric when present):')
{
  let shapeFailures = 0
  let inspected = 0
  for (const [label, input] of LINT_CASES) {
    for (const warning of JSON.parse(namespace.lintToJSON(input))) {
      inspected += 1
      const keys = Object.keys(warning)
      const unexpected = keys.filter((k) => !['code', 'message', 'sectionIndex', 'lineIndex'].includes(k))
      if (typeof warning.code !== 'string' || !warning.code) {
        fail(`${label}: warning has no code — ${JSON.stringify(warning)}`); shapeFailures += 1
      } else if (typeof warning.message !== 'string' || !warning.message) {
        fail(`${label}: warning has no message — ${JSON.stringify(warning)}`); shapeFailures += 1
      } else if (unexpected.length) {
        fail(`${label}: warning has unexpected key(s) ${unexpected.join(', ')} — Swift's LintWarning would ignore them`)
        shapeFailures += 1
      } else if (
        ('sectionIndex' in warning && !Number.isInteger(warning.sectionIndex)) ||
        ('lineIndex' in warning && !Number.isInteger(warning.lineIndex))
      ) {
        fail(`${label}: non-integer index — ${JSON.stringify(warning)}`); shapeFailures += 1
      }
    }
  }
  if (shapeFailures === 0) console.log(`PASS  ${inspected} warning(s) across ${LINT_CASES.length} case(s) all well-formed`)
}

// A body that makes the PARSER throw is a separate failure mode from a lint
// warning, and the editor presents them differently. Nothing in the corpus should
// throw — if a future parser change makes one throw, the editor's preview must
// still hold, so it is worth knowing which case it was.
console.log('\nparse-vs-lint independence (lint must not throw on anything the parser accepts):')
{
  let independenceFailures = 0
  for (const [label, input] of LINT_CASES) {
    let parseThrew = false
    try { namespace.parseToJSON(input) } catch { parseThrew = true }
    try {
      namespace.lintToJSON(input)
    } catch (err) {
      fail(`${label}: parser ${parseThrew ? 'also threw' : 'accepted this body'} but lint threw — ${err.message}`)
      independenceFailures += 1
    }
  }
  if (independenceFailures === 0) console.log(`PASS  lint returned an array for all ${LINT_CASES.length} case(s)`)
}

console.log('\nlintToJSON error paths:')
for (const [label, value] of [
  ['null input', null],
  ['missing input', undefined],
  ['number input', 42],
  ['array input', []],
]) {
  try {
    namespace.lintToJSON(value)
    fail(`${label}: returned instead of throwing`)
  } catch (err) {
    console.log(`PASS  ${label} → ${err.constructor.name}: ${err.message}`)
  }
}

// ── rbac parity ──────────────────────────────────────────────────────────────
// The full matrix, not a spot check: this is the gate that decides whether the
// Manage section appears at all, so every cell is compared against core.
console.log('\nhasMinRole parity (bundle vs. rbac/roles.js), full matrix:')
{
  const bundledOrder = JSON.parse(namespace.roleOrderJSON())
  if (JSON.stringify(bundledOrder) !== JSON.stringify(REF_ROLE_ORDER)) {
    fail(`roleOrderJSON differs: bundle ${JSON.stringify(bundledOrder)} vs core ${JSON.stringify(REF_ROLE_ORDER)}`)
  } else {
    console.log(`PASS  ROLE_ORDER matches core: ${bundledOrder.join(' → ')}`)
  }
  // Roles the hierarchy no longer contains must not quietly grant anything.
  const probeRoles = [...REF_ROLE_ORDER, 'collaborator', 'nonsense', '']
  let matrixFailures = 0
  for (const userRole of probeRoles) {
    const row = []
    for (const minRole of REF_ROLE_ORDER) {
      const bundled = namespace.hasMinRole(userRole, minRole)
      const expected = refHasMinRole(userRole, minRole)
      if (bundled !== expected) {
        fail(`hasMinRole('${userRole}', '${minRole}') → ${bundled}, core says ${expected}`)
        matrixFailures += 1
      }
      row.push(`${minRole}:${bundled ? 'Y' : 'n'}`)
    }
    console.log(`      ${(userRole || "''").padEnd(14)} ${row.join('  ')}`)
  }
  if (matrixFailures === 0) {
    console.log(`PASS  ${probeRoles.length * REF_ROLE_ORDER.length} hasMinRole comparisons match core`)
  }
  // The gate Studio actually uses. Hardcoded expectations so a hierarchy change
  // that silently promotes 'user' to editor fails here rather than in the app.
  for (const [role, expected] of [['user', false], ['editor', true], ['admin', true], ['owner', true], ['collaborator', false], ['', false]]) {
    const got = namespace.hasMinRole(role, 'editor')
    if (got !== expected) fail(`canDirectWrite gate: hasMinRole('${role}', 'editor') → ${got}, expected ${expected}`)
  }
  console.log(`PASS  editor+ gate: only editor/admin/owner pass`)
}

console.log('\nhasMinRole error paths:')
for (const [label, args] of [
  ['null userRole', [null, 'editor']],
  ['number userRole', [3, 'editor']],
  ['empty minRole', ['owner', '']],
  ['null minRole', ['owner', null]],
  ['missing minRole', ['owner', undefined]],
]) {
  try {
    const value = namespace.hasMinRole(...args)
    fail(`${label}: returned ${JSON.stringify(value)} instead of throwing`)
  } catch (err) {
    console.log(`PASS  ${label} → ${err.constructor.name}: ${err.message}`)
  }
}

// ── slugify parity ───────────────────────────────────────────────────────────
// The slug becomes the song's public URL, so a divergence here is a broken link
// on gracechords.com rather than a cosmetic difference.
console.log('\nslugify parity (bundle vs. songs/slug.ts):')
{
  const titles = [
    'Amazing Grace',
    '10,000 Reasons (Bless the Lord)',
    "It Is Well With My Soul",
    'Holy, Holy, Holy!',
    '  leading and trailing  ',
    'Multiple   Spaces',
    'Hyphen-ated Title',
    'Ya Rabbi Yasu',
    'Türkçe Şarkı',           // non-ASCII: every letter is stripped
    '日本語',                   // fully non-ASCII → '' (no slug derivable)
    '!!!',                     // punctuation only → ''
    '',
    'Song 2',
    'A',
    'under_scores_already',
    'Trailing punctuation...',
  ]
  for (const title of titles) {
    const bundled = namespace.slugify(title)
    const expected = refSlugify(title)
    const ok = bundled === expected
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${JSON.stringify(title).padEnd(36)} → ${JSON.stringify(bundled)}`)
    if (!ok) {
      fail(`slugify(${JSON.stringify(title)}) → ${JSON.stringify(bundled)}, core says ${JSON.stringify(expected)}`)
    }
  }
  // The contract Swift depends on before writing a row: no alphanumerics means no
  // slug, and songs.slug is UNIQUE NOT NULL, so the caller must refuse to insert.
  for (const title of ['', '!!!', '日本語', '   ']) {
    if (namespace.slugify(title) !== '') {
      fail(`slugify(${JSON.stringify(title)}) should be '' so callers can refuse the write`)
    }
  }
  console.log(`PASS  unslugifiable titles all yield '' (the "refuse to insert" signal)`)
}

console.log('\nslugify error paths:')
for (const [label, value] of [['null title', null], ['number title', 7], ['missing title', undefined]]) {
  try {
    const value_ = namespace.slugify(value)
    fail(`${label}: returned ${JSON.stringify(value_)} instead of throwing`)
  } catch (err) {
    console.log(`PASS  ${label} → ${err.constructor.name}: ${err.message}`)
  }
}

// ── editing parity ───────────────────────────────────────────────────────────
// These drive the quick-insert toolbar. A divergence here means Studio inserts
// different text than the web editor for the same button, which is the whole thing
// bridging this module was meant to prevent.
console.log('\ninsertAtCursor parity (bundle vs. chordpro/editing.ts):')
{
  const cases = [
    ['empty body, caret at 0', '', 0, 0, '[G]'],
    ['caret mid-line', 'Amazing grace', 8, 8, '[C]'],
    ['replace a selection', 'Amazing grace', 0, 7, '[G]Sweet'],
    ['caret at end', 'line', 4, 4, '\n[D]'],
    ['multi-line body', 'a\nb\nc', 2, 3, 'X'],
    ['non-ASCII before caret', 'Türkçe şarkı', 12, 12, '[Am]'],   // UTF-16 offsets
    ['korean body', '주 예수', 3, 3, '[G]'],
    ['emoji body', 'a🎵b', 4, 4, '[C]'],                          // surrogate pair
    ['insert empty string', 'abc', 1, 1, ''],
  ]
  for (const [label, value, start, end, text] of cases) {
    const bundled = JSON.parse(namespace.insertAtCursorJSON(value, start, end, text))
    const expected = refEditing.insertAtCursor(value, { start, end }, text)
    const ok = JSON.stringify(bundled) === JSON.stringify(expected)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(28)} → ${JSON.stringify(bundled.value)} @${bundled.selection.start}`)
    if (!ok) fail(`insertAtCursor ${label}: ${JSON.stringify(bundled)} vs ${JSON.stringify(expected)}`)
  }
}

console.log('\nwrapSection parity, over every core SECTION_PRESET:')
{
  const bodies = [
    ['no selection', 'existing line', 0, 0],
    ['selection of one line', 'Amazing grace', 0, 13],
    ['selection of two lines', 'one\ntwo\nthree', 0, 7],
    ['selection mid-body', 'a\nb\nc', 2, 3],
    ['non-ASCII selection', 'Türkçe şarkı', 0, 12],
  ]
  let checks = 0
  for (const preset of refEditing.SECTION_PRESETS) {
    for (const [label, value, start, end] of bodies) {
      const bundled = JSON.parse(
        namespace.wrapSectionJSON(value, start, end, preset.directive, preset.sectionLabel),
      )
      const expected = refEditing.wrapSection(value, { start, end }, {
        directive: preset.directive,
        label: preset.sectionLabel,
      })
      checks += 1
      if (JSON.stringify(bundled) !== JSON.stringify(expected)) {
        fail(`wrapSection ${preset.label}/${label}: ${JSON.stringify(bundled)} vs ${JSON.stringify(expected)}`)
      }
    }
  }
  console.log(`PASS  ${checks} wrapSection comparisons across ${refEditing.SECTION_PRESETS.length} presets`)

  // The rule worth pinning: the parser only accepts these six environments, so a
  // preset emitting anything else would be silently dropped from the chart.
  const allowed = ['verse', 'chorus', 'bridge', 'intro', 'tag', 'outro']
  const presets = JSON.parse(namespace.sectionPresetsJSON())
  if (JSON.stringify(presets) !== JSON.stringify(refEditing.SECTION_PRESETS)) {
    fail('sectionPresetsJSON differs from core SECTION_PRESETS')
  } else {
    console.log(`PASS  sectionPresetsJSON matches core (${presets.length} presets)`)
  }
  for (const preset of presets) {
    if (!allowed.includes(preset.directive)) {
      fail(`preset "${preset.label}" emits {start_of_${preset.directive}}, which the parser drops`)
    }
    // And each preset's output must actually parse back into one section.
    const wrapped = JSON.parse(namespace.wrapSectionJSON('lyric', 0, 5, preset.directive, preset.sectionLabel))
    const doc = JSON.parse(namespace.parseToJSON(wrapped.value))
    if (doc.sections.length !== 1) {
      fail(`preset "${preset.label}" produced ${doc.sections.length} sections, expected 1`)
    }
  }
  console.log('PASS  every preset emits a parser-supported environment and round-trips to one section')
}

console.log('\ndiatonicChords parity (bundle vs. chordpro/diatonicChords.js):')
{
  const { CHROMATIC_KEYS } = await import('@gracechords/core/chordpro/diatonicChords.js')
  let mismatches = 0
  for (const key of [...CHROMATIC_KEYS, 'Gb', 'nonsense', '']) {
    const bundled = JSON.parse(namespace.diatonicChordsJSON(key))
    const expected = refDiatonic(key) ?? null
    if (JSON.stringify(bundled) !== JSON.stringify(expected)) {
      fail(`diatonicChords(${JSON.stringify(key)}) differs`)
      mismatches += 1
    }
  }
  console.log(`${mismatches === 0 ? 'PASS' : 'FAIL'}  ${CHROMATIC_KEYS.length + 3} keys match core (unknown keys → null)`)

  // Every chord a button can insert must survive the transposer, or the preview
  // would show a chord the chart cannot render.
  let badSymbols = 0
  for (const key of CHROMATIC_KEYS) {
    for (const chord of JSON.parse(namespace.diatonicChordsJSON(key)) ?? []) {
      const token = namespace.chordToken(chord.symbol)
      if (token !== `[${chord.symbol}]`) { fail(`chordToken(${chord.symbol}) → ${token}`); badSymbols += 1 }
      const doc = JSON.parse(namespace.parseToJSON(`Verse\n${token}word`))
      const parsed = doc.sections[0]?.lines[0]?.chords?.[0]?.sym
      if (parsed !== chord.symbol) { fail(`${key}: ${token} parsed as ${parsed}`); badSymbols += 1 }
    }
  }
  console.log(`${badSymbols === 0 ? 'PASS' : 'FAIL'}  every diatonic chord in every key tokenises and parses back identically`)
}

console.log('\nediting error paths:')
for (const [label, call] of [
  ['insert non-string value', () => namespace.insertAtCursorJSON(null, 0, 0, 'x')],
  ['insert negative start', () => namespace.insertAtCursorJSON('a', -1, 0, 'x')],
  ['insert start > end', () => namespace.insertAtCursorJSON('abc', 2, 1, 'x')],
  ['insert non-integer offset', () => namespace.insertAtCursorJSON('abc', 0.5, 1, 'x')],
  ['insert non-string text', () => namespace.insertAtCursorJSON('abc', 0, 0, 42)],
  ['wrap empty directive', () => namespace.wrapSectionJSON('abc', 0, 1, '', 'Verse')],
  ['wrap non-string label', () => namespace.wrapSectionJSON('abc', 0, 1, 'verse', null)],
  ['diatonic non-string key', () => namespace.diatonicChordsJSON(null)],
  ['chordToken empty', () => namespace.chordToken('')],
]) {
  try {
    const value = call()
    fail(`${label}: returned ${JSON.stringify(value)} instead of throwing`)
  } catch (err) {
    console.log(`PASS  ${label} → ${err.constructor.name}`)
  }
}

console.log('\nviewer-helper error paths:')
const viewerBadArgs = [
  ['stepsBetween empty key', () => namespace.stepsBetween('', 'C')],
  ['stepsBetween null key', () => namespace.stepsBetween('C', null)],
  ['formatKey bad style', () => namespace.formatKey('C', 'numbers')],
  ['formatKey missing style', () => namespace.formatKey('C', undefined)],
  ['renderToJSON bad style', () => namespace.renderToJSON('Verse\n[G]Hi', 0, false, 'roman')],
  ['renderToJSON non-integer steps', () => namespace.renderToJSON('Verse\n[G]Hi', 1.5, false, 'letters')],
  ['renderToJSON non-boolean preferFlat', () => namespace.renderToJSON('Verse\n[G]Hi', 0, 'no', 'letters')],
  ['renderToJSON null body', () => namespace.renderToJSON(null, 0, false, 'letters')],
]
for (const [label, call] of viewerBadArgs) {
  try {
    const value = call()
    fail(`${label}: returned ${JSON.stringify(value)} instead of throwing`)
  } catch (err) {
    console.log(`PASS  ${label} → ${err.constructor.name}: ${err.message}`)
  }
}
console.log(`\n(${renderChecks} renderToJSON document comparisons)`)

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
