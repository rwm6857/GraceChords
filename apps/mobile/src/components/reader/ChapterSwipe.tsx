import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import SymbolIcon from '../SymbolIcon'
import { useTheme } from '../../theme/ThemeProvider'
import { useAccessibilityFlags } from '../../lib/accessibilityFlags'
import {
  dragTravel,
  isForwardDrag,
  shouldCommitSwipe,
  swipeProgress,
  swipeThreshold,
} from '../../lib/readerSwipe'

// Swipe-to-change-chapter for the Daily Word reader, modelled on the Bible-app
// interaction the design brief points at:
//
//   • The page TRACKS THE FINGER — a horizontal drag translates the reading
//     itself, so the gesture is direct manipulation rather than an invisible
//     switch that only reveals itself on release.
//   • A chevron pill slides in from the edge you are pulling away from (drag
//     left → the pill enters from the right), dim at first and fully
//     ILLUMINATED once the commit threshold is crossed. That is the whole
//     affordance: it tells you a swipe is being tracked, which way it goes, and
//     when it will actually take.
//   • Crossing the threshold fires ONE light haptic; dragging back under it
//     re-arms, so the notch can be felt both ways.
//   • Release past the threshold (or a quick flick) carries the page off and
//     commits; release short of it springs back and nothing changes.
//   • At either end of the day's readings the drag rubber-bands against a short
//     stop with no pill and no haptic — the wall is felt, not explained.
//
// The neighbouring chapter is NOT rendered during the drag (the reference app
// doesn't either, and only one chapter is fetched at a time). The commit plays
// as carry-off → new content in from the opposite edge, which the entrance
// animation below owns for EVERY content change, swipe or not.

// The drag arithmetic — thresholds, over-drag slowing, the end-of-list rubber
// band, the flick-to-commit rule — lives in `src/lib/readerSwipe.ts` so the feel
// is unit-tested. Only the animation timings below are local.

/** Carry-off on commit, then the new page slides in from the opposite side. */
const EXIT_FRACTION = 0.3
const EXIT_MS = 160
const EXIT_FADE_MS = 140
const RETURN_MS = 220
const ENTRY_OFFSET = 32
const ENTRY_MS = 260
const ENTRY_FADE_MS = 220
/** Backstop: if a commit somehow doesn't change the content, un-hide the page. */
const ENTRY_RECOVERY_MS = 500

const EASE_OUT = Easing.out(Easing.cubic)

const PILL_W = 40
const PILL_H = 54
/** Resting inset of the pill from the screen edge once fully in. */
const PILL_INSET = 10

export type ChapterSwipeProps = {
  /** The reading itself (spinner / error / verses — whatever the screen renders). */
  children: ReactNode
  /**
   * Changes whenever the rendered content changes (passage, translation, or
   * load state). Each change plays the entrance: a slide-in from the trailing
   * edge after a committed swipe, a plain cross-fade otherwise.
   */
  contentKey: string
  canGoNext: boolean
  canGoPrev: boolean
  onGoNext: () => void
  onGoPrev: () => void
  /**
   * Right-to-left reading order (e.g. Hebrew). Only the mapping from drag
   * direction to next/previous flips; the pills stay geometric — the pill on
   * the right edge always carries `chevron.right`, which reads as "forward" in
   * LTR and "back" in RTL, matching where those chapters live on screen.
   */
  rtl?: boolean
  /**
   * Rendered above the page but OUTSIDE the moving layer — floating chrome
   * (the copy FAB) should not slide or fade with the reading.
   */
  overlay?: ReactNode
}

