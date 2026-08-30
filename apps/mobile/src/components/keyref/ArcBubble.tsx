import { Pressable, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { useTheme } from '../../theme/ThemeProvider'
import { bubbleOpacity, type ArcRing } from '../../lib/keyref/arcGeometry'
import { DETENT_DEG, wrapDegrees } from '../../lib/keyref/keyWheel'

// One position on the arc: a chord name over its Nashville number.
//
// The arc shows BOTH regardless of the sequence row's letters/numbers toggle —
// showing the mapping is the whole teaching value of the thing, so the toggle
// deliberately does not reach it.
//
// A faded neighbour is the SAME bubble: same radius, same diameter, same stroke
// weight. Only its opacity differs, and it carries no number, because the chord
// a fifth above V is a secondary dominant rather than the diatonic 2 — labelling
// it "2" would teach the wrong chord. What makes it read as part of the ring
// rather than as a leftover chip is the stroked arc it now sits on.
//
// Position is a transform rather than animated left/top so the rotation stays on
// the compositor. The bubble is parked at the circle center and pushed out along
// its own radius.
//
// Its angle comes ENTIRELY from the shared rotation: `baseAngle` is the bubble's
// fixed place on the wheel and `rotation` accumulates without ever being reset,
// so nothing here depends on the current key. That is deliberate — deriving the
// angle from the key instead would mean the key and the rotation had to change
// in the same frame, and either one landing first would jump the whole arc. The
// inner ring is spaced wider than true geometry (see arcGeometry), so its angle
// is the outer angle scaled by the ratio of the two steps.

export type ArcBubbleState = 'idle' | 'ringed' | 'active'

export type ArcBubbleProps = {
  ring: ArcRing
  /**
   * The bubble's fixed angle on the wheel before any rotation, in outer-ring
   * degrees. Constant for the life of the bubble.
   */
  baseAngle: number
  /** Ratio of this ring's angular step to the outer ring's. 1 for majors. */
  stepRatio: number
  radius: number
  size: number
  centerX: number
  centerY: number
  rotation: SharedValue<number>
  /** Chord name, spelled for the current key. */
  name: string
  /** Nashville number, or null for the faded neighbours (which are keys, not degrees). */
  number: string | null
  state: ArcBubbleState
  /**
   * The position is occupied by a chord that is NOT what the key's scale gives
   * here — a `2maj` where the 2 is normally minor. Such a bubble never takes the
   * solid accent fill a diatonic highlight gets: it stays outlined, and its own
   * labels carry the altered spelling, so the diatonic chord is never shown lit
   * up in place of the chord that is actually being played.
   */
  altered?: boolean
  onPress?: () => void
  accessibilityLabel: string
  /** Off-arc bubbles are inert and invisible to assistive tech. */
  reachable: boolean
}

export default function ArcBubble({
  ring,
  baseAngle,
  stepRatio,
  radius,
  size,
  centerX,
  centerY,
  rotation,
  name,
  number,
  state,
  altered = false,
  onPress,
  accessibilityLabel,
  reachable,
}: ArcBubbleProps) {
  const t = useTheme()

  const animated = useAnimatedStyle(() => {
    // Wrapping means a bubble on the far side of the circle is drawn on
    // whichever edge it is nearest, where it is fully transparent anyway.
    const outer = wrapDegrees(baseAngle + rotation.value)
    const angle = ((outer * stepRatio) * Math.PI) / 180
    return {
      opacity: bubbleOpacity(ring, outer / DETENT_DEG),
      transform: [
        { translateX: radius * Math.sin(angle) },
        { translateY: -radius * Math.cos(angle) },
      ],
    }
  })

  const solid = state === 'active' && !altered
  const outlined = state === 'active' || state === 'ringed'
  const border = solid ? 2 : altered && state === 'active' ? 3 : outlined ? 2 : 1

  const fill = solid
    ? t.colors.accent
    : altered && outlined
      ? t.colors.accentSoft
      : t.colors.surface
  const borderColor = outlined ? t.colors.accent : t.colors.border
  // White on Signal Blue is only ever semibold or heavier, per the brand rule.
  const nameColor = solid ? t.colors.onAccent : altered && outlined ? t.colors.textAccent : t.colors.ink
  const numberColor = solid
    ? t.colors.onAccent
    : altered && outlined
      ? t.colors.textAccent
      : outlined
        ? t.colors.textAccent
        : t.colors.sec

  const body = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: fill,
        borderWidth: border,
        borderColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontSize: ring === 'major' ? 17 : 15,
          fontWeight: '700',
          letterSpacing: -0.3,
          color: nameColor,
        }}
      >
        {name}
      </Text>
      {number ? (
        <Text
          numberOfLines={1}
          style={{
            marginTop: 1,
            fontSize: ring === 'major' ? 12 : 11,
            fontWeight: solid ? '700' : '600',
            letterSpacing: 0.2,
            color: numberColor,
          }}
        >
          {number}
        </Text>
      ) : null}
    </View>
  )

  return (
    <Animated.View
      pointerEvents={reachable ? 'box-none' : 'none'}
      accessibilityElementsHidden={!reachable}
      importantForAccessibility={reachable ? 'auto' : 'no-hide-descendants'}
      style={[
        {
          position: 'absolute',
          left: centerX - size / 2,
          top: centerY - size / 2,
          width: size,
          height: size,
        },
        animated,
      ]}
    >
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          {body}
        </Pressable>
      ) : (
        <View accessible accessibilityRole="text" accessibilityLabel={accessibilityLabel}>
          {body}
        </View>
      )}
    </Animated.View>
  )
}
