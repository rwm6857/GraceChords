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
import { useTranslation } from 'react-i18next'
import SymbolIcon, { type SymbolIconProps } from './SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'

// iOS-26-style swipe-to-delete, reusable across lists (setlist rows in the
// builder, setlists in the library, …). Behavior:
//  • Partial swipe left → the row opens to reveal a red Delete button (and, when
//    `secondary` is set, one more action beside it) and rests there. Tap an
//    action to run it; swipe back to close.
//  • Full swipe left (past ~half the row width) → the row slides off and
//    deletes. Delete stays the full-swipe action whether or not there is a
//    secondary one: the gesture must mean the same thing in every row.
// Pass `confirm` for destructive targets (e.g. a whole setlist): the delete is
// gated behind a native alert; Cancel snaps the row closed. The moving layer
// carries an opaque background so the red action only shows as it's revealed.

const BUTTON_W = 88
const FULL_SWIPE_FRACTION = 0.5

export type ConfirmDelete = { title: string; message?: string; confirmLabel?: string }

/** A non-destructive action revealed beside Delete on a partial swipe. */
export type SwipeSecondaryAction = {
  label: string
  /** SF Symbol name, e.g. 'plus.square.on.square'. */
  icon: SymbolIconProps['name']
  onPress: () => void
}

export default function SwipeToDelete({
  children,
  onDelete,
  label,
  background,
  confirm,
  secondary,
}: {
  children: ReactNode
  onDelete: () => void
  /** Button label + accessibility label (e.g. "Remove"); localized "Delete" by default. */
  label?: string
  /** Opaque background for the moving row layer; defaults to the page bg. */
  background?: string
  /** When set, gate the delete behind a native confirm alert. */
  confirm?: ConfirmDelete
  /** Optional non-destructive action shown to the left of Delete. */
  secondary?: SwipeSecondaryAction
}) {
  const t = useTheme()
  // Aliased `tr` — `tx` is this component's translateX shared value.
  const { t: tr } = useTranslation('common')
  const deleteLabel = label ?? tr('delete')
  const { width } = useWindowDimensions()
  const tx = useSharedValue(0)
  const startX = useSharedValue(0)
  const hasConfirm = !!confirm
  // How far the row rests open: one button, or two when there is a secondary.
  const restW = secondary ? BUTTON_W * 2 : BUTTON_W

  const snapClosed = useCallback(() => {
    tx.value = withTiming(0, { duration: 160 })
  }, [tx])

  // A secondary action closes the row rather than leaving it hanging open over a
  // list that is about to change underneath it.
  const runSecondary = useCallback(() => {
    snapClosed()
    secondary?.onPress()
  }, [secondary, snapClosed])

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
        { text: tr('cancel'), style: 'cancel', onPress: snapClosed },
        { text: confirm.confirmLabel ?? tr('delete'), style: 'destructive', onPress: commit },
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
          tx.value = withTiming(-restW, { duration: 140 })
          runOnJS(requestDelete)()
        } else {
          tx.value = withTiming(-width, { duration: 180 }, (finished) => {
            if (finished) runOnJS(onDelete)()
          })
        }
      } else if (-tx.value > restW / 2) {
        tx.value = withTiming(-restW, { duration: 140 })
      } else {
        tx.value = withTiming(0, { duration: 140 })
      }
    })

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }))
  // The red action fills from the right, growing as the row is pulled further
  // so a full swipe reads as an edge-to-edge delete.
  //
  // The offset keeps it off the secondary action's slot until the swipe goes
  // PAST the rest position: without it the red panel is as wide as the whole
  // opening from the first pixel and simply covers the button beside it. Past
  // rest it overtakes the secondary, which is what a full swipe should look
  // like. With no secondary the offset is zero and this is the old expression.
  const actionStyle = useAnimatedStyle(() => ({
    width: Math.max(BUTTON_W, -tx.value - (restW - BUTTON_W)),
  }))

  return (
    <View style={{ overflow: 'hidden' }}>
      {/* Rendered BELOW the destructive layer so a full swipe, whose red panel
          grows leftward across the whole row, covers this rather than leaving a
          non-destructive button sitting under a delete gesture. */}
      {secondary ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: BUTTON_W,
            bottom: 0,
            width: BUTTON_W,
            backgroundColor: t.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Pressable
            onPress={runSecondary}
            accessibilityRole="button"
            accessibilityLabel={secondary.label}
            style={{
              width: BUTTON_W,
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
            }}
          >
            <SymbolIcon name={secondary.icon} size={20} color={t.colors.onAccent} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: t.colors.onAccent }}>
              {secondary.label}
            </Text>
          </Pressable>
        </View>
      ) : null}

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
          accessibilityLabel={deleteLabel}
          style={{ width: BUTTON_W, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 3 }}
        >
          <SymbolIcon name="trash" size={20} color={t.colors.onDanger} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: t.colors.onDanger }}>{deleteLabel}</Text>
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
