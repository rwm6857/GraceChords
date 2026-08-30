import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import ArcBubble, { type ArcBubbleState } from './ArcBubble'
import { useTheme } from '../../theme/ThemeProvider'
import { useAccessibilityFlags } from '../../lib/accessibilityFlags'
import {
  arcLayout,
  type ArcLayout,
  type ArcRing,
  type ArcVariant,
} from '../../lib/keyref/arcGeometry'
import {
  DETENT_DEG,
  FIFTHS,
  MIN_DRAG_RADIUS,
  angleDelta,
  crossingIndex,
  keyAtOffset,
  keySlot,
  positionKey,
  rotationForKey,
  slotOffset,
  touchAngle,
  touchRadius,
  wrapDegrees,
} from '../../lib/keyref/keyWheel'
import { createWheelHaptics } from '../../lib/keyref/wheelHaptics'
import { arcPositionLabels } from '../../lib/keyref/render'
import type { ProgressionChord } from '../../lib/keyref/types'

// The cropped circle-of-fifths arc: IV I V on the outer ring, and beneath them
// ii vi iii vii° on the inner one — all seven diatonic chords, both rings at
// true 30° spacing, each minor exactly under its parent. The circle's centre
// sits below everything drawn, so it reads as a rainbow rather than as a slice
// of a wheel.
//
// TWO CONCENTRIC STROKES connect the positions, drawn as bordered circles wider
// than the frame and cropped by it. Without them the bubbles read as scattered
// chips; the strokes are what make the thing a wheel. They are hairlines in a
// muted token — connective tissue, not outline — and the bubbles render on top.
// There is no SVG in this project and none is needed: a View whose radius is half
// its size is a circle, which is exactly how PitchPipeScreen draws its ring.
//
// TWO WAYS TO TURN IT, and tap is the one that has to work:
//
//   • Tapping a faded edge neighbour advances one fifth in that direction. Every
//     position is a real element with a label, so the whole feature is operable
//     by tap alone under VoiceOver.
//   • Dragging turns the arc directly under the finger, with a detent every 30°.
//     There is NO velocity term anywhere in the release path — the arc stops
//     where the finger stopped and never flings.
//
// ROTATION IS THE ONLY SOURCE OF TRUTH FOR ANGLE. It accumulates and is never
// reset, and the key is derived from it rather than driving it. The alternative
// — placing bubbles relative to the current tonic — needs the key and the
// rotation to change in the same frame on every commit, and whichever landed
// first would jump the entire arc by 30°. Here a commit only changes LABELS.
//
// Those labels move one position along at each crossing, which is what the tick
// marks. At the circle's enharmonic seam the letter respells with the key —
// F#'s 5 is C#, and it becomes Db the moment Db becomes the tonic — the one
// place a chord name changes under you, and correct when it does.

/** The whole wheel is mounted; opacity hides whatever is off-arc. */
const WHEEL_SLOTS = FIFTHS.map((_, i) => i)
/** Detent ticks sit at the MIDPOINTS between slots, where no bubble covers them. */
const TICK_SLOTS = FIFTHS.map((_, i) => i)
const TICK_OPACITY = 0.5

const ROTATE_MS = 260
const EASE_OUT = Easing.out(Easing.cubic)

export type ArcAnnotation = {
  /** Positions used by the selected progression (positionKey of ring + offset). */
  ringed: Set<string>
  /** The position currently lit by the sequence walk. */
  active: string | null
  /** Non-diatonic chords by position — these never take the solid highlight. */
  altered: Map<string, ProgressionChord>
}

export const EMPTY_ANNOTATION: ArcAnnotation = {
  ringed: new Set(),
  active: null,
  altered: new Map(),
}

export type KeyArcProps = {
  /**
   * Geometry and interaction semantics are parameterized rather than hardcoded
   * so another layout is a different variant, not a rewrite. Only the phone
   * variant exists, and nothing here branches on size class.
   */
  variant: ArcVariant
  tonicKey: string
  onKeyChange: (key: string) => void
  annotation?: ArcAnnotation
  /** Injected so every accessibility string stays in the locale files. */
  labels: {
    position: (name: string, number: string | null) => string
    advance: (key: string) => string
  }
}

