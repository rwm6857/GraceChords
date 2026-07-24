// Bundles packages/core's transpose path into one flat IIFE that
// JSContext.evaluateScript can run, and writes it where Xcode will copy it into
// GraceChords Studio.app/Contents/Resources.
//
// Run manually after touching packages/core's chordpro module or entry.mjs:
//   node "apps/studio/js/build-core-bundle.mjs"
//
// Deliberately not wired to an Xcode Run Script phase yet — see README.md.
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const entry = resolve(here, 'entry.mjs')
const outfile = resolve(here, '../GraceChords Studio/GraceChords Studio/Resources/GraceChordsCore.js')

// esbuild is present in the root node_modules (hoisted; Vite depends on it), so
// this spike adds no dependency and apps/studio stays out of the workspace glob.
let esbuild
try {
  esbuild = await import('esbuild')
} catch (err) {
  console.error(
    'esbuild could not be resolved. Run `npm install` at the repo root (esbuild is\n' +
      'hoisted there via Vite), or run this script with a one-off:\n' +
      '  npx --yes esbuild@0.27.7 --version\n\n' +
      `Original error: ${err.message}`,
  )
  process.exit(1)
}

const banner = [
  '// GENERATED FILE — do not edit.',
  '// Built from packages/core by apps/studio/js/build-core-bundle.mjs.',
  '// Exposes GraceChordsCore.transpose() on the JavaScriptCore global object.',
].join('\n')

await mkdir(dirname(outfile), { recursive: true })

const result = await esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'iife',
  globalName: 'GraceChordsCore',
  // JavaScriptCore is neither Node nor a browser; 'neutral' keeps esbuild from
  // preferring platform-specific package fields during resolution.
  platform: 'neutral',
  target: 'safari17',
  legalComments: 'none',
  banner: { js: banner },
  logLevel: 'warning',
  metafile: true,
})

const { size } = await stat(outfile)
const inputs = Object.keys(result.metafile.inputs).map((p) => relative(repoRoot, resolve(repoRoot, p)))

console.log(`wrote ${relative(repoRoot, outfile)} (${size} bytes)`)
console.log(`bundled ${inputs.length} module(s):`)
for (const input of inputs) console.log(`  ${input}`)
