// Native capture glue for the tuner — the only tuner module that imports
// react-native-audio-api. Pipeline and parameters are the spike-proven config
// (see spike/tuner/RESULTS.md): 48 kHz mono capture, decimate ×2 → 24 kHz,
// YIN window 2048 (~85 ms) at a 1024-frame callback hop (~21 ms updates),
// median-5 + EMA-0.35 smoothing, in-tune hold |cents| ≤ 4 for 500 ms.
//
// Privacy by construction: `enableFileOutput()` is never called, so the
// recorder can't write audio to disk, and nothing here touches the network.
// Buffers are analyzed in memory and discarded.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioManager, AudioRecorder } from 'react-native-audio-api'
import { stringReading, type StringReading, type TunerString } from './notes'
import { createYinDetector, decimate, rmsLevel } from './yin'
import { createCentsSmoother } from './smoothing'
import { createInTuneHold, type HoldState } from './hold'

const CAPTURE_RATE = 48000
const CALLBACK_LENGTH = 1024
const DECIMATION = 2
const ANALYSIS_RATE = CAPTURE_RATE / DECIMATION
const WINDOW = 2048
// Opened slightly from the spike's 0.008 so a decaying string is still tracked
// into its tail instead of the gate slamming shut early.
const RMS_GATE = 0.006
/** Keep showing the last reading through short detection dropouts (note decay). */
const DROPOUT_MS = 650

export type TunerPermission = 'unknown' | 'undetermined' | 'granted' | 'denied'

export interface TunerReading {
  frequency: number
  /** Smoothed cents vs the resolved string — what the needle shows. */
  cents: number
  string: StringReading['string']
  hold: HoldState
}

export interface TunerFrame {
  reading: TunerReading | null
}

export interface UseTunerOptions {
  /**
   * Full-rate (~47/s) frame callback for driving the needle without React
   * re-renders (e.g. writing a Reanimated shared value). Optional; the
   * throttled `reading` state below is enough for text.
   */
  onFrame?: (frame: TunerFrame) => void
}

export interface Tuner {
  permission: TunerPermission
  /** Asks for mic access (first-use prompt). Resolves to the new state. */
  requestPermission: () => Promise<TunerPermission>
  running: boolean
  start: () => Promise<void>
  stop: () => void
  /** Manual string lock; null = auto-detect. Changing it re-anchors live. */
  lockedString: TunerString | null
  setLockedString: (s: TunerString | null) => void
  /** Throttled (~10/s) reading for text displays; null while silent. */
  reading: TunerReading | null
}

function toPermission(status: string): TunerPermission {
  if (status === 'Granted') return 'granted'
  if (status === 'Denied') return 'denied'
  return 'undetermined'
}