/**
 * One ring, stroked. A circle wider than the frame, cropped by it — so the outer
 * ring's ends leave through the bottom edge close to the corners on a
 * near-vertical tangent, which is what says "this circle continues".
 */
function RingStroke({
  radius,
  layout,
  stroke,
  color,
}: {
  radius: number
  layout: ArcLayout
  stroke: number
  color: string
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: layout.centerX - radius,
        top: layout.centerY - radius,
        width: radius * 2,
        height: radius * 2,
        borderRadius: radius,
        borderWidth: stroke,
        borderColor: color,
      }}
    />
  )
}

/**
 * The dial's face: the disc bounded by the outer ring, filled so the wheel
 * reads as an object rather than as bubbles floating on the page. Its edge
 * coincides with the outer stroke, so the outer bubbles straddle the rim like
 * beads, and the crop cuts the bottom off flat.
 */
function DialFace({ radius, layout, color }: { radius: number; layout: ArcLayout; color: string }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: layout.centerX - radius,
        top: layout.centerY - radius,
        width: radius * 2,
        height: radius * 2,
        borderRadius: radius,
        backgroundColor: color,
      }}
    />
  )
}

/**
 * The index that marks the key. It sits at the TOP OF THE DIAL, not on a bubble,
 * and does not rotate — bubbles travel through it, which is how a physical dial
 * says "whatever is here is the current value". That also keeps it out of the
 * accent's way: the accent means "in the selected progression" everywhere else
 * on this screen, so marking the tonic with it would give one colour two jobs.
 */
function TonicIndex({
  variant,
  layout,
  fill,
  stroke,
}: {
  variant: ArcVariant
  layout: ArcLayout
  fill: string
  stroke: string
}) {
  const size = variant.tonicHaloSize
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        left: layout.centerX - size / 2,
        top: layout.centerY - variant.outerRadius - size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: fill,
        borderWidth: 2,
        borderColor: stroke,
      }}
    />
  )
}

/**
 * A detent graduation. These sit between the bubbles rather than under them (a
 * 56pt bubble subtends 19° at this radius, so a midpoint tick clears its
 * neighbour by 5.5°) and they TRAVEL with the wheel, so a drag demonstrates that
 * the arc turns instead of a label having to say so.
 */
function DetentTick({
  index,
  variant,
  layout,
  rotation,
  color,
}: {
  index: number
  variant: ArcVariant
  layout: ArcLayout
  rotation: SharedValue<number>
  color: string
}) {
  const baseAngle = (index + 0.5) * DETENT_DEG

  const animated = useAnimatedStyle(() => {
    const angle = wrapDegrees(baseAngle + rotation.value)
    const theta = (angle * Math.PI) / 180
    const fade = (variant.tickSpan - Math.abs(angle)) / variant.tickFade
    return {
      opacity: Math.max(0, Math.min(1, fade)) * TICK_OPACITY,
      transform: [
        { translateX: variant.outerRadius * Math.sin(theta) },
        { translateY: -variant.outerRadius * Math.cos(theta) },
        { rotate: `${angle}deg` },
      ],
    }
  })

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          position: 'absolute',
          left: layout.centerX - variant.ringStroke / 2,
          top: layout.centerY - variant.tickLength / 2,
          width: variant.ringStroke,
          height: variant.tickLength,
          backgroundColor: color,
        },
        animated,
      ]}
    />
  )
}

