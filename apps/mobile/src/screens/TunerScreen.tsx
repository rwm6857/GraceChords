import { useCallback, useState } from 'react'
import { Linking, Pressable, Text, View, useWindowDimensions } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import Screen from '../components/Screen'
import Button from '../components/Button'
import GlassSurface from '../components/GlassSurface'
import SymbolIcon from '../components/SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'
import type { Tokens } from '@gracechords/tokens/native'
import { STANDARD_TUNING, type TunerString } from '../lib/tuner/notes'
import { useTuner, type TunerFrame, type TunerReading } from '../lib/tuner/useTuner'

// The guitar tuner (Utilities → Tuner). Auto-detects the nearest
// standard-tuning string; tapping a string in the row locks detection to it
// (tap again to release). The needle is driven at full pipeline rate (~47/s)
// through a Reanimated shared value — no React re-render per frame; text
// updates are throttled in useTuner. See src/lib/tuner/ for the detection
// core and spike/tuner/RESULTS.md for the parameter provenance.

const METER_RANGE_CENTS = 50
const METER_SWEEP_DEG = 45 // needle angle at full scale (±)

function MeterTicks({ radius, t }: { radius: number; t: Tokens }) {
  const ticks = []
  for (let cents = -METER_RANGE_CENTS; cents <= METER_RANGE_CENTS; cents += 10) {
    const major = cents === 0 || Math.abs(cents) === METER_RANGE_CENTS
    ticks.push(
      <View
        key={cents}
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 0,
          marginLeft: -1,
          width: 2,
          height: radius,
          transformOrigin: 'bottom center',
          transform: [{ rotate: `${(cents / METER_RANGE_CENTS) * METER_SWEEP_DEG}deg` }],
        }}
      >
        <View
          style={{
            width: 2,
            height: major ? 18 : 10,
            borderRadius: 1,
            backgroundColor: cents === 0 ? t.colors.accent : t.colors.off,
          }}
        />
      </View>
    )
  }
  return <>{ticks}</>
}

function holdColor(reading: TunerReading | null, t: Tokens): string {
  if (!reading) return t.colors.muted
  if (reading.hold === 'inTune') return t.colors.success
  if (reading.hold === 'settling') return t.colors.accent
  return t.colors.ink
}

function StringKey({
  string,
  state,
  onPress,
  t,
  label,
}: {
  string: TunerString
  state: 'idle' | 'active' | 'locked'
  onPress: () => void
  t: Tokens
  label: string
}) {
  const bg =
    state === 'locked' ? t.colors.accent : state === 'active' ? t.colors.accentSoft : t.colors.surfaceAlt
  const fg = state === 'locked' ? t.colors.onAccent : state === 'active' ? t.colors.textAccent : t.colors.ink
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: state === 'locked' }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        paddingVertical: t.spacing.md,
        borderRadius: t.radii.md,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: state === 'idle' ? t.colors.border : 'transparent',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontSize: 24, fontWeight: '700', color: fg }}>{string.label}</Text>
    </Pressable>
  )
}

