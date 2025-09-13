// @ts-nocheck
import { describe, it, expect } from 'vitest'
import { chooseBestLayout } from '../pdfLayout'

const makeMeasure = (pt: number) => (text: string) => (text ? text.length * (pt * 0.6) : 0)

function planSong(song) {
  const mm = (pt: number) => makeMeasure(pt)
  const { plan } = chooseBestLayout(song, {}, mm, mm)
  return plan
}

const line = (len: number, chords = false) => ({
  plain: 'x'.repeat(len),
  chordPositions: chords ? [
    { index: 0, sym: 'Cmaj7b5#9' },
    { index: 1, sym: 'Dm7b5' }
  ] : []
})

const section = (name: string, count: number, len: number, withChords = false) => ({
  section: name,
  lines: Array.from({ length: count }, (_, i) => line(len, withChords && i === 0))
})

function verifyNoSectionSplits(plan) {
  for (const page of plan.layout.pages) {
    for (const col of page.columns) {
      if (col.blocks.length) {
        expect(col.blocks[0].type).toBe('section')
      }
    }
  }
}

function verifyChordOrdering(plan) {
  let found = 0
  for (const page of plan.layout.pages) {
    for (const col of page.columns) {
      for (const blk of col.blocks) {
        if (blk.type === 'line' && blk.chords.length) {
          found++
          const xs = blk.chords.map(c => c.x)
          const sorted = [...xs].sort((a,b) => a - b)
          expect(xs).toEqual(sorted)
        }
      }
    }
  }
  expect(found).toBeGreaterThan(0)
}

describe('planner cases', () => {
  it('Case 1: short lines/short song → 1 col, 16pt, 1 page', () => {
    const song = {
      title: 'c1', key: 'C',
      lyricsBlocks: [
        section('Verse', 4, 20, true),
        section('Chorus', 4, 20)
      ]
    }
    const plan = planSong(song)
    expect(plan.columns).toBe(1)
    expect(plan.lyricSizePt).toBe(16)
    expect(plan.layout.pages.length).toBe(1)
    verifyNoSectionSplits(plan)
    verifyChordOrdering(plan)
  })

  it('Case 2: long lines/short song → 1 col, shrink, 1 page', () => {
    const song = {
      title: 'c2', key: 'C',
      lyricsBlocks: [section('Verse', 3, 70, true)]
    }
    const plan = planSong(song)
    expect(plan.columns).toBe(1)
    expect(plan.lyricSizePt).toBeGreaterThanOrEqual(12)
    expect(plan.lyricSizePt).toBeLessThan(16)
    expect(plan.layout.pages.length).toBe(1)
    verifyNoSectionSplits(plan)
    verifyChordOrdering(plan)
  })

  it('Case 3: short lines/long song → 2 cols, 16pt, 1 page', () => {
    const song = {
      title: 'c3', key: 'C',
      lyricsBlocks: [
        section('Verse1', 20, 24, true),
        section('Verse2', 20, 24)
      ]
    }
    const plan = planSong(song)
    expect(plan.columns).toBe(2)
    expect(plan.lyricSizePt).toBe(16)
    expect(plan.layout.pages.length).toBe(1)
    verifyNoSectionSplits(plan)
    verifyChordOrdering(plan)
  })

  it('Case 4: long lines/long song → single page, shrunk (1 or 2 cols)', () => {
    const song = {
      title: 'c4', key: 'C',
      lyricsBlocks: [section('Verse', 40, 30, true)]
    }
    const plan = planSong(song)
    expect([1, 2]).toContain(plan.columns)
    expect(plan.lyricSizePt).toBeLessThan(16)
    expect(plan.lyricSizePt).toBeGreaterThanOrEqual(12)
    expect(plan.layout.pages.length).toBe(1)
    verifyNoSectionSplits(plan)
    verifyChordOrdering(plan)
  })

  it('Case 5: too big → 1 col @12pt, >1 page', () => {
    const song = {
      title: 'c5', key: 'C',
      lyricsBlocks: [section('Verse', 60, 80, true)]
    }
    const plan = planSong(song)
    expect(plan.columns).toBe(1)
    expect(plan.lyricSizePt).toBe(12)
    // Fallback plan is multi-page
    expect(plan.layout.pages.length).toBeGreaterThan(1)
    // In extreme fallback, block contents may be elided; skip detailed chord/block checks
  })

  it('Holy Forever regression: long song → 2 cols, ~15pt, 1 page', () => {
    const song = {
      title: 'holy', key: 'C',
      lyricsBlocks: [
        section('Verse1', 7, 24, true),
        section('Verse2', 7, 24),
        section('Pre', 5, 24),
        section('Chorus', 4, 24),
        section('Bridge', 7, 24),
        section('Tag', 3, 24)
      ]
    }
    const plan = planSong(song)
    expect(plan.columns).toBe(2)
    expect(plan.lyricSizePt).toBeGreaterThanOrEqual(15)
    expect(plan.layout.pages.length).toBe(1)
    verifyNoSectionSplits(plan)
    verifyChordOrdering(plan)
  })
})