export default function ChapterSwipe({
  children,
  contentKey,
  canGoNext,
  canGoPrev,
  onGoNext,
  onGoPrev,
  rtl = false,
  overlay,
}: ChapterSwipeProps) {
  const { width } = useWindowDimensions()
  const threshold = swipeThreshold(width)

  // Reduce Motion: the finger-tracking drag itself is DELIBERATELY untouched —
  // direct manipulation is not animation, and both the HIG and WCAG 2.3.3 exempt
  // it, so suppressing it would break the gesture rather than calm it. What goes
  // is the motion that plays on its own: the carry-off, the slide-in, and the
  // spring-back. A cross-fade stays, which is the HIG-preferred reduced-motion
  // transition. Mirrors LoadingSkeleton / autoHideChrome / SplashOverlay.
  const { reduceMotion } = useAccessibilityFlags()

  const dx = useSharedValue(0)
  const pageOpacity = useSharedValue(1)
  /** 1 while a commit is carrying the page off — further drags are ignored. */
  const locked = useSharedValue(0)
  /** Latch so the threshold haptic fires once per crossing, not per frame. */
  const armed = useSharedValue(0)
  // The gesture callbacks are worklets and cannot read the flag store (a plain JS
  // closure over module state), so mirror it into a shared value. Done this way
  // rather than by capturing the boolean so it stays correct even if `pan` is
  // ever wrapped in a useMemo that forgets the dependency.
  const noMotion = useSharedValue(reduceMotion)
  useEffect(() => {
    noMotion.value = reduceMotion
  }, [reduceMotion, noMotion])

  // Which edge the next content should enter from: +1 = from the right (a
  // forward swipe carried the old page off to the left), -1 = from the left,
  // 0 = no slide (chip tap, translation switch, first load).
  const entryFrom = useRef(0)
  const recovery = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tick = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }, [])

  // Play the arrival: `from` slides the new content in from that edge (a
  // committed swipe), 0 just cross-fades it (chip tap, translation, first load).
  const enter = useCallback(
    (from: number) => {
      locked.value = 0
      armed.value = 0
      // Reduce Motion: land the new content in place — no offset, no slide.
      const slide = Boolean(from) && !reduceMotion
      dx.value = slide ? from * ENTRY_OFFSET : 0
      pageOpacity.value = 0
      if (slide) dx.value = withTiming(0, { duration: ENTRY_MS, easing: EASE_OUT })
      // NOT gated on reduceMotion, and it must never be: pageOpacity was just
      // hard-set to 0 on the line above, for every content change. Skipping this
      // fade would leave the reading permanently invisible rather than unanimated.
      pageOpacity.value = withTiming(1, { duration: ENTRY_FADE_MS })
    },
    [dx, pageOpacity, locked, armed, reduceMotion],
  )

  // Committed: record which edge the replacement comes in from, then advance.
  // The drag is gated on canGoNext/canGoPrev, so the passage really does change
  // and the entrance below really does fire. The timer is a backstop only — it
  // guarantees a carried-off page can never be left parked off-screen and
  // invisible, whatever a host screen does with onGoNext/onGoPrev.
  const advance = useCallback(
    (forward: boolean) => {
      entryFrom.current = forward ? 1 : -1
      if (forward) onGoNext()
      else onGoPrev()
      const stranded = setTimeout(() => {
        if (entryFrom.current !== 0) {
          entryFrom.current = 0
          enter(0)
        }
      }, ENTRY_RECOVERY_MS)
      recovery.current = stranded
    },
    [onGoNext, onGoPrev, enter],
  )

  // The single owner of the entrance, for every content change.
  useEffect(() => {
    const from = entryFrom.current
    entryFrom.current = 0
    if (recovery.current) clearTimeout(recovery.current)
    enter(from)
  }, [contentKey, enter])

  useEffect(() => () => { if (recovery.current) clearTimeout(recovery.current) }, [])

  const pan = Gesture.Pan()
    // Horizontal dominance: activate only on a sideways drag, and bail out the
    // moment the finger goes vertical so the reading still scrolls normally.
    .activeOffsetX([-14, 14])
    .failOffsetY([-16, 16])
    .onUpdate((e) => {
      if (locked.value) return
      const raw = e.translationX
      const forward = isForwardDrag(raw, rtl)
      const hasNeighbour = forward ? canGoNext : canGoPrev
      dx.value = dragTravel(raw, threshold, hasNeighbour)

      // The threshold haptic — one tick per crossing, and it re-arms on the way
      // back so the notch can be felt in both directions. Never at a wall.
      const nowArmed = hasNeighbour && Math.abs(dx.value) >= threshold ? 1 : 0
      if (nowArmed !== armed.value) {
        armed.value = nowArmed
        if (nowArmed) runOnJS(tick)()
      }
    })
    .onEnd((e) => {
      if (locked.value) return
      armed.value = 0
      const travelled = Math.abs(dx.value)
      const forward = isForwardDrag(dx.value, rtl)

      if (
        (forward ? canGoNext : canGoPrev) &&
        shouldCommitSwipe(travelled, e.velocityX, threshold)
      ) {
        locked.value = 1
        if (noMotion.value) {
          // Reduce Motion: cut straight to the commit. The chapter change lives in
          // the completion callback of the carry-off below, so this branch MUST
          // still call advance() — dropping the animation without it would leave
          // the reader on the same passage, silently. Same shape, same fix as
          // SplashOverlay's reduced-motion branch: run the callback synchronously.
          dx.value = 0
          pageOpacity.value = 0
          runOnJS(advance)(forward)
          return
        }
        const exitTo = (dx.value < 0 ? -1 : 1) * width * EXIT_FRACTION
        pageOpacity.value = withTiming(0, { duration: EXIT_FADE_MS })
        dx.value = withTiming(exitTo, { duration: EXIT_MS, easing: EASE_OUT }, (finished) => {
          if (finished) runOnJS(advance)(forward)
        })
        return
      }
      // Released without committing: put the page back. Instantly under Reduce
      // Motion — it is undoing a finger drag, so there is nothing to animate.
      dx.value = withTiming(0, { duration: noMotion.value ? 0 : RETURN_MS, easing: EASE_OUT })
    })
    // A cancelled gesture (system pan-out, another handler winning) still has to
    // drop the haptic latch and put the page back.
    .onFinalize((_e, success) => {
      armed.value = 0
      if (!success && !locked.value) {
        dx.value = withTiming(0, { duration: noMotion.value ? 0 : RETURN_MS, easing: EASE_OUT })
      }
    })

  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.value }],
    opacity: pageOpacity.value,
  }))

  return (
    <View style={{ flex: 1 }}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1 }, pageStyle]}>{children}</Animated.View>
      </GestureDetector>

      {/* Edge affordances. Geometric, not semantic: the right pill answers a
          leftward drag whichever chapter that lands on. Both sit outside the
          moving layer so they hold still while the page travels. */}
      <EdgePill side="right" dx={dx} threshold={threshold} enabled={rtl ? canGoPrev : canGoNext} />
      <EdgePill side="left" dx={dx} threshold={threshold} enabled={rtl ? canGoNext : canGoPrev} />

      {overlay}
    </View>
  )
}

