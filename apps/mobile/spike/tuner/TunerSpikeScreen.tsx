// SPIKE-ONLY on-device harness for the tuner pipeline. Deliberately NOT the
// production tuner UI — it exists to validate the headless benchmark numbers
// on real hardware: capture health (callback cadence), detection latency,
// reading stability (raw + smoothed cents jitter), and low-E reliability.
// Reached via the Utilities tab's Tuner row in __DEV__ builds only.

import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { AudioManager, AudioRecorder } from 'react-native-audio-api'
import type { PermissionStatus } from 'react-native-audio-api'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Screen from '../../src/components/Screen'
import { useTheme } from '../../src/theme/ThemeProvider'
import { nearestString } from '../../src/lib/tuner/notes'
import { createCentsSmoother } from '../../src/lib/tuner/smoothing'
import { createYinDetector, decimate, rmsLevel } from '../../src/lib/tuner/yin'

// Spike-recommended pipeline parameters (see spike/tuner/RESULTS.md).
const CAPTURE_RATE = 48000
const CALLBACK_LENGTH = 1024 // 21.3 ms cadence at 48 kHz
const DECIMATION = 2 // analyze at 24 kHz
const WINDOW = 2048 // 85.3 ms analysis window at 24 kHz
const RMS_GATE = 0.008

interface LiveStats {
  status: string
  hz: number | null
  stringName: string | null
  rawCents: number | null
  smoothedCents: number | null
  clarity: number | null
  jitterStd: number | null
  callbackAvgMs: number | null
  callbackMaxMs: number
  detectAvgMs: number | null
  detectMaxMs: number
  callbacks: number
  reads: number
  rms: number
}

const INITIAL: LiveStats = {
  status: 'idle',
  hz: null,
  stringName: null,
  rawCents: null,
  smoothedCents: null,
  clarity: null,
  jitterStd: null,
  callbackAvgMs: null,
  callbackMaxMs: 0,
  detectAvgMs: null,
  detectMaxMs: 0,
  callbacks: 0,
  reads: 0,
  rms: 0,
}

function std(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) * (v - mean), 0) / values.length)
}

