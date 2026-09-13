import type { ReactNode } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme/ThemeProvider'

// Chrome for sheets hosted in the native formSheet route (app/sheet.tsx): the
// same title/action header as BottomSheet, minus the Modal, backdrop, slide
// animation, and grabber — presentation, dismissal, and the grabber are native.
//
// ANDROID: a trailing "Done" is an iOS idiom. Material dismisses a bottom sheet
// with the drag handle, the scrim or Back — all three already work here (see
// app/sheet.tsx) — so a header button that only closes is redundant chrome.
//
// The discriminator is `actionLabel`, which already partitions the call sites
// exactly and so needs no changes at any of them: the twelve dismiss-only
// sheets pass `onAction={onClose}` and NO label, while the four that do real
// work all name it (Filter & sort "Reset", Date picker "Today", Display name
// "Save", Reminder time "Done"). Only the unlabelled ones are dropped, so no
// flow that depends on an explicit confirm loses its button.
//
// Reminder time is the one to be careful with: it commits a draft, so it names
// its label rather than leaning on the default — see ReminderTimeSheet.tsx.

export default function FormSheetShell({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string
  /**
   * Defaults to the localized "Done". Leaving it unset also MARKS THE ACTION AS
   * A PLAIN DISMISSAL, which is what hides it on Android — so a header action
   * that does real work must always pass a label, even when that label is
   * "Done".
   */
  actionLabel?: string
  /** Header action; pass the sheet's close/reset handler. */
  onAction: () => void
  children: ReactNode
}) {
  const t = useTheme()
  const { t: tx } = useTranslation('common')
  const action = actionLabel ?? tx('done')
  const showAction = actionLabel !== undefined || Platform.OS !== 'android'
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
        {showAction ? (
          <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: t.colors.textAccent }}>
              {action}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  )
}
