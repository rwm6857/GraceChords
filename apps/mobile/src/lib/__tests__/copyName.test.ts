import { describe, expect, it } from 'vitest'
import { copyNameStem, nextCopyName } from '@gracechords/core'

describe('copyNameStem', () => {
  it('strips an existing copy number so copies do not nest', () => {
    expect(copyNameStem('Sunday (2)')).toBe('Sunday')
    expect(copyNameStem('Sunday (11)')).toBe('Sunday')
  })

  it('leaves parentheses that are part of the name', () => {
    expect(copyNameStem('Sunday (AM)')).toBe('Sunday (AM)')
    expect(copyNameStem('Youth Night')).toBe('Youth Night')
  })

  it('trims surrounding whitespace', () => {
    expect(copyNameStem('  Sunday  ')).toBe('Sunday')
  })

  // Guards the SHAPE of the implementation, not just its output. The regex this
  // replaced was quadratic on a long whitespace run (CodeQL: polynomial regular
  // expression), and setlist names are user-typed with no length cap.
  //
  // The run must have non-whitespace on BOTH sides: a name that is only
  // whitespace trims to empty, and one that merely starts with the run is
  // fast-pathed, so either would pass against the old regex and prove nothing.
  // Measured on the old implementation: 270ms at 20k, 1067ms at 40k — doubling
  // the input quadrupled the time. The scan is ~0ms at both.
  it('is linear on a long whitespace run inside the name', () => {
    const pathological = `a${'\t'.repeat(40000)}b`
    const started = Date.now()
    expect(copyNameStem(pathological)).toBe(pathological)
    expect(Date.now() - started).toBeLessThan(100)
  })

  it('is linear when that name also ends in parentheses', () => {
    const pathological = `a${'\t'.repeat(40000)}(x)`
    const started = Date.now()
    expect(copyNameStem(pathological)).toBe(pathological)
    expect(Date.now() - started).toBeLessThan(100)
  })
})

describe('nextCopyName', () => {
  it('numbers the first copy (2) — the original counts as 1', () => {
    expect(nextCopyName('Sunday', ['Sunday'])).toBe('Sunday (2)')
  })

  it('skips numbers already taken', () => {
    expect(nextCopyName('Sunday', ['Sunday', 'Sunday (2)', 'Sunday (3)'])).toBe('Sunday (4)')
  })

  it('reuses a freed number rather than climbing forever', () => {
    // (2) was deleted; the next copy should fill the gap.
    expect(nextCopyName('Sunday', ['Sunday', 'Sunday (3)'])).toBe('Sunday (2)')
  })

  it('duplicating a copy continues the sequence instead of nesting', () => {
    expect(nextCopyName('Sunday (2)', ['Sunday', 'Sunday (2)'])).toBe('Sunday (3)')
  })

  it('matches case- and whitespace-insensitively — the names are hand-typed', () => {
    expect(nextCopyName('Sunday', ['sunday', 'SUNDAY (2)', ' Sunday (3) '])).toBe('Sunday (4)')
  })

  it('handles an empty or whitespace-only name', () => {
    expect(nextCopyName('', [])).toBe('New Setlist (2)')
    expect(nextCopyName('   ', [])).toBe('New Setlist (2)')
  })

  it('does not collide with an unrelated name that merely starts the same', () => {
    expect(nextCopyName('Sunday', ['Sunday', 'Sunday Night'])).toBe('Sunday (2)')
  })
})
