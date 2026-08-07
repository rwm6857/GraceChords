import { describe, expect, it } from 'vitest'
import { packOrdered } from '../columnLayout'

// Property check: packOrdered's DP must equal a brute-force search over every
// ordered partition. Guards the tie-breaking and the dp bounds — an off-by-one
// there produces a plausible-but-suboptimal split that is very hard to spot by
// eye on a real song.

/** Every ordered way to cut `n` sections into exactly `k` non-empty columns. */
function allCuts(n: number, k: number): number[][] {
  const out: number[][] = []
  const walk = (cuts: number[], next: number) => {
    if (cuts.length === k) {
      if (next <= n) out.push(cuts.slice())
      return
    }
    for (let i = next; i <= n - (k - cuts.length); i++) walk([...cuts, i], i + 1)
  }
  walk([], 0)
  return out.filter((c) => c[0] === 0)
}

function maxColumn(heights: number[], cuts: number[], gap: number): number {
  let worst = 0
  for (let i = 0; i < cuts.length; i++) {
    const end = i + 1 < cuts.length ? cuts[i + 1] : heights.length
    const run = heights.slice(cuts[i], end)
    worst = Math.max(worst, run.reduce((a, b) => a + b, 0) + gap * Math.max(0, run.length - 1))
  }
  return worst
}

// Deterministic LCG — no Math.random, so a failure is always reproducible.
function makeRng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

describe('packOrdered matches brute force', () => {
  it('over 2000 random section-height sets (k = 1..3)', () => {
    const rng = makeRng(20260807)
    const gap = 12
    for (let trial = 0; trial < 2000; trial++) {
      const n = 1 + Math.floor(rng() * 12)
      const heights = Array.from({ length: n }, () => Math.round(20 + rng() * 900))
      for (const k of [1, 2, 3]) {
        const got = packOrdered(heights, gap, k)
        const columns = Math.max(1, Math.min(k, n))
        const best = Math.min(...allCuts(n, columns).map((c) => maxColumn(heights, c, gap)))

        expect(got.maxHeight, `n=${n} k=${k} heights=${heights}`).toBe(best)
        // The returned cuts must actually achieve the reported optimum.
        expect(maxColumn(heights, got.cuts, gap)).toBe(got.maxHeight)
        expect(got.cuts).toHaveLength(columns)
        expect(got.cuts[0]).toBe(0)
        for (let i = 1; i < got.cuts.length; i++) {
          expect(got.cuts[i]).toBeGreaterThan(got.cuts[i - 1])
        }
      }
    }
  })

  it('breaks ties toward the fullest earliest column', () => {
    const rng = makeRng(7)
    const gap = 0
    for (let trial = 0; trial < 500; trial++) {
      const n = 2 + Math.floor(rng() * 8)
      const heights = Array.from({ length: n }, () => Math.round(20 + rng() * 200))
      const got = packOrdered(heights, gap, 2)
      const optimal = allCuts(n, 2).filter((c) => maxColumn(heights, c, gap) === got.maxHeight)
      // Among equally-good splits, ours starts the last column latest.
      expect(got.cuts[1]).toBe(Math.max(...optimal.map((c) => c[1])))
    }
  })
})
