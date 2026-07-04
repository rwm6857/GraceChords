// SPIKE-ONLY: headless benchmark for the tuner pitch pipeline.
// Streams synthetic plucks (see signals.ts) through the YIN detector exactly
// the way the device pipeline would — hop-sized callbacks filling a ring
// buffer — and measures latency, accuracy, jitter, gross-error rate, and the
// cost of smoothing, per configuration and per string (low E called out).
//
// Run from apps/mobile/:  npx -y tsx spike/tuner/bench.ts

import { performance } from 'node:perf_hooks'
import { STANDARD_TUNING, centsBetween } from '../../src/lib/tuner/notes'
import { createYinDetector, decimate, rmsLevel } from '../../src/lib/tuner/yin'
import { createCentsSmoother } from '../../src/lib/tuner/smoothing'
import { synthPluck } from './signals'

const CAPTURE_RATE = 48000

interface Config {
  name: string
  decim: number
  window: number
  hop: number // in decimated samples
}

const CONFIGS: Config[] = [
  { name: '48k w2048 h1024', decim: 1, window: 2048, hop: 1024 },
  { name: '48k w4096 h1024', decim: 1, window: 4096, hop: 1024 },
  { name: '24k w1024 h512 ', decim: 2, window: 1024, hop: 512 },
  { name: '24k w2048 h512 ', decim: 2, window: 2048, hop: 512 },
  { name: '12k w1024 h256 ', decim: 4, window: 1024, hop: 256 },
]

// Per-string physical character: low wound strings ring longer, are stiffer
// (more inharmonic), and the low E's fundamental is notoriously weak.
const STRING_CHARACTER: Record<string, { fundamentalGain: number; inharmonicity: number; decay: number }> = {
  E2: { fundamentalGain: 0.3, inharmonicity: 1.7e-4, decay: 3.0 },
  A2: { fundamentalGain: 0.6, inharmonicity: 1.2e-4, decay: 3.0 },
  D3: { fundamentalGain: 0.8, inharmonicity: 1.0e-4, decay: 2.5 },
  G3: { fundamentalGain: 1.0, inharmonicity: 0.8e-4, decay: 2.0 },
  B3: { fundamentalGain: 1.0, inharmonicity: 0.5e-4, decay: 1.8 },
  E4: { fundamentalGain: 1.0, inharmonicity: 0.4e-4, decay: 1.5 },
}

const DETUNES_CENTS = [0, 8, -20]
const SNRS_DB = [Infinity, 25, 15]
const SEEDS = [1, 2, 3]
const ONSET_S = 0.05
const RMS_GATE = 0.015
const STEADY_MS: [number, number] = [250, 1000]

interface PluckStats {
  stringName: string
  firstReadingMs: number | null
  steadyMeanErr: number | null
  steadyJitterStd: number | null
  steadyP95Dev: number | null
  grossRate: number
  settleMs: number | null
  smoothedJitterStd: number | null
  detectCalls: number
  detectMsTotal: number
}

function std(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) * (v - mean), 0) / values.length)
}
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
function quantile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

function runPluck(config: Config, stringName: string, f0True: number, snrDb: number, seed: number): PluckStats {
  const character = STRING_CHARACTER[stringName]
  const raw = synthPluck({
    sampleRate: CAPTURE_RATE,
    durationSeconds: 1.3,
    f0: f0True,
    onsetSeconds: ONSET_S,
    fundamentalGain: character.fundamentalGain,
    inharmonicity: character.inharmonicity,
    decaySeconds: character.decay,
    snrDb,
    seed,
  })
  const audio = config.decim === 1 ? raw : decimate(raw, config.decim)
  const sr = CAPTURE_RATE / config.decim

  const detector = createYinDetector({ sampleRate: sr, windowSize: config.window })
  const smoother = createCentsSmoother()

  const stats: PluckStats = {
    stringName,
    firstReadingMs: null,
    steadyMeanErr: null,
    steadyJitterStd: null,
    steadyP95Dev: null,
    grossRate: 0,
    settleMs: null,
    smoothedJitterStd: null,
    detectCalls: 0,
    detectMsTotal: 0,
  }

  const steady: number[] = []
  const smoothedSteady: number[] = []
  let validCount = 0
  let grossCount = 0
  let settledAt: number | null = null

  for (let end = config.window; end <= audio.length; end += config.hop) {
    const frame = audio.subarray(end - config.window, end)
    if (rmsLevel(frame) < RMS_GATE) {
      smoother.reset()
      continue
    }
    const t0 = performance.now()
    const reading = detector.detect(frame)
    stats.detectMsTotal += performance.now() - t0
    stats.detectCalls++
    if (!reading) continue

    const tMs = (end / sr - ONSET_S) * 1000
    const err = centsBetween(reading.frequency, f0True)
    validCount++
    if (Math.abs(err) > 50) {
      grossCount++
      continue
    }
    if (stats.firstReadingMs === null) stats.firstReadingMs = tMs

    const smoothed = smoother.push(err)
    if (settledAt === null && Math.abs(smoothed) <= 3) settledAt = tMs

    if (tMs >= STEADY_MS[0] && tMs <= STEADY_MS[1]) {
      steady.push(err)
      smoothedSteady.push(smoothed)
    }
  }

  if (steady.length >= 4) {
    const mean = steady.reduce((a, b) => a + b, 0) / steady.length
    stats.steadyMeanErr = mean
    stats.steadyJitterStd = std(steady)
    stats.steadyP95Dev = quantile(steady.map((v) => Math.abs(v - mean)), 0.95)
    stats.smoothedJitterStd = std(smoothedSteady)
  }
  stats.grossRate = validCount > 0 ? grossCount / validCount : 1
  stats.settleMs = settledAt
  return stats
}

