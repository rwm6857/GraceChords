import { useCallback, useRef, useState } from 'react'
import { Pressable, Switch, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import Button from '../components/Button'
import Card from '../components/Card'
import Chip from '../components/Chip'
import GlassSurface from '../components/GlassSurface'
import Screen from '../components/Screen'
import SymbolIcon from '../components/SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'
import type { Tokens } from '@gracechords/tokens/native'
import { createTapTempo } from '../lib/tapTempo'
import { beatEmphasis, beatsInMeasure, TIME_SIGNATURES } from '../lib/metronome/pattern'
import { useMetronome } from '../lib/metronome/useMetronome'

// Tap Tempo + Metronome (Utilities) — one tool: the tap pad sets the
// metronome's tempo directly. Clicks are scheduled on the audio clock in
// src/lib/metronome/useMetronome (drift-free); this screen is layout, the
// beat indicator, and the tempo controls.

/** ± stepper that repeats while held (400 ms delay, then ~14 steps/s). */
function StepButton({
  icon,
  onStep,
  label,
  t,
}: {
  icon: Parameters<typeof SymbolIcon>[0]['name']
  onStep: () => void
  label: string
  t: Tokens
}) {
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancel = () => {
    if (delayRef.current) clearTimeout(delayRef.current)
    if (repeatRef.current) clearInterval(repeatRef.current)
    delayRef.current = null
    repeatRef.current = null
  }
  return (
    <Pressable
      onPressIn={() => {
        onStep()
        delayRef.current = setTimeout(() => {
          repeatRef.current = setInterval(onStep, 70)
        }, 400)
      }}
      onPressOut={cancel}
      onTouchCancel={cancel}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 56,
        height: 56,
        borderRadius: t.radii.pill,
        backgroundColor: t.colors.surfaceAlt,
        borderWidth: 1,
        borderColor: t.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <SymbolIcon name={icon} size={22} color={t.colors.accent} weight="semibold" />
    </Pressable>
  )
}

// `embedded`: rendered inside the Utilities tab's tablet split (right pane) —
// hides the back link and swaps the bar's safe-area padding for regular
// spacing (see TunerScreen).
export default function MetronomeScreen({ embedded }: { embedded?: boolean }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [barH, setBarH] = useState(0)

  const metronome = useMetronome(100)
  const {
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
  } = metronome

  // Silence the clicks whenever the screen loses focus (back, app switch).
  useFocusEffect(useCallback(() => stop, [stop]))

  const tapperRef = useRef(createTapTempo())
  const onTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    const tapped = tapperRef.current.tap(Date.now())
    if (tapped != null) setBpm(tapped)
  }

  const beats = beatsInMeasure(signature)

  return (
    <Screen edges={['left', 'right']}>
      <View
        style={{
          flex: 1,
          paddingTop: barH + t.spacing.lg,
          paddingHorizontal: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.xl,
        }}
      >
        {/* Beat indicator — the sounding beat within the measure. */}
        <View
          accessibilityLabel={
            currentBeat === null ? 'Metronome stopped' : `Beat ${currentBeat + 1} of ${beats}`
          }
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: t.spacing.md,
            height: 28,
          }}
        >
          {Array.from({ length: beats }, (_, i) => {
            const emphasis = beatEmphasis(signature, i, accentEnabled)
            const active = running && currentBeat === i
            const size = emphasis === 'primary' ? 18 : emphasis === 'secondary' ? 14 : 11
            return (
              <View
                key={i}
                style={{
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: active
                    ? emphasis === 'normal'
                      ? t.colors.ink
                      : t.colors.accent
                    : t.colors.off,
                }}
              />
            )
          })}
        </View>

        {/* BPM readout + steppers */}
        <View
          style={{
            marginTop: t.spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: t.spacing.xl,
          }}
        >
          <StepButton icon="minus" label="Slower" onStep={() => stepBpm(-1)} t={t} />
          <View style={{ alignItems: 'center', minWidth: 140 }}>
            <Text
              style={{
                fontSize: 76,
                fontWeight: '700',
                letterSpacing: -2,
                color: t.colors.ink,
                fontVariant: ['tabular-nums'],
              }}
            >
              {bpm}
            </Text>
            <Text
              style={{
                marginTop: -6,
                fontSize: t.typography.overline.fontSize,
                fontWeight: t.typography.overline.fontWeight,
                letterSpacing: t.typography.overline.letterSpacing,
                color: t.colors.muted,
              }}
            >
              BPM
            </Text>
          </View>
          <StepButton icon="plus" label="Faster" onStep={() => stepBpm(1)} t={t} />
        </View>

        {/* Tap tempo — a large, forgiving pad; tapping sets the tempo above. */}
        <Pressable
          onPressIn={onTap}
          accessibilityRole="button"
          accessibilityLabel="Tap tempo"
          accessibilityHint="Tap along to the song to set the metronome tempo"
          style={({ pressed }) => ({
            marginTop: t.spacing.xl,
            flexGrow: 1,
            minHeight: 132,
            borderRadius: t.radii.card,
            backgroundColor: pressed ? t.colors.accentSoft : t.colors.surface,
            borderWidth: 1,
            borderColor: pressed ? t.colors.accent : t.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            gap: t.spacing.sm,
          })}
        >
          <SymbolIcon name="hand.tap" size={30} color={t.colors.accent} />
          <Text style={{ fontSize: 17, fontWeight: '600', color: t.colors.ink }}>Tap tempo</Text>
        </Pressable>

        {/* Time signature */}
        <View
          style={{
            marginTop: t.spacing.xl,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: t.spacing.sm,
          }}
        >
          {TIME_SIGNATURES.map((sig) => (
            <Chip
              key={sig.id}
              label={sig.id}
              selected={signature === sig.id}
              onPress={() => setSignature(sig.id)}
            />
          ))}
        </View>

        {/* Downbeat accent */}
        <Card style={{ marginTop: t.spacing.lg }}>
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
              Accent downbeat
            </Text>
            <Switch
              value={accentEnabled}
              onValueChange={setAccentEnabled}
              trackColor={{ true: t.colors.accent }}
              accessibilityLabel="Accent downbeat"
            />
          </View>
        </Card>

        <View style={{ flex: 1 }} />

        <Button
          title={running ? 'Stop' : 'Start'}
          variant={running ? 'secondary' : 'primary'}
          onPress={() => (running ? stop() : void start())}
        />
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
            accessibilityLabel="Back"
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
          >
            <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
            <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent }}>Utilities</Text>
          </Pressable>
        )}
        <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.ink }}>Metronome</Text>
        <View style={{ width: 70 }} />
      </GlassSurface>
    </Screen>
  )
}
