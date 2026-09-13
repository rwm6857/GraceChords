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
