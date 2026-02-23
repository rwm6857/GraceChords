import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

describe('build-bibles script', () => {
  it('rejects --no-clean to ensure overwrite behavior', () => {
    const script = path.resolve('scripts/build-bibles.mjs')
    const result = spawnSync('node', [script, '--no-clean'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    const output = `${result.stdout || ''}\n${result.stderr || ''}`
    expect(output).toContain('does not accept --no-clean')
  })
})
