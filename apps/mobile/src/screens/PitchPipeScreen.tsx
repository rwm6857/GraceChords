import { useCallback, useState } from 'react'
import { Pressable, Switch, Text, View, useWindowDimensions } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Card from '../components/Card'
import GlassSurface from '../components/GlassSurface'
import Screen from '../components/Screen'
import SymbolIcon from '../components/SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'
import type { Tokens } from '@gracechords/tokens/native'
import {
  CHROMATIC_NOTES,
  DEFAULT_OCTAVE,
  MAX_OCTAVE,
  MIN_OCTAVE,
  clampOctave,
  noteFrequency,
} from '../lib/pitchpipe/notes'
import { usePitchPipe } from '../lib/pitchpipe/usePitchPipe'

// Pitch Pipe (Utilities) — a circular ring of the 12 chromatic notes; tapping
// a note sounds a clean sine at its equal-temperament frequency (A4 = 440,
// src/lib/pitchpipe/notes.ts). Hold off: the note sounds while pressed. Hold
// on: a tap sustains the note until it's tapped again, another note is tapped
// (last note wins), or the screen loses focus. Octave ± shifts the whole ring
// across C3–B5 (three octaves around middle C), retuning a sustaining note in
// place.

const NOTE_BUTTON = 56

function NoteButton({
  label,
  active,
  angleDeg,
  ringSize,
  onPressIn,
  onPressOut,
  t,
}: {
  label: string
  active: boolean
  angleDeg: number
  ringSize: number
  onPressIn: () => void
  onPressOut: () => void
  t: Tokens
}) {
  const radius = ringSize / 2 - NOTE_BUTTON / 2
  const rad = (angleDeg * Math.PI) / 180
  const left = ringSize / 2 + radius * Math.sin(rad) - NOTE_BUTTON / 2
  const top = ringSize / 2 - radius * Math.cos(rad) - NOTE_BUTTON / 2
  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`Note ${label}`}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        position: 'absolute',
        left,
        top,
        width: NOTE_BUTTON,
        height: NOTE_BUTTON,
        borderRadius: NOTE_BUTTON / 2,
        backgroundColor: active ? t.colors.accent : t.colors.surface,
        borderWidth: 1,
        borderColor: active ? t.colors.accent : t.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed && !active ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 17,
          fontWeight: '700',
          color: active ? t.colors.onAccent : t.colors.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

