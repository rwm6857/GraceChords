import { describe, expect, it } from 'vitest'
import {
  DEGREE_POSITION,
  DETENT_COUNT,
  DETENT_DEG,
  FIFTHS,
  angleDelta,
  crossingIndex,
  keyAtOffset,
  keySlot,
  positionKey,
  rotationForKey,
  slotOffset,
  touchAngle,
  touchRadius,
  wrapDegrees,
} from '../keyWheel'
import { bubbleOpacity } from '../arcGeometry'

describe('the circle of fifths', () => {
  it('closes at twelve keys, one detent apart', () => {
    expect(FIFTHS).toHaveLength(DETENT_COUNT)
    expect(DETENT_DEG).toBe(30)
    expect(new Set(FIFTHS).size).toBe(DETENT_COUNT)
  })

  it('walks a fifth at a time and wraps', () => {
    expect(keyAtOffset('C', 1)).toBe('G')
    expect(keyAtOffset('C', -1)).toBe('F')
    expect(keyAtOffset('F#', 1)).toBe('Db')
    expect(keyAtOffset('C', 12)).toBe('C')
    expect(keyAtOffset('C', -13)).toBe('F')
  })

  it('falls back to C for a key it does not know', () => {
    expect(keySlot('H')).toBe(0)
    expect(keyAtOffset('H', 1)).toBe('G')
  })

  it('gives every key a diatonic set that reads IV I V on the outer ring', () => {
    for (const key of FIFTHS) {
      expect(keyAtOffset(key, -1)).toBe(FIFTHS[(keySlot(key) + 11) % 12])
      expect(keyAtOffset(key, 1)).toBe(FIFTHS[(keySlot(key) + 1) % 12])
    }
  })
})

describe('slot offsets', () => {
  it('wraps to the near side of the circle', () => {
    expect(slotOffset(0, 0)).toBe(0)
    expect(slotOffset(1, 0)).toBe(1)
    expect(slotOffset(11, 0)).toBe(-1)
    expect(slotOffset(6, 0)).toBe(-6)
    expect(slotOffset(5, 0)).toBe(5)
  })

  it('stays within half a turn either way', () => {
    for (let tonic = 0; tonic < 12; tonic++) {
      for (let slot = 0; slot < 12; slot++) {
        const offset = slotOffset(slot, tonic)
        expect(offset).toBeGreaterThanOrEqual(-6)
        expect(offset).toBeLessThanOrEqual(5)
      }
    }
  })
})

describe('angles', () => {
  it('folds into a half turn either way', () => {
    expect(wrapDegrees(0)).toBe(0)
    expect(wrapDegrees(180)).toBe(180)
    expect(wrapDegrees(181)).toBe(-179)
    expect(wrapDegrees(-180)).toBe(180)
    expect(wrapDegrees(370)).toBe(10)
    expect(wrapDegrees(-370)).toBe(-10)
  })

  it('takes the short way round', () => {
    expect(angleDelta(170, -170)).toBe(20)
    expect(angleDelta(-170, 170)).toBe(-20)
    expect(angleDelta(0, 30)).toBe(30)
  })

  it('reads a touch as an angle clockwise from twelve o clock', () => {
    expect(touchAngle(100, 0, 100, 100)).toBe(0)
    expect(touchAngle(200, 100, 100, 100)).toBe(90)
    expect(touchAngle(0, 100, 100, 100)).toBe(-90)
    expect(touchRadius(100, 0, 100, 100)).toBe(100)
  })
})

