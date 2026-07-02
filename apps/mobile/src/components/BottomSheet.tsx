import { ReactNode, useEffect, useRef, useState } from 'react'
import { Animated, Easing, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'

// Shared bottom-sheet shell: dimmed backdrop that FADES while the sheet
// SLIDES up. RN Modal's animationType="slide" animates the whole overlay —
// backdrop included — which reads as a grey rectangle dragging up the screen,
// so this drives both animations itself (Modal animationType="none") and
// keeps the modal mounted until the exit animation finishes.

export default function BottomSheet({
  visible,
  onClose,
  title,
  actionLabel = 'Done',
  onAction,
  onDismissed,
  closeAccessibilityLabel,
  children,
}: {
  visible: boolean
  onClose: () => void
  title: string
  actionLabel?: string
  /** Header action; defaults to closing the sheet. */
  onAction?: () => void
  /**
   * Fires once the exit animation finishes and the Modal unmounts — the safe
   * moment to present another modal (iOS refuses while one is dismissing).
   */
  onDismissed?: () => void
  closeAccessibilityLabel?: string
  children: ReactNode
}) {
  const t = useTheme()
  const { height } = useWindowDimensions()
  const [mounted, setMounted] = useState(visible)
  const progress = useRef(new Animated.Value(0)).current
  // Ref so the exit animation's completion callback always sees the latest
  // handler without retriggering the effect.
  const onDismissedRef = useRef(onDismissed)
  onDismissedRef.current = onDismissed

  useEffect(() => {
    if (visible) {
      setMounted(true)
      Animated.timing(progress, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start()
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setMounted(false)
          onDismissedRef.current?.()
        }
      })
    }
  }, [visible, progress])

  if (!mounted) return null

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] })

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.34)',
            opacity: progress,
          }}
        >
          <Pressable
            onPress={onClose}
            accessibilityLabel={closeAccessibilityLabel || `Close ${title.toLowerCase()}`}
            style={{ flex: 1 }}
          />
        </Animated.View>

        <Animated.View
          style={{
            transform: [{ translateY }],
            maxHeight: '82%',
            backgroundColor: t.colors.surface,
            borderTopLeftRadius: t.radii.sheet,
            borderTopRightRadius: t.radii.sheet,
            overflow: 'hidden',
          }}
        >
          {/* Grabber */}
          <View style={{ alignItems: 'center', paddingTop: t.spacing.sm }}>
            <View
              style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: t.colors.border }}
            />
          </View>

          {/* Title row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: t.spacing.lg,
              paddingTop: t.spacing.sm,
              paddingBottom: t.spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: t.colors.border,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: t.colors.ink }}>
              {title}
            </Text>
            <Pressable onPress={onAction || onClose} accessibilityRole="button" hitSlop={8}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: t.colors.textAccent }}>
                {actionLabel}
              </Text>
            </Pressable>
          </View>

          {children}
        </Animated.View>
      </View>
    </Modal>
  )
}
