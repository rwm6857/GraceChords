import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'

// Chrome for sheets hosted in the native formSheet route (app/sheet.tsx): the
// same title/action header as BottomSheet, minus the Modal, backdrop, slide
// animation, and grabber — presentation, dismissal, and the grabber are native.

export default function FormSheetShell({
  title,
  actionLabel = 'Done',
  onAction,
  children,
}: {
  title: string
  actionLabel?: string
  /** Header action; pass the sheet's close/reset handler. */
  onAction: () => void
  children: ReactNode
}) {
  const t = useTheme()
  return (
    <View style={{ backgroundColor: t.colors.surface }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: t.spacing.lg,
          paddingTop: t.spacing.lg,
          paddingBottom: t.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: t.colors.border,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: t.colors.ink }}>
          {title}
        </Text>
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: t.colors.textAccent }}>
            {actionLabel}
          </Text>
        </Pressable>
      </View>
      {children}
    </View>
  )
}
