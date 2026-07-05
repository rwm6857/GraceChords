// Audio glue for the pitch pipe — the only pitch-pipe module that imports
// react-native-audio-api. One oscillator voice at a time (last note wins):
// a clean sine with a short attack/release envelope so taps never click.
// Frequencies come from the pure equal-temperament math in ./notes.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioContext, AudioManager, type GainNode, type OscillatorNode } from 'react-native-audio-api'
import { noteFrequency } from './notes'

const ATTACK_S = 0.02
const RELEASE_S = 0.12
const LEVEL = 0.35

interface Voice {
  osc: OscillatorNode
  gain: GainNode
}

export interface ActiveNote {
  noteIndex: number
  octave: number
}

export interface PitchPipe {
  /** The sustaining note, or null while silent. */
  activeNote: ActiveNote | null
  /** Start sounding a note (stops any current one — last note wins). */
  play: (noteIndex: number, octave: number) => void
  /** Release the current note. */
  stop: () => void
  /** Retune the sustaining note in place (octave +/- while holding). */
  retune: (noteIndex: number, octave: number) => void
}

export function usePitchPipe(): PitchPipe {
  const [activeNote, setActiveNote] = useState<ActiveNote | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const voiceRef = useRef<Voice | null>(null)

  const releaseVoice = useCallback(() => {
    const ctx = ctxRef.current
    const voice = voiceRef.current
    voiceRef.current = null
    if (!ctx || !voice) return
    const now = ctx.currentTime
    voice.gain.gain.setValueAtTime(LEVEL, now)
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + RELEASE_S)
    voice.osc.stop(now + RELEASE_S + 0.02)
  }, [])

  // Note: stop() leaves the audio session active so the release tail isn't
  // clipped between momentary notes; the session is deactivated on unmount.
  const stop = useCallback(() => {
    releaseVoice()
    setActiveNote(null)
  }, [releaseVoice])

  const play = useCallback(
    (noteIndex: number, octave: number) => {
      AudioManager.setAudioSessionOptions({
        iosCategory: 'playback',
        iosMode: 'default',
        iosOptions: ['mixWithOthers'],
        iosAllowHaptics: true,
      })
      AudioManager.setAudioSessionActivity(true).catch(() => {})
      let ctx = ctxRef.current
      if (!ctx) {
        ctx = new AudioContext()
        ctxRef.current = ctx
      }
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
      releaseVoice()
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(noteFrequency(noteIndex, octave), now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(LEVEL, now + ATTACK_S)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      voiceRef.current = { osc, gain }
      setActiveNote({ noteIndex, octave })
    },
    [releaseVoice]
  )

  const retune = useCallback((noteIndex: number, octave: number) => {
    const ctx = ctxRef.current
    const voice = voiceRef.current
    if (!ctx || !voice) return
    voice.osc.frequency.setValueAtTime(noteFrequency(noteIndex, octave), ctx.currentTime)
    setActiveNote({ noteIndex, octave })
  }, [])

  useEffect(
    () => () => {
      releaseVoice()
      AudioManager.setAudioSessionActivity(false).catch(() => {})
      ctxRef.current?.close().catch(() => {})
      ctxRef.current = null
    },
    [releaseVoice]
  )

  return { activeNote, play, stop, retune }
}