// `embedded`: rendered inside the Utilities tab's tablet split (right pane)
// instead of as a pushed route — hides the back link and swaps the bar's
// safe-area padding for regular spacing (the pane already sits below the
// tab's top inset).
export default function TunerScreen({ embedded }: { embedded?: boolean }) {
  const t = useTheme()
  const { t: tx } = useTranslation(['utilities', 'common', 'nav'])
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [barH, setBarH] = useState(0)

  const needleCents = useSharedValue(0)
  const needleActive = useSharedValue(0)

  const onFrame = useCallback(
    (frame: TunerFrame) => {
      if (frame.reading) {
        const clamped = Math.max(
          -METER_RANGE_CENTS,
          Math.min(METER_RANGE_CENTS, frame.reading.cents)
        )
        // ~10% longer glide than the original 80 ms for a smoother needle.
        needleCents.value = withTiming(clamped, { duration: 88, easing: Easing.linear })
        needleActive.value = withTiming(1, { duration: 120 })
      } else {
        needleCents.value = withTiming(0, { duration: 250 })
        needleActive.value = withTiming(0, { duration: 250 })
      }
    },
    [needleCents, needleActive]
  )

  const tuner = useTuner({ onFrame })
  const { permission, running, start, stop, lockedString, setLockedString, reading } = tuner

  useFocusEffect(
    useCallback(() => {
      // Ask-on-first-use lives here: opening the tuner is the first use.
      // start() requests permission and no-ops unless it's granted.
      void start()
      return stop
    }, [start, stop])
  )

  const meterWidth = Math.min(width - t.spacing.lg * 2, 420)
  const radius = meterWidth * 0.44

  const needleStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + 0.65 * needleActive.value,
    transform: [{ rotate: `${(needleCents.value / METER_RANGE_CENTS) * METER_SWEEP_DEG}deg` }],
  }))

  const stateColor = holdColor(reading, t)
  const inTune = reading?.hold === 'inTune'
  const centsText = !reading
    ? '—'
    : inTune
      ? tx('tuner.inTune')
      : tx('tuner.cents', { sign: reading.cents > 0 ? '+' : '−', cents: Math.abs(reading.cents).toFixed(0) })

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
        {permission === 'denied' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing.lg }}>
            <SymbolIcon name="mic.slash" size={40} color={t.colors.muted} />
            <Text
              style={{
                fontSize: t.typography.body.fontSize,
                color: t.colors.sec,
                textAlign: 'center',
                maxWidth: 300,
              }}
            >
              {tx('tuner.permissionDenied')}
            </Text>
            <Button
              title={tx('tuner.enableInSettings')}
              fullWidth={false}
              style={{ alignSelf: 'center' }}
              onPress={() => Linking.openSettings()}
            />
          </View>
        ) : (
          <>
            {/* Balances the spacer below the readout so the meter + note block
                sits vertically centered above the string row. */}
            <View style={{ flex: 1 }} />
            {/* Meter */}
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: meterWidth, height: radius + 24, alignItems: 'center' }}>
                <View style={{ position: 'absolute', bottom: 0, width: meterWidth, height: radius }}>
                  <MeterTicks radius={radius} t={t} />
                  <Animated.View
                    style={[
                      {
                        position: 'absolute',
                        left: '50%',
                        bottom: 0,
                        marginLeft: -1.5,
                        width: 3,
                        height: radius - 26,
                        borderRadius: 1.5,
                        backgroundColor: stateColor,
                        transformOrigin: 'bottom center',
                      },
                      needleStyle,
                    ]}
                  />
                  {/* Pivot */}
                  <View
                    style={{
                      position: 'absolute',
                      left: '50%',
                      bottom: -7,
                      marginLeft: -7,
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: stateColor,
                    }}
                  />
                </View>
                <Text
                  style={{
                    position: 'absolute',
                    left: 0,
                    bottom: 0,
                    fontSize: 20,
                    color: t.colors.muted,
                  }}
                >
                  ♭
                </Text>
                <Text
                  style={{
                    position: 'absolute',
                    right: 0,
                    bottom: 0,
                    fontSize: 20,
                    color: t.colors.muted,
                  }}
                >
                  ♯
                </Text>
              </View>
            </View>

            {/* Note + numbers */}
            <View style={{ alignItems: 'center', marginTop: t.spacing.xl, gap: t.spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Text
                  style={{
                    fontSize: 84,
                    fontWeight: '700',
                    letterSpacing: -2,
                    color: stateColor,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {reading ? reading.string.label : '–'}
                </Text>
                <Text style={{ fontSize: 28, fontWeight: '600', color: t.colors.muted }}>
                  {reading ? reading.string.name.slice(-1) : ''}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '600',
                  color: inTune ? t.colors.success : t.colors.ink,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {centsText}
              </Text>
              <Text
                style={{
                  fontSize: t.typography.rowSubtitle.fontSize,
                  color: t.colors.sec,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {reading ? tx('tuner.hz', { freq: reading.frequency.toFixed(1) }) : running ? tx('tuner.playAString') : ' '}
              </Text>
            </View>

            <View style={{ flex: 1 }} />

            {/* String row + mode caption */}
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              {STANDARD_TUNING.map((s) => {
                const state =
                  lockedString?.name === s.name
                    ? 'locked'
                    : !lockedString && reading?.string.name === s.name
                      ? 'active'
                      : 'idle'
                return (
                  <StringKey
                    key={s.name}
                    string={s}
                    state={state}
                    onPress={() => setLockedString(lockedString?.name === s.name ? null : s)}
                    t={t}
                    label={state === 'locked' ? tx('tuner.stringLocked', { name: s.name }) : tx('tuner.stringAuto', { name: s.name })}
                  />
                )
              })}
            </View>
            <Text
              style={{
                marginTop: t.spacing.md,
                textAlign: 'center',
                fontSize: t.typography.rowMeta.fontSize,
                color: t.colors.muted,
              }}
            >
              {lockedString ? tx('tuner.autoModeOff') : tx('tuner.autoModeOn')}
            </Text>
          </>
        )}
      </View>

      {/* Scroll-behind top bar, same pattern as Settings/About. */}
      <GlassSurface
        fallbackColor={t.colors.bg}
        fallbackHairline
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
        <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.ink }}>{tx('tuner.title')}</Text>
        <View style={{ width: 70 }} />
      </GlassSurface>
    </Screen>
  )
}
