// Parity harness for the JavaScriptCore spike.
//
//   node "apps/studio/js/verify-bundle.mjs"
//
// Runs the built bundle the way Swift does — evaluated as global-scope source in
// a bare context, then called through the global object — and compares every
// result against the exact module apps/mobile resolves through Metro
// (@gracechords/core/chordpro/index.js). Any drift between the bundle and the
// source mobile uses fails the run.
//
// CASES is the same table CoreBridge's self-check asserts on the Swift side.
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

import { transposeSymPrefer } from '@gracechords/core/chordpro/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = resolve(here, '../GraceChords Studio/GraceChords Studio/Resources/GraceChordsCore.js')

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
if (typeof namespace.transpose !== 'function') {
  console.log('FAIL  GraceChordsCore.transpose is not a function')
  process.exit(1)
}
console.log('PASS  bundle evaluated in a bare context; GraceChordsCore.transpose is callable\n')

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

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