/**
 * One edge chevron. It rides in from off-screen as the drag progresses, dim
 * until the commit threshold, then cross-fades to an accent-filled "armed"
 * state — the moment the haptic fires and letting go will change chapter.
 * Purely decorative: the chapter chips above the reading are the accessible
 * navigation, so this is hidden from assistive tech and takes no touches.
 */
function EdgePill({
  side,
  dx,
  threshold,
  enabled,
}: {
  side: 'left' | 'right'
  dx: SharedValue<number>
  threshold: number
  enabled: boolean
}) {
  const t = useTheme()
  // A right-edge pill answers a leftward (negative) drag, and vice versa.
  const sign = side === 'right' ? -1 : 1
  const offscreen = (PILL_W + PILL_INSET + 8) * -sign

  const wrapStyle = useAnimatedStyle(() => {
    // Same style keys every frame — Reanimated needs a stable shape.
    const progress = swipeProgress(enabled ? dx.value * sign : 0, threshold)
    return {
      opacity: interpolate(progress, [0, 0.12, 1], [0, 0.55, 1]),
      transform: [
        { translateX: offscreen * (1 - progress) },
        { scale: interpolate(progress, [0, 1], [0.88, 1]) },
      ],
    }
  })

  // Cross-fade to the armed look over the last stretch before the threshold.
  const armedStyle = useAnimatedStyle(() => {
    const travel = enabled ? dx.value * sign : 0
    return {
      opacity: travel <= 0 ? 0 : interpolate(travel / threshold, [0.8, 1], [0, 1], 'clamp'),
    }
  })

  const face = {
    width: PILL_W,
    height: PILL_H,
    borderRadius: t.radii.md,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          position: 'absolute',
          top: 0,
          bottom: 0,
          [side]: PILL_INSET,
          justifyContent: 'center',
        },
        wrapStyle,
      ]}
    >
      <View>
        <View style={{ ...face, backgroundColor: t.colors.surfaceAlt, borderColor: t.colors.border }}>
          <SymbolIcon
            name={side === 'right' ? 'chevron.right' : 'chevron.left'}
            size={19}
            color={t.colors.sec}
            weight="semibold"
          />
        </View>
        <Animated.View
          style={[
            {
              ...face,
              position: 'absolute',
              backgroundColor: t.colors.accentSoft,
              borderColor: t.colors.accent,
            },
            armedStyle,
          ]}
        >
          <SymbolIcon
            name={side === 'right' ? 'chevron.right' : 'chevron.left'}
            size={19}
            color={t.colors.textAccent}
            weight="semibold"
          />
        </Animated.View>
      </View>
    </Animated.View>
  )
}