export function useTuner(options: UseTunerOptions = {}): Tuner {
  const [permission, setPermission] = useState<TunerPermission>('unknown')
  const [running, setRunning] = useState(false)
  const [reading, setReading] = useState<TunerReading | null>(null)
  const [lockedString, setLockedStringState] = useState<TunerString | null>(null)

  const recorderRef = useRef<AudioRecorder | null>(null)
  const lockRef = useRef<TunerString | null>(null)
  const onFrameRef = useRef<UseTunerOptions['onFrame']>(options.onFrame)
  onFrameRef.current = options.onFrame
  const lastTextPushRef = useRef(0)

  useEffect(() => {
    let alive = true
    AudioManager.checkRecordingPermissions()
      .then((status) => {
        if (alive) setPermission(toPermission(status))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const stop = useCallback(() => {
    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder) {
      recorder.stop().catch(() => {})
      recorder.clearOnAudioReady()
      recorder.clearOnError()
      AudioManager.setAudioSessionActivity(false).catch(() => {})
    }
    setRunning(false)
    setReading(null)
    onFrameRef.current?.({ reading: null })
  }, [])

  useEffect(() => stop, [stop])

  const requestPermission = useCallback(async (): Promise<TunerPermission> => {
    const status = toPermission(await AudioManager.requestRecordingPermissions())
    setPermission(status)
    return status
  }, [])

  const publish = useCallback((next: TunerReading | null, force: boolean) => {
    onFrameRef.current?.({ reading: next })
    // Text (note letter / Hz / cents digits) re-renders at ~10 Hz — the
    // needle gets every frame via onFrame instead.
    const now = Date.now()
    if (force || now - lastTextPushRef.current >= 100) {
      lastTextPushRef.current = now
      setReading(next)
    }
  }, [])

  const start = useCallback(async () => {
    if (recorderRef.current) return
    if ((await requestPermission()) !== 'granted') return

    // 'measurement' disables system input processing (AGC / voice isolation)
    // that would otherwise mangle the tuner's view of the raw signal.
    AudioManager.setAudioSessionOptions({ iosCategory: 'record', iosMode: 'measurement' })
    await AudioManager.setAudioSessionActivity(true)

    const detector = createYinDetector({ sampleRate: ANALYSIS_RATE, windowSize: WINDOW })
    const smoother = createCentsSmoother()
    const hold = createInTuneHold()
    const ring = new Float32Array(WINDOW)
    let filled = 0
    let lastReading: TunerReading | null = null
    let lastReadingAt = 0

    const clear = () => {
      smoother.reset()
      hold.reset()
      lastReading = null
      // Always force: a throttled null could be skipped and never re-sent,
      // leaving stale text on screen through the silence.
      publish(null, true)
    }

    const recorder = new AudioRecorder()
    recorderRef.current = recorder
    recorder.onAudioReady(
      { sampleRate: CAPTURE_RATE, bufferLength: CALLBACK_LENGTH, channelCount: 1 },
      (event) => {
        const chunk = decimate(event.buffer.getChannelData(0), DECIMATION)
        ring.copyWithin(0, chunk.length)
        ring.set(chunk, WINDOW - chunk.length)
        filled = Math.min(WINDOW, filled + chunk.length)
        if (filled < WINDOW) return

        const now = Date.now()
        if (rmsLevel(ring) < RMS_GATE) {
          // Same decay grace as a detection miss: hold the last reading for
          // DROPOUT_MS after the level dips rather than blanking instantly, so
          // the display lingers through the tail of a ringing string.
          if (lastReading && now - lastReadingAt > DROPOUT_MS) clear()
          else if (lastReading) publish(lastReading, false)
          return
        }

        const detected = detector.detect(ring)
        const resolved = detected ? stringReading(detected.frequency, lockRef.current) : null
        if (!resolved) {
          // Single-frame YIN misses happen mid-decay; hold the display briefly
          // instead of blanking, then clear on a real dropout.
          if (lastReading && now - lastReadingAt > DROPOUT_MS) clear()
          else if (lastReading) publish(lastReading, false)
          return
        }

        // A new string (auto mode) or a re-anchored lock restarts smoothing so
        // the needle doesn't glide across from the previous target.
        if (lastReading && lastReading.string.name !== resolved.string.name) {
          smoother.reset()
          hold.reset()
        }
        const cents = smoother.push(resolved.cents)
        lastReading = {
          frequency: detected!.frequency,
          cents,
          string: resolved.string,
          hold: hold.push(cents, now),
        }
        lastReadingAt = now
        publish(lastReading, false)
      }
    )
    recorder.onError(() => {
      clear()
    })
    await recorder.start()
    setRunning(true)
  }, [publish, requestPermission])

  const setLockedString = useCallback(
    (s: TunerString | null) => {
      lockRef.current = s
      setLockedStringState(s)
      // Re-anchor immediately: cents against a new target are a different
      // quantity, so continuing the old smoothing window would be wrong.
      setReading(null)
      onFrameRef.current?.({ reading: null })
    },
    []
  )

  return {
    permission,
    requestPermission,
    running,
    start,
    stop,
    lockedString,
    setLockedString,
    reading,
  }
}