export default function TunerSpikeScreen() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [permission, setPermission] = useState<PermissionStatus>('Undetermined')
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<LiveStats>(INITIAL)

  const recorderRef = useRef<AudioRecorder | null>(null)
  const liveRef = useRef<LiveStats>({ ...INITIAL })

  useEffect(() => {
    AudioManager.checkRecordingPermissions().then(setPermission).catch(() => {})
    return () => {
      stopCapture()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setStats({ ...liveRef.current }), 100)
    return () => clearInterval(id)
  }, [running])

  function stopCapture() {
    recorderRef.current?.stop().catch(() => {})
    recorderRef.current?.clearOnAudioReady()
    recorderRef.current = null
    AudioManager.setAudioSessionActivity(false).catch(() => {})
    setRunning(false)
  }

  async function startCapture() {
    const granted = await AudioManager.requestRecordingPermissions()
    setPermission(granted)
    if (granted !== 'Granted') {
      liveRef.current = { ...INITIAL, status: 'mic permission denied — enable in Settings' }
      setStats({ ...liveRef.current })
      return
    }

    // 'measurement' disables system input processing (AGC/voice isolation),
    // which otherwise mangles a tuner's view of the raw signal.
    AudioManager.setAudioSessionOptions({ iosCategory: 'record', iosMode: 'measurement' })
    await AudioManager.setAudioSessionActivity(true)

    const detector = createYinDetector({
      sampleRate: CAPTURE_RATE / DECIMATION,
      windowSize: WINDOW,
    })
    const smoother = createCentsSmoother()
    const ring = new Float32Array(WINDOW)
    let filled = 0
    let lastCallbackAt = 0
    const recentCents: number[] = []

    const live = { ...INITIAL, status: 'listening' }
    liveRef.current = live

    const recorder = new AudioRecorder()
    recorderRef.current = recorder
    recorder.onAudioReady(
      { sampleRate: CAPTURE_RATE, bufferLength: CALLBACK_LENGTH, channelCount: 1 },
      (event) => {
        const now = performance.now()
        if (lastCallbackAt > 0) {
          const interval = now - lastCallbackAt
          live.callbackAvgMs =
            live.callbackAvgMs === null ? interval : live.callbackAvgMs * 0.95 + interval * 0.05
          if (interval > live.callbackMaxMs) live.callbackMaxMs = interval
        }
        lastCallbackAt = now
        live.callbacks++

        const chunk = decimate(event.buffer.getChannelData(0), DECIMATION)
        ring.copyWithin(0, chunk.length)
        ring.set(chunk, WINDOW - chunk.length)
        filled = Math.min(WINDOW, filled + chunk.length)
        if (filled < WINDOW) return

        live.rms = rmsLevel(ring)
        if (live.rms < RMS_GATE) {
          smoother.reset()
          recentCents.length = 0
          live.status = 'listening (below gate)'
          live.hz = null
          live.rawCents = null
          live.smoothedCents = null
          live.jitterStd = null
          return
        }

        const t0 = performance.now()
        const reading = detector.detect(ring)
        const detectMs = performance.now() - t0
        live.detectAvgMs =
          live.detectAvgMs === null ? detectMs : live.detectAvgMs * 0.9 + detectMs * 0.1
        if (detectMs > live.detectMaxMs) live.detectMaxMs = detectMs

        if (!reading) {
          live.status = 'no pitch'
          return
        }
        const match = nearestString(reading.frequency)
        if (!match) {
          live.status = `out of range (${reading.frequency.toFixed(1)} Hz)`
          return
        }
        live.reads++
        live.status = 'tracking'
        live.hz = reading.frequency
        live.clarity = reading.clarity
        live.stringName = match.string.name
        live.rawCents = match.cents
        live.smoothedCents = smoother.push(match.cents)
        recentCents.push(match.cents)
        if (recentCents.length > 48) recentCents.shift()
        live.jitterStd = recentCents.length >= 8 ? std(recentCents) : null
      }
    )
    recorder.onError((e) => {
      live.status = `recorder error: ${e.message}`
    })
    await recorder.start()
    setRunning(true)
  }

  const rows: [string, string][] = [
    ['status', stats.status],
    ['permission', permission],
    ['string', stats.stringName ?? '—'],
    ['frequency', stats.hz ? `${stats.hz.toFixed(2)} Hz` : '—'],
    ['raw cents', stats.rawCents !== null ? stats.rawCents.toFixed(1) : '—'],
    ['smoothed cents', stats.smoothedCents !== null ? stats.smoothedCents.toFixed(1) : '—'],
    ['clarity', stats.clarity !== null ? stats.clarity.toFixed(3) : '—'],
    ['jitter std (last ~1s)', stats.jitterStd !== null ? `${stats.jitterStd.toFixed(2)} c` : '—'],
    [
      'callback cadence',
      stats.callbackAvgMs !== null
        ? `${stats.callbackAvgMs.toFixed(1)} ms avg / ${stats.callbackMaxMs.toFixed(0)} ms max`
        : '—',
    ],
    [
      'detect cost',
      stats.detectAvgMs !== null
        ? `${stats.detectAvgMs.toFixed(2)} ms avg / ${stats.detectMaxMs.toFixed(1)} ms max`
        : '—',
    ],
    ['callbacks / reads', `${stats.callbacks} / ${stats.reads}`],
    ['rms', stats.rms.toFixed(4)],
  ]

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.xxl,
        }}
      >
        <Text
          style={{
            fontSize: t.typography.largeTitle.fontSize,
            fontWeight: t.typography.largeTitle.fontWeight,
            color: t.colors.ink,
            paddingVertical: t.spacing.md,
          }}
        >
          Tuner spike harness
        </Text>
        <Text style={{ color: t.colors.sec, marginBottom: t.spacing.md }}>
          Dev-only pipeline probe: pluck each string (low E especially) and watch raw vs smoothed
          cents, jitter, callback cadence, and detect cost. Nothing here is recorded or saved.
        </Text>

        <Pressable
          onPress={running ? stopCapture : startCapture}
          style={{
            backgroundColor: t.colors.accent,
            borderRadius: t.radii.md,
            paddingVertical: t.spacing.md,
            alignItems: 'center',
            marginBottom: t.spacing.lg,
          }}
        >
          <Text style={{ color: t.colors.onAccent, fontWeight: '600' }}>
            {running ? 'Stop' : 'Start listening'}
          </Text>
        </Pressable>

        {rows.map(([label, value]) => (
          <View
            key={label}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: t.spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: t.colors.border,
            }}
          >
            <Text style={{ color: t.colors.sec }}>{label}</Text>
            <Text style={{ color: t.colors.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  )
}