function fmt(v: number | null, digits = 1): string {
  return v === null ? '—' : v.toFixed(digits)
}

const perConfig: Record<string, PluckStats[]> = {}
for (const config of CONFIGS) {
  const all: PluckStats[] = []
  for (const string of STANDARD_TUNING) {
    for (const detune of DETUNES_CENTS) {
      const f0True = string.frequency * Math.pow(2, detune / 1200)
      for (const snrDb of SNRS_DB) {
        for (const seed of SEEDS) {
          all.push(runPluck(config, string.name, f0True, snrDb, seed))
        }
      }
    }
  }
  perConfig[config.name] = all
}

console.log(
  `## Config comparison (all 6 strings × detunes ${DETUNES_CENTS.join('/')}c × SNR ${SNRS_DB.map((s) => (Number.isFinite(s) ? `${s}dB` : '∞')).join('/')} × ${SEEDS.length} seeds)\n`
)
console.log('| config | 1st reading ms (med/p90) | |bias| max (c) | raw jitter std med (c) | raw p95 dev med (c) | gross err % | settle ms med | smoothed jitter med (c) | detect ms/call |')
console.log('|---|---|---|---|---|---|---|---|---|')
for (const config of CONFIGS) {
  const all = perConfig[config.name]
  const first = all.map((s) => s.firstReadingMs).filter((v): v is number => v !== null)
  const bias = all.map((s) => s.steadyMeanErr).filter((v): v is number => v !== null)
  const jit = all.map((s) => s.steadyJitterStd).filter((v): v is number => v !== null)
  const p95 = all.map((s) => s.steadyP95Dev).filter((v): v is number => v !== null)
  const settle = all.map((s) => s.settleMs).filter((v): v is number => v !== null)
  const smoothJit = all.map((s) => s.smoothedJitterStd).filter((v): v is number => v !== null)
  const gross = all.reduce((a, s) => a + s.grossRate, 0) / all.length
  const detectMs = all.reduce((a, s) => a + s.detectMsTotal, 0) / all.reduce((a, s) => a + s.detectCalls, 0)
  const noReading = all.length - first.length
  console.log(
    `| ${config.name} | ${fmt(median(first), 0)} / ${fmt(quantile(first, 0.9), 0)}${noReading ? ` (${noReading} misses)` : ''} ` +
      `| ${fmt(Math.max(...bias.map(Math.abs)))} | ${fmt(median(jit), 2)} | ${fmt(median(p95), 2)} ` +
      `| ${(gross * 100).toFixed(2)} | ${fmt(median(settle), 0)} | ${fmt(median(smoothJit), 2)} | ${detectMs.toFixed(2)} |`
  )
}

console.log('\n## Per-string detail')
for (const config of CONFIGS) {
  console.log(`\n### ${config.name}\n`)
  console.log('| string | 1st reading ms med | bias c med | raw jitter std med c | gross % | settle ms med | smoothed jitter med c |')
  console.log('|---|---|---|---|---|---|---|')
  for (const string of STANDARD_TUNING) {
    const rows = perConfig[config.name].filter((s) => s.stringName === string.name)
    const first = rows.map((s) => s.firstReadingMs).filter((v): v is number => v !== null)
    const bias = rows.map((s) => s.steadyMeanErr).filter((v): v is number => v !== null)
    const jit = rows.map((s) => s.steadyJitterStd).filter((v): v is number => v !== null)
    const settle = rows.map((s) => s.settleMs).filter((v): v is number => v !== null)
    const smoothJit = rows.map((s) => s.smoothedJitterStd).filter((v): v is number => v !== null)
    const gross = rows.reduce((a, s) => a + s.grossRate, 0) / rows.length
    console.log(
      `| ${string.name} | ${first.length ? fmt(median(first), 0) : 'NO READ'} | ${bias.length ? fmt(median(bias)) : '—'} ` +
        `| ${jit.length ? fmt(median(jit), 2) : '—'} | ${(gross * 100).toFixed(2)} | ${settle.length ? fmt(median(settle), 0) : '—'} ` +
        `| ${smoothJit.length ? fmt(median(smoothJit), 2) : '—'} |`
    )
  }
}
