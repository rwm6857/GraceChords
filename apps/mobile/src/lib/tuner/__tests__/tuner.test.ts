import { describe, expect, it } from 'vitest'
import { STANDARD_TUNING, centsBetween, nearestString } from '../notes'
import { createYinDetector, rmsLevel } from '../yin'
import { createCentsSmoother } from '../smoothing'

describe('centsBetween', () => {
  it('is 0 at the reference frequency', () => {
    expect(centsBetween(440, 440)).toBe(0)
  })
  it('is +1200 an octave up and -1200 an octave down', () => {
    expect(centsBetween(880, 440)).toBeCloseTo(1200, 6)
    expect(centsBetween(220, 440)).toBeCloseTo(-1200, 6)
  })
  it('is +100 one equal-tempered semitone up', () => {
    expect(centsBetween(440 * Math.pow(2, 1 / 12), 440)).toBeCloseTo(100, 6)
  })
})

describe('nearestString', () => {
  it('maps each exact string frequency to itself at 0 cents', () => {
    for (const s of STANDARD_TUNING) {
      const reading = nearestString(s.frequency)
      expect(reading?.string.name).toBe(s.name)
      expect(reading?.cents).toBeCloseTo(0, 6)
    }
  })
  it('reads 85 Hz as a sharp low E', () => {
    const reading = nearestString(85)
    expect(reading?.string.name).toBe('E2')
    expect(reading?.cents).toBeGreaterThan(0)
    expect(reading?.cents).toBeCloseTo(53.7, 0)
  })
  it('reads 100 Hz as a flat A (nearer A2 than E2)', () => {
    const reading = nearestString(100)
    expect(reading?.string.name).toBe('A2')
    expect(reading?.cents).toBeLessThan(0)
  })
  it('rejects frequencies far outside the guitar range', () => {
    expect(nearestString(30)).toBeNull()
    expect(nearestString(2000)).toBeNull()
    expect(nearestString(0)).toBeNull()
    expect(nearestString(NaN)).toBeNull()
  })
})

function sine(frequency: number, sampleRate: number, length: number): Float32Array {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) out[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate)
  return out
}

describe('createYinDetector', () => {
  const sampleRate = 24000
  const detector = createYinDetector({ sampleRate, windowSize: 2048 })

  it('detects each standard-tuning string frequency within 1 cent on a pure tone', () => {
    for (const s of STANDARD_TUNING) {
      const reading = detector.detect(sine(s.frequency, sampleRate, 2048))
      expect(reading, s.name).not.toBeNull()
      expect(Math.abs(centsBetween(reading!.frequency, s.frequency)), s.name).toBeLessThan(1)
    }
  })
  it('detects low E (82.41 Hz) specifically', () => {
    const reading = detector.detect(sine(82.4069, sampleRate, 2048))
    expect(reading).not.toBeNull()
    expect(nearestString(reading!.frequency)?.string.name).toBe('E2')
  })
  it('returns null on silence and on white noise', () => {
    expect(detector.detect(new Float32Array(2048))).toBeNull()
    const noise = new Float32Array(2048)
    let seed = 42
    for (let i = 0; i < noise.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      noise[i] = seed / 2 ** 31 - 1
    }
    expect(detector.detect(noise)).toBeNull()
  })
  it('throws when the window cannot hold the lowest period', () => {
    expect(() => createYinDetector({ sampleRate: 48000, windowSize: 512 })).toThrow()
  })
})

describe('rmsLevel', () => {
  it('is 0 for silence and ~0.707 for a full-scale sine', () => {
    expect(rmsLevel(new Float32Array(512))).toBe(0)
    expect(rmsLevel(sine(440, 48000, 4800))).toBeCloseTo(Math.SQRT1_2, 2)
  })
})

describe('createCentsSmoother', () => {
  it('suppresses a single-frame glitch via the median', () => {
    const smoother = createCentsSmoother({ medianWindow: 5, emaAlpha: 1 })
    smoother.push(10)
    smoother.push(10)
    smoother.push(10)
    expect(smoother.push(600)).toBe(10) // octave glitch ignored
    expect(smoother.push(10)).toBe(10)
  })
  it('converges to a steady input after reset', () => {
    const smoother = createCentsSmoother()
    smoother.push(-40)
    smoother.reset()
    let value = 0
    for (let i = 0; i < 20; i++) value = smoother.push(5)
    expect(value).toBeCloseTo(5, 1)
  })
})
