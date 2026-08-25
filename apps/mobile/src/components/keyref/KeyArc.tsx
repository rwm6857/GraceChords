import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Platform, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import ArcBubble, { type ArcBubbleState } from './ArcBubble'
import { useAccessibilityFlags } from '../../lib/accessibilityFlags'
import { arcLayout, type ArcVariant } from '../../lib/keyref/arcGeometry'
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
} from '../../lib/keyref/keyWheel'
import { createWheelHaptics } from '../../lib/keyref/wheelHaptics'
import { arcPositionLabels } from '../../lib/keyref/render'
import type { ProgressionChord } from '../../lib/keyref/types'

// The cropped circle-of-fifths arc: majors on the outer ring, their relative
// minors nested beneath them, and the lone vii° on a third ring between the two
// flanking minors. The circle's center sits below everything drawn, so it reads
// as a rainbow rather than as a slice of a wheel.
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

const ROTATE_MS = 260
const EASE_OUT = Easing.out(Easing.cubic)
/** Degrees of travel over which the stationary vii° fades out of a turning arc. */
const DIM_FADE_DEG = 8

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

export default function KeyArc({
  variant,
  tonicKey,
  onKeyChange,
  annotation = EMPTY_ANNOTATION,
  labels,
}: KeyArcProps) {
  const { reduceMotion } = useAccessibilityFlags()
  const layout = useMemo(() => arcLayout(variant), [variant])
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
  /** 0 while a drag is ignored (it began too near the center to track). */
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
          // Angle tracking is unstable near the center, so a drag starting there
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

  const dimPositionKey = positionKey('dim', 0)
  const dimLabels = arcPositionLabels(tonicKey, 'dim', 0, annotation.altered.get(dimPositionKey))
  // The vii° does not travel with the wheel — its root is five fifths away, not
  // adjacent — so rather than leave one stationary bubble in a turning field it
  // fades out for the duration of the drag and returns with the new key.
  const dimStyle = useAnimatedStyle(() => {
    const detents = Math.round(rotation.value / DETENT_DEG)
    const drift = Math.abs(rotation.value - detents * DETENT_DEG)
    return { opacity: Math.max(0, 1 - drift / DIM_FADE_DEG) }
  })

  const bubbleState = (key: string): ArcBubbleState =>
    annotation.active === key ? 'active' : annotation.ringed.has(key) ? 'ringed' : 'idle'

  const renderRing = (ring: 'major' | 'minor') =>
    WHEEL_SLOTS.map((slot) => {
      const offset = slotOffset(slot, tonicSlot)
      const key = positionKey(ring, offset)
      const altered = annotation.altered.get(key)
      const { name, number } = arcPositionLabels(tonicKey, ring, offset, altered)
      const isEdge = ring === 'major' && Math.abs(offset) === variant.fadedFrom
      const reachable = Math.abs(offset) <= (ring === 'major' ? variant.fadedFrom : 1)
      return (
        <ArcBubble
          key={`${ring}-${slot}`}
          ring={ring}
          baseAngle={slotOffset(slot, baseSlot) * variant.majorStep}
          stepRatio={ring === 'major' ? 1 : variant.minorStep / variant.majorStep}
          radius={ring === 'major' ? variant.outerRadius : variant.innerRadius}
          size={ring === 'major' ? variant.majorSize : variant.minorSize}
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

  return (
    <GestureDetector gesture={pan}>
      <View
        style={{
          width: layout.width,
          height: layout.height,
          alignSelf: 'center',
          // Anything the drag carries past the edge is clipped rather than
          // spilling into the rows above.
          overflow: 'hidden',
        }}
      >
        {renderRing('major')}
        {renderRing('minor')}

        <Animated.View
          pointerEvents="box-none"
          style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }, dimStyle]}
        >
          <ArcBubble
            ring="dim"
            baseAngle={0}
            stepRatio={0}
            radius={variant.dimRadius}
            size={variant.dimSize}
            centerX={layout.centerX}
            centerY={layout.centerY}
            rotation={rotation}
            name={dimLabels.name}
            number={dimLabels.number}
            state={bubbleState(dimPositionKey)}
            altered={annotation.altered.has(dimPositionKey)}
            reachable
            accessibilityLabel={labels.position(dimLabels.name, dimLabels.number)}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  )
}
