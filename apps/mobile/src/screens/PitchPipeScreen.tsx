import { useCallback, useState } from 'react'
import { Pressable, Switch, Text, View, useWindowDimensions } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
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
  label2,
  active,
  angleDeg,
  ringSize,
  onPressIn,
  onPressOut,
  t,
}: {
  label: string
  label2: string
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
      accessibilityLabel={label2}
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

// `embedded`: rendered inside the Utilities tab's tablet split (right pane) —
// hides the back link and swaps the bar's safe-area padding for regular
// spacing (see TunerScreen).
export default function PitchPipeScreen({ embedded }: { embedded?: boolean }) {
  const t = useTheme()
  const { t: tx } = useTranslation(['utilities', 'common', 'nav'])
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
  const octaveOffset = octave - DEFAULT_OCTAVE
  const octaveOffsetLabel = octaveOffset === 0 ? '0' : octaveOffset > 0 ? `+${octaveOffset}` : `${octaveOffset}`
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
        {/* The pipe: 12 chromatic notes on a ring, C at the top — vertically
            centered in the space above the octave/hold controls. */}
        <View style={{ flex: 1, justifyContent: 'center' }}>
        <View style={{ width: ringSize, height: ringSize }}>
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
          {/* Center readout: a dash when silent, the sounding note otherwise. */}
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
            }}
          >
            <Text
              style={{
                fontSize: 52,
                fontWeight: '700',
                letterSpacing: -1,
                color: activeNote ? t.colors.accent : t.colors.muted,
                fontVariant: ['tabular-nums'],
              }}
            >
              {activeLabel ? `${activeLabel}${activeNote!.octave}` : '–'}
            </Text>
          </View>
          {CHROMATIC_NOTES.map((label, i) => (
            <NoteButton
              key={label}
              label={label}
              label2={tx('pitchPipe.note', { label })}
              active={activeNote?.noteIndex === i}
              angleDeg={i * 30}
              ringSize={ringSize}
              onPressIn={() => onNoteIn(i)}
              onPressOut={onNoteOut}
              t={t}
            />
          ))}
        </View>
        </View>

        {/* Octave ± (C2–B6, shown as an offset from the middle-C octave) */}
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
            accessibilityLabel={tx('pitchPipe.octaveDown')}
            style={(s) => [octaveButtonStyle(s), octave <= MIN_OCTAVE && { opacity: 0.4 }]}
          >
            <SymbolIcon name="minus" size={18} color={t.colors.accent} weight="semibold" />
          </Pressable>
          <View style={{ alignItems: 'center', minWidth: 96 }}>
            <Text
              style={{
                fontSize: 28,
                fontWeight: '700',
                color: t.colors.ink,
                fontVariant: ['tabular-nums'],
              }}
            >
              {octaveOffsetLabel}
            </Text>
            <Text
              style={{
                fontSize: t.typography.overline.fontSize,
                fontWeight: t.typography.overline.fontWeight,
                letterSpacing: t.typography.overline.letterSpacing,
                color: t.colors.muted,
              }}
            >
              {tx('pitchPipe.octave')}
            </Text>
          </View>
          <Pressable
            onPress={() => shiftOctave(1)}
            disabled={octave >= MAX_OCTAVE}
            accessibilityRole="button"
            accessibilityLabel={tx('pitchPipe.octaveUp')}
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
            <Text style={{ fontSize: t.typography.body.fontSize, color: t.colors.ink }}>
              {tx('pitchPipe.holdNote')}
            </Text>
            <Switch
              value={hold}
              onValueChange={(on) => {
                setHold(on)
                if (!on) stop()
              }}
              trackColor={{ true: t.colors.accent }}
              accessibilityLabel={tx('pitchPipe.holdNote')}
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
          paddingTop: embedded ? t.spacing.sm : insets.top,
          paddingHorizontal: t.spacing.md,
          paddingBottom: t.spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {embedded ? (
          <View style={{ width: 70 }} />
        ) : (
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={tx('common:back')}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
          >
            <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
            <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent }}>{tx('nav:utilities')}</Text>
          </Pressable>
        )}
        <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.ink }}>{tx('pitchPipe.title')}</Text>
        <View style={{ width: 70 }} />
      </GlassSurface>
    </Screen>
  )
}
