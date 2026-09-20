import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Build the devotional content artifacts before the suite runs.
//
// devotionalSource.test.ts reads analysis/out/dist/manifest.json and the twelve
// month files at MODULE scope — it verifies the shipped artifacts against the
// same parser and hash comparison the device performs before accepting a
// download, so there is nothing to assert without them.
//
// Those artifacts are deliberately untracked (.gitignore: they are generated
// content, rewritten on every build), and nothing regenerated them, so
// `npm run test` failed on any fresh clone — including CI — with an ENOENT
// during collection rather than a readable failure.
//
// The exporter is deterministic (no timestamp, no Math.random) and takes about
// a quarter of a second, so it is run unconditionally rather than only when the
// files are missing: the suite then always checks freshly-built artifacts,
// which is the point of the comparison. Its inputs (analysis/out/devotionals.json
// and schedule.json) are tracked, so this needs no network.

const here = dirname(fileURLToPath(import.meta.url))
const EXPORTER = join(here, '..', '..', 'analysis', 'export_content.mjs')

export default function setup(): void {
  try {
    execFileSync(process.execPath, [EXPORTER], { stdio: 'pipe' })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Failed to build the devotional artifacts the suite reads.\n` +
        `Run it by hand to see why: node analysis/export_content.mjs\n\n${detail}`,
    )
  }
}