export default function PitchPipeScreen() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [barH, setBarH] = useState(0)

  const [octave, setOctave] = useState(DEFAULT_OCTAVE)
  const [hold, setHold] = useState(false)
  const { activeNote, play, stop, retune } = usePitchPipe()

  // Silence the pipe whenever the screen loses focus (back, app switch).
  useFocusEffect(useCallback(() => stop, [stop]))

  const onNoteIn = (noteIndex: number) => {
    if (hold && activeNote?.noteIndex === noteIndex && activeNote.octave === octave) {
      stop()
      return
    }
    play(noteIndex, octave)
  }
  const onNoteOut = () => {
    if (!hold) stop()
  }

  const shiftOctave = (dir: 1 | -1) => {
    const next = clampOctave(octave + dir)
    setOctave(next)
    // A sustaining note follows the ring's octave.
    if (activeNote && next !== octave) retune(activeNote.noteIndex, next)
  }

  const ringSize = Math.min(width - t.spacing.lg * 2, 340)
  const activeLabel = activeNote ? CHROMATIC_NOTES[activeNote.noteIndex] : null
  const octaveButtonStyle = ({ pressed }: { pressed: boolean }) => ({
    width: 44,
    height: 44,
    borderRadius: t.radii.pill,
    backgroundColor: t.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    opacity: pressed ? 0.7 : 1,
  })

  return (
    <Screen edges={['left', 'right']}>
      <View
        style={{
          flex: 1,
          paddingTop: barH + t.spacing.lg,
          paddingHorizontal: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.xl,
          alignItems: 'center',
        }}
      >
        {/* The pipe: 12 chromatic notes on a ring, C at the top. */}
        <View style={{ width: ringSize, height: ringSize, marginTop: t.spacing.md }}>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: NOTE_BUTTON / 2 - 6,
              top: NOTE_BUTTON / 2 - 6,
              right: NOTE_BUTTON / 2 - 6,
              bottom: NOTE_BUTTON / 2 - 6,
              borderRadius: ringSize / 2,
              borderWidth: 1,
              borderColor: t.colors.border,
            }}
          />
          {/* Center readout */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            <Text
              style={{
                fontSize: 44,
                fontWeight: '700',
                letterSpacing: -1,
                color: activeNote ? t.colors.accent : t.colors.muted,
                fontVariant: ['tabular-nums'],
              }}
            >
              {activeLabel ? `${activeLabel}${activeNote!.octave}` : `C${octave}–B${octave}`}
            </Text>
            <Text
              style={{
                fontSize: t.typography.rowSubtitle.fontSize,
                color: t.colors.sec,
                fontVariant: ['tabular-nums'],
              }}
            >
              {activeNote
                ? `${noteFrequency(activeNote.noteIndex, activeNote.octave).toFixed(1)} Hz`
                : hold
                  ? 'Tap a note to sustain it'
                  : 'Hold a note to sound it'}
            </Text>
          </View>
          {CHROMATIC_NOTES.map((label, i) => (
            <NoteButton
              key={label}
              label={label}
              active={activeNote?.noteIndex === i}
              angleDeg={i * 30}
              ringSize={ringSize}
              onPressIn={() => onNoteIn(i)}
              onPressOut={onNoteOut}
              t={t}
            />
          ))}
        </View>

        <View style={{ flex: 1 }} />

        {/* Octave ± (C3–B5, vocal-centered around middle C) */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: t.spacing.xl,
          }}
        >
          <Pressable
            onPress={() => shiftOctave(-1)}
            disabled={octave <= MIN_OCTAVE}
            accessibilityRole="button"
            accessibilityLabel="Octave down"
            style={(s) => [octaveButtonStyle(s), octave <= MIN_OCTAVE && { opacity: 0.4 }]}
          >
            <SymbolIcon name="minus" size={18} color={t.colors.accent} weight="semibold" />
          </Pressable>
          <View style={{ alignItems: 'center', minWidth: 96 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: t.colors.ink }}>
              Octave {octave}
            </Text>
            <Text style={{ fontSize: t.typography.rowMeta.fontSize, color: t.colors.muted }}>
              C{MIN_OCTAVE}–B{MAX_OCTAVE} range
            </Text>
          </View>
          <Pressable
            onPress={() => shiftOctave(1)}
            disabled={octave >= MAX_OCTAVE}
            accessibilityRole="button"
            accessibilityLabel="Octave up"
            style={(s) => [octaveButtonStyle(s), octave >= MAX_OCTAVE && { opacity: 0.4 }]}
          >
            <SymbolIcon name="plus" size={18} color={t.colors.accent} weight="semibold" />
          </Pressable>
        </View>

        {/* Hold toggle */}
        <Card style={{ marginTop: t.spacing.lg, alignSelf: 'stretch' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: t.spacing.lg,
              paddingVertical: t.spacing.sm,
            }}
          >
            <View style={{ flexShrink: 1, paddingRight: t.spacing.md }}>
              <Text style={{ fontSize: t.typography.body.fontSize, color: t.colors.ink }}>
                Hold
              </Text>
              <Text style={{ fontSize: t.typography.rowMeta.fontSize, color: t.colors.muted }}>
                {hold ? 'Notes sustain until tapped again' : 'Notes sound while pressed'}
              </Text>
            </View>
            <Switch
              value={hold}
              onValueChange={(on) => {
                setHold(on)
                if (!on) stop()
              }}
              trackColor={{ true: t.colors.accent }}
              accessibilityLabel="Hold notes"
            />
          </View>
        </Card>
      </View>

      {/* Scroll-behind top bar, same pattern as Tuner/Settings. */}
      <GlassSurface
        fallbackColor={t.colors.bg}
        onLayout={(e) => setBarH(e.nativeEvent.layout.height)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          paddingTop: insets.top,
          paddingHorizontal: t.spacing.md,
          paddingBottom: t.spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
        >
          <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
          <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent }}>Utilities</Text>
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.ink }}>Pitch Pipe</Text>
        <View style={{ width: 70 }} />
      </GlassSurface>
    </Screen>
  )
}
