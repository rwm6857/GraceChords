import { useCallback } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import SymbolIcon from '../SymbolIcon'
import { useTheme } from '../../theme/ThemeProvider'
import type { SetlistItem } from '../../lib/useSetlistBuilder'

// The builder's numbered timeline: drag grip + numbered badge on a vertical
// rail + title/artist + key chip + per-row menu. Reordering is a hand-rolled
// long-press pan on the grip (react-native-draggable-flatlist is not
// maintained against reanimated v4 / the New Architecture): the active row
// follows the finger while the others animate out of the way by whole row
// heights, and the move commits on release. Rows are fixed-height so the
// drag math is pure arithmetic. Swiping the row body left past the threshold
// removes the entry — horizontal, so it never fights the vertical grip drag.

export const ROW_HEIGHT = 64

export type TimelineCallbacks = {
  onPressRow: (index: number) => void
  onKeyTap: (index: number) => void
  onRowMenu: (index: number) => void
  onMove: (from: number, to: number) => void
  onRemove: (index: number) => void
}

function clampWorklet(value: number, lo: number, hi: number) {
  'worklet'
  return Math.max(lo, Math.min(hi, value))
}

function Row({
  item,
  index,
  count,
  effectiveKey,
  activeIndex,
  proposedIndex,
  dragY,
  callbacks,
}: {
  item: SetlistItem
  index: number
  count: number
  effectiveKey: string | null
  activeIndex: SharedValue<number>
  proposedIndex: SharedValue<number>
  dragY: SharedValue<number>
  callbacks: TimelineCallbacks
}) {
  const t = useTheme()

  const startDragHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
  }, [])

  const commitMove = useCallback(
    (from: number, to: number) => {
      if (from !== to) callbacks.onMove(from, to)
    },
    [callbacks],
  )

  const pan = Gesture.Pan()
    .activateAfterLongPress(150)
    .onStart(() => {
      activeIndex.value = index
      proposedIndex.value = index
      dragY.value = 0
      runOnJS(startDragHaptic)()
    })
    .onUpdate((e) => {
      dragY.value = e.translationY
      proposedIndex.value = clampWorklet(
        index + Math.round(e.translationY / ROW_HEIGHT),
        0,
        count - 1,
      )
    })
    .onEnd(() => {
      runOnJS(commitMove)(index, proposedIndex.value)
    })
    .onFinalize(() => {
      activeIndex.value = -1
      dragY.value = 0
    })

  const animatedStyle = useAnimatedStyle(() => {
    if (activeIndex.value === index) {
      return {
        zIndex: 10,
        transform: [{ translateY: dragY.value }, { scale: 1.02 }],
      }
    }
    let offset = 0
    if (activeIndex.value >= 0) {
      const from = activeIndex.value
      const to = proposedIndex.value
      if (from < index && index <= to) offset = -ROW_HEIGHT
      else if (to <= index && index < from) offset = ROW_HEIGHT
    }
    return {
      zIndex: 0,
      transform: [{ translateY: withTiming(offset, { duration: 140 }) }, { scale: 1 }],
    }
  })

  const liftedStyle = useAnimatedStyle(() => ({
    backgroundColor: activeIndex.value === index ? t.colors.surface : t.colors.bg,
    shadowOpacity: withTiming(activeIndex.value === index ? 0.25 : 0, { duration: 120 }),
  }))

  const renderRightActions = () => (
    <View
      style={{
        width: 88,
        height: '100%',
        backgroundColor: t.colors.danger,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <SymbolIcon name="trash" size={20} color={t.colors.onDanger} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: t.colors.onDanger }}>Remove</Text>
    </View>
  )

  return (
    <Animated.View style={animatedStyle}>
      <Animated.View
        style={[
          {
            borderRadius: t.radii.md,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 12,
            elevation: 4,
          },
          liftedStyle,
        ]}
      >
        <ReanimatedSwipeable
          friction={2}
          rightThreshold={64}
          overshootRight={false}
          renderRightActions={renderRightActions}
          onSwipeableWillOpen={() => callbacks.onRemove(index)}
        >
          <View
            style={{
              height: ROW_HEIGHT,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'transparent',
            }}
          >
            {/* Drag grip */}
            <GestureDetector gesture={pan}>
              <View
                accessibilityLabel={`Reorder ${item.song.title}`}
                style={{
                  width: 40,
                  height: '100%',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <SymbolIcon name="line.3.horizontal" size={17} color={t.colors.muted} />
              </View>
            </GestureDetector>

            {/* Numbered badge on the rail */}
            <View style={{ width: 34, height: '100%', alignItems: 'center' }}>
              <View
                style={{
                  position: 'absolute',
                  top: index === 0 ? ROW_HEIGHT / 2 : 0,
                  bottom: index === count - 1 ? ROW_HEIGHT / 2 : 0,
                  width: 2,
                  backgroundColor: t.colors.border,
                  opacity: count > 1 ? 1 : 0,
                }}
              />
              <View
                style={{
                  marginTop: ROW_HEIGHT / 2 - 13,
                  width: 26,
                  height: 26,
                  borderRadius: t.radii.pill,
                  backgroundColor: t.colors.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: t.colors.textAccent }}>
                  {index + 1}
                </Text>
              </View>
            </View>

            {/* Title + artist */}
            <Pressable
              onPress={() => callbacks.onPressRow(index)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.song.title}`}
              style={{ flex: 1, minWidth: 0, paddingHorizontal: t.spacing.md }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: t.typography.rowTitle.fontSize,
                  fontWeight: t.typography.rowTitle.fontWeight,
                  letterSpacing: t.typography.rowTitle.letterSpacing,
                  color: t.colors.ink,
                }}
              >
                {item.song.title}
              </Text>
              {item.song.artist ? (
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 2,
                    fontSize: t.typography.rowSubtitle.fontSize,
                    color: t.colors.sec,
                  }}
                >
                  {item.song.artist}
                </Text>
              ) : null}
            </Pressable>

            {/* Key chip */}
            <Pressable
              onPress={() => callbacks.onKeyTap(index)}
              accessibilityRole="button"
              accessibilityLabel={`Change key for ${item.song.title}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: 10,
                height: 30,
                borderRadius: t.radii.sm,
                backgroundColor: t.colors.accentSoft,
              }}
            >
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: t.colors.textAccent }}>
                {effectiveKey ?? '—'}
              </Text>
              <SymbolIcon name="chevron.up.chevron.down" size={10} color={t.colors.textAccent} />
            </Pressable>

            {/* Row menu */}
            <Pressable
              onPress={() => callbacks.onRowMenu(index)}
              accessibilityRole="button"
              accessibilityLabel={`More options for ${item.song.title}`}
              hitSlop={8}
              style={{ width: 40, height: '100%', alignItems: 'center', justifyContent: 'center' }}
            >
              <SymbolIcon name="ellipsis" size={17} color={t.colors.muted} />
            </Pressable>
          </View>
        </ReanimatedSwipeable>
      </Animated.View>
    </Animated.View>
  )
}

export default function SetlistTimeline({
  items,
  effectiveKeys,
  callbacks,
}: {
  items: SetlistItem[]
  /** Per-item effective key (override ?? native), same order as items. */
  effectiveKeys: Array<string | null>
  callbacks: TimelineCallbacks
}) {
  const activeIndex = useSharedValue(-1)
  const proposedIndex = useSharedValue(-1)
  const dragY = useSharedValue(0)

  return (
    <View>
      {items.map((item, index) => (
        <Row
          key={item.entryKey}
          item={item}
          index={index}
          count={items.length}
          effectiveKey={effectiveKeys[index] ?? null}
          activeIndex={activeIndex}
          proposedIndex={proposedIndex}
          dragY={dragY}
          callbacks={callbacks}
        />
      ))}
    </View>
  )
}
