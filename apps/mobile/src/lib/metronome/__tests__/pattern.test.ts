import { describe, expect, it } from 'vitest'
import {
  MAX_BPM,
  MIN_BPM,
  TIME_SIGNATURES,
  beatEmphasis,
  beatIntervalSec,
  beatsInMeasure,
  clampBpm,
  type BeatEmphasis,
  type TimeSignatureId,
} from '../pattern'

function measurePattern(sig: TimeSignatureId, accent: boolean): BeatEmphasis[] {
  return Array.from({ length: beatsInMeasure(sig) }, (_, i) => beatEmphasis(sig, i, accent))
}

describe('time signatures', () => {
  it('offers exactly 4/4, 2/4, 3/4, 6/8', () => {
    expect(TIME_SIGNATURES.map((s) => s.id)).toEqual(['4/4', '2/4', '3/4', '6/8'])
  })
  it('knows the beats per measure', () => {
    expect(beatsInMeasure('4/4')).toBe(4)
    expect(beatsInMeasure('2/4')).toBe(2)
    expect(beatsInMeasure('3/4')).toBe(3)
    expect(beatsInMeasure('6/8')).toBe(6)
  })
})

describe('beatEmphasis', () => {
  it('accents only beat 1 in 4/4, 2/4 and 3/4', () => {
    expect(measurePattern('4/4', true)).toEqual(['primary', 'normal', 'normal', 'normal'])
    expect(measurePattern('2/4', true)).toEqual(['primary', 'normal'])
    expect(measurePattern('3/4', true)).toEqual(['primary', 'normal', 'normal'])
  })

  it('accents beats 1 and 4 in 6/8 (two dotted-quarter pulses)', () => {
    expect(measurePattern('6/8', true)).toEqual([
      'primary',
      'normal',
      'normal',
      'secondary',
      'normal',
      'normal',
    ])
  })

  it('flattens every beat when the downbeat accent is off', () => {
    for (const { id } of TIME_SIGNATURES) {
      expect(measurePattern(id, false)).toEqual(
        Array.from({ length: beatsInMeasure(id) }, () => 'normal')
      )
    }
  })

  it('wraps beat indices past the measure', () => {
    expect(beatEmphasis('4/4', 4, true)).toBe('primary')
    expect(beatEmphasis('6/8', 9, true)).toBe('secondary')
  })
})

describe('tempo math', () => {
  it('converts BPM to a beat interval in seconds', () => {
    expect(beatIntervalSec(60)).toBeCloseTo(1, 9)
    expect(beatIntervalSec(120)).toBeCloseTo(0.5, 9)
    expect(beatIntervalSec(90)).toBeCloseTo(2 / 3, 9)
  })

  it('clamps and rounds BPM to the supported range', () => {
    expect(clampBpm(100.4)).toBe(100)
    expect(clampBpm(0)).toBe(MIN_BPM)
    expect(clampBpm(10000)).toBe(MAX_BPM)
    expect(clampBpm(Number.NaN)).toBe(MIN_BPM)
  })
})
