// Audio glue for the metronome — the only metronome module that imports
// react-native-audio-api. Clicks are oscillator blips (no assets) scheduled
// ahead of time on the audio clock with the classic lookahead pattern: a 25 ms
// JS timer keeps ~120 ms of clicks queued at exact `ctx.currentTime`-relative
// timestamps, so JS timer jitter never reaches the ear (a setInterval-triggered
// play() would audibly drift). The same tick advances the visual beat by
// consuming the queue of already-scheduled beats as the clock passes them.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioContext, AudioManager } from 'react-native-audio-api'
import {
  beatEmphasis,
  beatIntervalSec,
  beatsInMeasure,
  clampBpm,
  type BeatEmphasis,
  type TimeSignatureId,
} from './pattern'

const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_S = 0.12
const START_DELAY_S = 0.08
const CLICK_DECAY_S = 0.045

// Two click voices (accent vs regular) plus the 6/8 secondary accent between
// them — same synthesis, different pitch/level, so the downbeat reads clearly.
const CLICKS: Record<BeatEmphasis, { frequency: number; peak: number }> = {
  primary: { frequency: 1760, peak: 0.9 },
  secondary: { frequency: 1320, peak: 0.62 },
  normal: { frequency: 1000, peak: 0.42 },
}

function scheduleClick(ctx: AudioContext, at: number, emphasis: BeatEmphasis) {
  const { frequency, peak } = CLICKS[emphasis]
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(frequency, at)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + CLICK_DECAY_S)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + CLICK_DECAY_S + 0.02)
}

export interface Metronome {
  running: boolean
  start: () => Promise<void>
  stop: () => void
  bpm: number
  setBpm: (bpm: number) => void
  /** Nudge the tempo relative to its LIVE value — safe inside a hold-repeat
   * interval, where a `setBpm(bpm ± 1)` closure would go stale after one step. */
  stepBpm: (delta: number) => void
  signature: TimeSignatureId
  setSignature: (sig: TimeSignatureId) => void
  accentEnabled: boolean
  setAccentEnabled: (on: boolean) => void
  /** 0-based beat currently sounding within the measure; null when stopped. */
  currentBeat: number | null
}

export function useMetronome(initialBpm = 100): Metronome {
  const [running, setRunning] = useState(false)
  const [bpm, setBpmState] = useState(() => clampBpm(initialBpm))
  const [signature, setSignatureState] = useState<TimeSignatureId>('4/4')
  const [accentEnabled, setAccentEnabledState] = useState(true)
  const [currentBeat, setCurrentBeat] = useState<number | null>(null)

  const ctxRef = useRef<AudioContext | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Scheduler-side mirrors of the knobs, so the tick never closes over stale state.
  const bpmRef = useRef(bpm)
  const sigRef = useRef(signature)
  const accentRef = useRef(accentEnabled)
  const nextTimeRef = useRef(0)
  const beatRef = useRef(0)
  const queueRef = useRef<{ beat: number; time: number }[]>([])

  const tick = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    while (nextTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_S) {
      const sig = sigRef.current
      const beat = beatRef.current % beatsInMeasure(sig)
      scheduleClick(ctx, nextTimeRef.current, beatEmphasis(sig, beat, accentRef.current))
      queueRef.current.push({ beat, time: nextTimeRef.current })
      nextTimeRef.current += beatIntervalSec(bpmRef.current)
      beatRef.current = beat + 1
    }
    // Advance the visual indicator to the newest beat the clock has passed.
    let sounding: { beat: number } | null = null
    while (queueRef.current.length > 0 && queueRef.current[0].time <= ctx.currentTime) {
      sounding = queueRef.current.shift()!
    }
    if (sounding) setCurrentBeat(sounding.beat)
  }, [])

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    queueRef.current = []
    setRunning(false)
    setCurrentBeat(null)
    ctxRef.current?.suspend().catch(() => {})
    AudioManager.setAudioSessionActivity(false).catch(() => {})
  }, [])

  const start = useCallback(async () => {
    if (intervalRef.current !== null) return
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playback',
      iosMode: 'default',
      iosOptions: ['mixWithOthers'],
      iosAllowHaptics: true,
    })
    await AudioManager.setAudioSessionActivity(true).catch(() => {})
    let ctx = ctxRef.current
    if (!ctx) {
      ctx = new AudioContext()
      ctxRef.current = ctx
    }
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    beatRef.current = 0
    queueRef.current = []
    nextTimeRef.current = ctx.currentTime + START_DELAY_S
    setRunning(true)
    intervalRef.current = setInterval(tick, LOOKAHEAD_MS)
    tick()
  }, [tick])

  useEffect(
    () => () => {
      stop()
      ctxRef.current?.close().catch(() => {})
      ctxRef.current = null
    },
    [stop]
  )

  const setBpm = useCallback((next: number) => {
    const clamped = clampBpm(next)
    bpmRef.current = clamped
    setBpmState(clamped)
  }, [])

  const stepBpm = useCallback(
    (delta: number) => setBpm(bpmRef.current + delta),
    [setBpm]
  )

  const setSignature = useCallback((sig: TimeSignatureId) => {
    sigRef.current = sig
    // Restart the measure so the next scheduled click is a downbeat.
    beatRef.current = 0
    setSignatureState(sig)
  }, [])

  const setAccentEnabled = useCallback((on: boolean) => {
    accentRef.current = on
    setAccentEnabledState(on)
  }, [])

  return {
    running,
    start,
    stop,
    bpm,
    setBpm,
    stepBpm,
    signature,
    setSignature,
    accentEnabled,
    setAccentEnabled,
    currentBeat,
  }
}