describe('detents', () => {
  it('rounds to the nearest, in both directions', () => {
    expect(crossingIndex(0)).toBe(0)
    expect(crossingIndex(14)).toBe(0)
    expect(crossingIndex(16)).toBe(1)
    expect(crossingIndex(-16)).toBe(-1)
    expect(crossingIndex(75)).toBe(3)
  })

  it('changes exactly once per 30 degrees crossed, so one tick fires per detent', () => {
    let ticks = 0
    let last = crossingIndex(0)
    for (let deg = 0; deg <= 90; deg += 0.5) {
      const now = crossingIndex(deg)
      if (now !== last) {
        ticks += 1
        last = now
      }
    }
    expect(ticks).toBe(3)
  })

  it('re-arms on the way back so the notch is felt in both directions', () => {
    let ticks = 0
    let last = crossingIndex(0)
    for (const deg of [0, 10, 20, 40, 20, 10, 40, 70]) {
      const now = crossingIndex(deg)
      if (now !== last) {
        ticks += 1
        last = now
      }
    }
    expect(ticks).toBe(4)
  })

  it('puts a key back at the top', () => {
    for (const key of FIFTHS) {
      const rotation = rotationForKey(keySlot('C'), key)
      expect(keyAtOffset('C', -crossingIndex(rotation))).toBe(key)
    }
  })
})

describe('degree positions', () => {
  it('covers all seven degrees across the two rings', () => {
    const positions = Object.values(DEGREE_POSITION).map((p) => positionKey(p.ring, p.slot))
    expect(new Set(positions).size).toBe(7)
    expect(DEGREE_POSITION[1]).toEqual({ ring: 'major', slot: 0 })
    expect(DEGREE_POSITION[4]).toEqual({ ring: 'major', slot: -1 })
    expect(DEGREE_POSITION[5]).toEqual({ ring: 'major', slot: 1 })
  })

  it('puts the three majors outside and the four others inside', () => {
    const outer = Object.values(DEGREE_POSITION).filter((p) => p.ring === 'major')
    const inner = Object.values(DEGREE_POSITION).filter((p) => p.ring === 'minor')
    expect(outer).toHaveLength(3)
    expect(inner).toHaveLength(4)
  })

  it('continues the inner ring in fifths: ii vi iii vii°', () => {
    // The vii° is one position right of iii — its root is a fifth above iii's,
    // and the chord the key gives on that root happens to be diminished.
    expect(DEGREE_POSITION[2]).toEqual({ ring: 'minor', slot: -1 })
    expect(DEGREE_POSITION[6]).toEqual({ ring: 'minor', slot: 0 })
    expect(DEGREE_POSITION[3]).toEqual({ ring: 'minor', slot: 1 })
    expect(DEGREE_POSITION[7]).toEqual({ ring: 'minor', slot: 2 })
  })
})

describe('bubble opacity', () => {
  it('holds IV, I and V at full strength and fades the neighbours', () => {
    expect(bubbleOpacity('major', 0)).toBe(1)
    expect(bubbleOpacity('major', 1)).toBe(1)
    expect(bubbleOpacity('major', -1)).toBe(1)
    expect(bubbleOpacity('major', 2)).toBeCloseTo(0.45)
    expect(bubbleOpacity('major', 3)).toBe(0)
  })

  it('keeps the whole inner ring solid, vii° included', () => {
    // +2 is the vii°: diatonic to the key even though the faded neighbour
    // directly above it is not, so it must not inherit that column's fade.
    expect(bubbleOpacity('minor', -1)).toBe(1)
    expect(bubbleOpacity('minor', 0)).toBe(1)
    expect(bubbleOpacity('minor', 1)).toBe(1)
    expect(bubbleOpacity('minor', 2)).toBe(1)
  })

  it('is asymmetric on the inner ring, which stops at ii on the left', () => {
    expect(bubbleOpacity('minor', -1.6)).toBe(0)
    expect(bubbleOpacity('minor', 2.6)).toBe(0)
    expect(bubbleOpacity('minor', -1.3)).toBeCloseTo(0.5)
    expect(bubbleOpacity('minor', 2.3)).toBeCloseTo(0.5)
  })

  it('is continuous, so nothing pops in or out mid-drag', () => {
    for (const ring of ['major', 'minor'] as const) {
      let previous = bubbleOpacity(ring, -4)
      for (let offset = -4; offset <= 4; offset += 0.05) {
        const value = bubbleOpacity(ring, offset)
        expect(Math.abs(value - previous)).toBeLessThan(0.2)
        previous = value
      }
    }
  })
})
