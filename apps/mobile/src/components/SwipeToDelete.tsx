import { useCallback, type ReactNode } from 'react'
import { Alert, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import SymbolIcon from './SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'

// iOS-26-style swipe-to-delete, reusable across lists (setlist rows in the
// builder, setlists in the library, …). Behavior:
//  • Partial swipe left → the row opens to reveal a red Delete button and
//    rests there. Tap the button to delete; swipe back to close.
//  • Full swipe left (past ~half the row width) → the row slides off and
//    deletes.
// Pass `confirm` for destructive targets (e.g. a whole setlist): the delete is
// gated behind a native alert; Cancel snaps the row closed. The moving layer
// carries an opaque background so the red action only shows as it's revealed.

const BUTTON_W = 88
const FULL_SWIPE_FRACTION = 0.5

export type ConfirmDelete = { title: string; message?: string; confirmLabel?: string }

export default function SwipeToDelete({
  children,
  onDelete,
  label = 'Delete',
  background,
  confirm,
}: {
  children: ReactNode
  onDelete: () => void
  /** Button label + accessibility label (e.g. "Delete", "Remove"). */
  label?: string
  /** Opaque background for the moving row layer; defaults to the page bg. */
  background?: string
  /** When set, gate the delete behind a native confirm alert. */
  confirm?: ConfirmDelete
}) {
  const t = useTheme()
  const { width } = useWindowDimensions()
  const tx = useSharedValue(0)
  const startX = useSharedValue(0)
  const hasConfirm = !!confirm

  const snapClosed = useCallback(() => {
    tx.value = withTiming(0, { duration: 160 })
  }, [tx])

  // Slide the row off, then remove it.
  const commit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    tx.value = withTiming(-width, { duration: 160 }, (finished) => {
      if (finished) runOnJS(onDelete)()
    })
  }, [onDelete, tx, width])

  // Confirm-gated entry point (used when `confirm` is set); otherwise commit.
  const requestDelete = useCallback(() => {
    if (confirm) {
      Alert.alert(confirm.title, confirm.message, [
        { text: 'Cancel', style: 'cancel', onPress: snapClosed },
        { text: confirm.confirmLabel ?? 'Delete', style: 'destructive', onPress: commit },
      ])
    } else {
      commit()
    }
  }, [confirm, snapClosed, commit])

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onStart(() => {
      startX.value = tx.value
    })
    .onUpdate((e) => {
      // Left-swipe only; allow dragging back to close from the open rest.
      tx.value = Math.min(0, Math.max(-width, startX.value + e.translationX))
    })
    .onEnd(() => {
      const full = width * FULL_SWIPE_FRACTION
      if (-tx.value >= full) {
        if (hasConfirm) {
          // Rest open under the confirm dialog; commit/cancel resolves it.
          tx.value = withTiming(-BUTTON_W, { duration: 140 })
          runOnJS(requestDelete)()
        } else {
          tx.value = withTiming(-width, { duration: 180 }, (finished) => {
            if (finished) runOnJS(onDelete)()
          })
        }
      } else if (-tx.value > BUTTON_W / 2) {
        tx.value = withTiming(-BUTTON_W, { duration: 140 })
      } else {
        tx.value = withTiming(0, { duration: 140 })
      }
    })

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }))
  // The red action fills from the right, growing as the row is pulled further
  // so a full swipe reads as an edge-to-edge delete.
  const actionStyle = useAnimatedStyle(() => ({ width: Math.max(BUTTON_W, -tx.value) }))

  return (
    <View style={{ overflow: 'hidden' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            backgroundColor: t.colors.danger,
            alignItems: 'flex-end',
            justifyContent: 'center',
          },
          actionStyle,
        ]}
      >
        <Pressable
          onPress={requestDelete}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={{ width: BUTTON_W, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 3 }}
        >
          <SymbolIcon name="trash" size={20} color={t.colors.onDanger} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: t.colors.onDanger }}>{label}</Text>
        </Pressable>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[{ backgroundColor: background ?? t.colors.bg }, rowStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  )
}