export default function KeyArc({
  variant,
  tonicKey,
  onKeyChange,
  annotation = EMPTY_ANNOTATION,
  labels,
}: KeyArcProps) {
  const t = useTheme()
  const { reduceMotion } = useAccessibilityFlags()
  // Full-bleed, but MEASURED rather than read off the window: in landscape on a
  // notched phone the safe-area inset makes the available width narrower than the
  // window, and a window-width circle would then be centred off-centre and
  // overflow. The height does not depend on width, so the box can be laid out
  // before the first measurement lands.
  const [width, setWidth] = useState(0)
  const layout = useMemo(() => arcLayout(variant, width), [variant, width])
  const tonicSlot = keySlot(tonicKey)

  /** The slot the wheel's fixed angles are measured from. Set once. */
  const baseSlot = useRef(keySlot(tonicKey)).current
  /** The key this arc last asked for, so an outside change can be told apart. */
  const ownKey = useRef(tonicKey)

  /** Accumulated wheel travel in degrees, positive clockwise. Never reset. */
  const rotation = useSharedValue(0)
  /** Which detent boundary the wheel has passed, latched so ticks fire once each. */
  const crossed = useSharedValue(0)
  /** Finger angle at the previous frame, for incremental tracking. */
  const lastAngle = useSharedValue(0)
  /** 0 while a drag is ignored (it began too near the centre to track). */
  const tracking = useSharedValue(0)

  // A key set from outside the arc (never happens today — the screen only
  // echoes back what onKeyChange gave it) re-seats the wheel without animating.
  useEffect(() => {
    if (tonicKey === ownKey.current) return
    ownKey.current = tonicKey
    rotation.value = rotationForKey(baseSlot, tonicKey)
  }, [tonicKey, baseSlot, rotation])

  // Haptics are iOS-only by decision, not by omission: Android's rotational
  // motor produces a buzz rather than a tick, which would feel cheap, so the
  // Android wheel snaps visually and stays silent. There is no fallback.
  const haptics = useRef(createWheelHaptics(Date.now)).current
  const hapticsEnabled = Platform.OS === 'ios'

  const fireTick = useCallback(() => {
    if (!hapticsEnabled) return
    if (haptics.tick() === 'tick') Haptics.selectionAsync().catch(() => {})
  }, [haptics, hapticsEnabled])

  // Medium, never Heavy — Heavy reads as an error state. Suppressed when it
  // would land within 80ms of the last tick (two haptics that close together
  // read as a stutter), but a release that crossed nothing still locks.
  const fireLock = useCallback(() => {
    if (!hapticsEnabled) return
    if (haptics.lock() === 'lock') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    }
  }, [haptics, hapticsEnabled])

  const resetHaptics = useCallback(() => {
    haptics.reset()
  }, [haptics])

  /** Publish the key the wheel now points at. Labels only — nothing moves. */
  const publishKey = useCallback(
    (detents: number) => {
      const next = keyAtOffset(FIFTHS[baseSlot], -detents)
      if (next === ownKey.current) return
      ownKey.current = next
      onKeyChange(next)
    },
    [baseSlot, onKeyChange],
  )

  const settle = useCallback(
    (target: number) => {
      rotation.value = reduceMotion
        ? withTiming(target, { duration: 0 })
        : withTiming(target, { duration: ROTATE_MS, easing: EASE_OUT })
    },
    [rotation, reduceMotion],
  )

  /** Edge-neighbour tap: turn one fifth toward that side. */
  const advance = useCallback(
    (direction: number) => {
      const target = Math.round(rotation.value / DETENT_DEG) * DETENT_DEG - direction * DETENT_DEG
      publishKey(Math.round(target / DETENT_DEG))
      settle(target)
      if (hapticsEnabled) Haptics.selectionAsync().catch(() => {})
    },
    [rotation, publishKey, settle, hapticsEnabled],
  )

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Activate only once the finger has really moved, so bubble taps still
        // reach their Pressable.
        .activeOffsetX([-8, 8])
        .activeOffsetY([-8, 8])
        .onBegin((e) => {
          // Angle tracking is unstable near the centre, so a drag starting there
          // is ignored outright rather than amplified into a spin.
          tracking.value =
            touchRadius(e.x, e.y, layout.centerX, layout.centerY) >= MIN_DRAG_RADIUS ? 1 : 0
          lastAngle.value = touchAngle(e.x, e.y, layout.centerX, layout.centerY)
          crossed.value = crossingIndex(rotation.value)
          runOnJS(resetHaptics)()
        })
        .onUpdate((e) => {
          if (!tracking.value) return
          const angle = touchAngle(e.x, e.y, layout.centerX, layout.centerY)
          rotation.value += angleDelta(lastAngle.value, angle)
          lastAngle.value = angle

          const now = crossingIndex(rotation.value)
          if (now !== crossed.value) {
            crossed.value = now
            runOnJS(fireTick)()
            runOnJS(publishKey)(now)
          }
        })
        .onEnd(() => {
          if (!tracking.value) return
          // Snap from where the finger left it. No velocity is consulted, so
          // there is no momentum to carry the wheel past its detent.
          const detents = crossingIndex(rotation.value)
          runOnJS(publishKey)(detents)
          runOnJS(settle)(detents * DETENT_DEG)
          runOnJS(fireLock)()
        })
        .onFinalize((_e, success) => {
          if (!success && tracking.value) {
            const detents = crossingIndex(rotation.value)
            runOnJS(publishKey)(detents)
            runOnJS(settle)(detents * DETENT_DEG)
          }
          tracking.value = 0
        }),
    [
      layout,
      rotation,
      crossed,
      lastAngle,
      tracking,
      fireTick,
      fireLock,
      publishKey,
      settle,
      resetHaptics,
    ],
  )

  const bubbleState = (key: string): ArcBubbleState =>
    annotation.active === key ? 'active' : annotation.ringed.has(key) ? 'ringed' : 'idle'

  const renderRing = (ring: ArcRing) => {
    const isMajor = ring === 'major'
    return WHEEL_SLOTS.map((slot) => {
      const offset = slotOffset(slot, tonicSlot)
      const key = positionKey(ring, offset)
      const altered = annotation.altered.get(key)
      const { name, number } = arcPositionLabels(tonicKey, ring, offset, altered)
      const isEdge = isMajor && Math.abs(offset) === variant.fadedFrom
      // Reachability follows each ring's own visible span: the inner ring runs
      // one further right than the outer, because that is where the vii° lives.
      const reachable = isMajor
        ? Math.abs(offset) <= variant.fadedFrom
        : offset >= -1 && offset <= 2
      return (
        <ArcBubble
          key={`${ring}-${slot}`}
          ring={ring}
          baseAngle={slotOffset(slot, baseSlot) * variant.majorStep}
          stepRatio={(isMajor ? variant.majorStep : variant.minorStep) / variant.majorStep}
          radius={isMajor ? variant.outerRadius : variant.innerRadius}
          size={isMajor ? variant.majorSize : variant.minorSize}
          centerX={layout.centerX}
          centerY={layout.centerY}
          rotation={rotation}
          name={name}
          number={number}
          state={bubbleState(key)}
          altered={Boolean(altered)}
          reachable={reachable}
          onPress={isEdge ? () => advance(offset > 0 ? 1 : -1) : undefined}
          accessibilityLabel={isEdge ? labels.advance(name) : labels.position(name, number)}
        />
      )
    })
  }

  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{
          width: '100%',
          height: layout.height,
          // The strokes are wider than the frame; this is what crops them into
          // arcs rather than letting them curl back as full circles.
          overflow: 'hidden',
        }}
      >
        {width === 0 ? null : (
          <>
            <DialFace
              radius={variant.outerRadius}
              layout={layout}
              color={t.colors.surfaceAlt}
            />
            <TonicIndex
              variant={variant}
              layout={layout}
              fill={t.colors.spotlightSoft}
              stroke={t.colors.spotlight}
            />
            <RingStroke
              radius={variant.outerRadius}
              layout={layout}
              stroke={variant.ringStroke}
              color={t.colors.border}
            />
            <RingStroke
              radius={variant.innerRadius}
              layout={layout}
              stroke={variant.ringStroke}
              color={t.colors.border}
            />
            {TICK_SLOTS.map((index) => (
              <DetentTick
                key={`tick-${index}`}
                index={index}
                variant={variant}
                layout={layout}
                rotation={rotation}
                color={t.colors.muted}
              />
            ))}

            {renderRing('major')}
            {renderRing('minor')}
          </>
        )}
      </View>
    </GestureDetector>
  )
}
