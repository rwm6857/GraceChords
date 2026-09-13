import { useEffect } from 'react'
import { Platform, View } from 'react-native'
import { Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { notifyFormSheetRouteClosed, useFormSheetContent } from '../src/lib/formSheetHost'
import { useTheme } from '../src/theme/ThemeProvider'

// The shared native-sheet route: presented as `formSheet` (see app/_layout.tsx)
// so phones get a native bottom sheet with detents/grabber and iPads get the
// centered, naturally-narrow form sheet. Content comes from the formSheetHost
// bridge — the owning screen keeps its state and callbacks.

// Material 3's bottom-sheet drag handle, for Android only.
//
// react-native-screens 4.23 types `sheetGrabberVisible` as @platform ios, and
// the Android side bears that out: ScreenViewManager stores the prop on
// Screen.isSheetGrabberVisible and nothing ever reads it back, so the app asks
// for a grabber and Android silently draws none. Every OTHER part of the
// Material sheet is already native there — the dimming scrim (DimmingViewManager,
// 0.3 alpha), swipe-to-dismiss (isHideable), scrim-tap dismiss
// (sheetClosesOnTouchOutside) and the corner radius — so this one 32×4 bar is
// the whole gap.
//
// Geometry is MD3's (32 × 4dp, fully rounded, onSurfaceVariant at 40% =
// colors.sheetHandle). The 16dp above it is spacing.lg, and FormSheetShell
// contributes its own spacing.lg below, which lands the title 36dp from the
// sheet's top edge.
//
// Decorative: Android's sheet is itself the accessibility target and the handle
// duplicates gestures TalkBack already exposes, so it is hidden from the tree
// rather than given a label — which is also why this adds no i18n key.
function MaterialDragHandle() {
  const t = useTheme()
  return (
    <View
      importantForAccessibility="no"
      style={{ alignItems: 'center', paddingTop: t.spacing.lg }}
    >
      <View
        style={{
          width: 32,
          height: 4,
          borderRadius: 2,
          backgroundColor: t.colors.sheetHandle,
        }}
      />
    </View>
  )
}

export default function SheetRoute() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const content = useFormSheetContent()

  useEffect(() => () => notifyFormSheetRouteClosed(), [])

  // collapsable={false}: RN's view flattening would otherwise merge this
  // wrapper (and the shell) into the sheet container, so react-native-screens'
  // fitToContents sizing sees many subviews and warns ("FormSheet with
  // ScrollView expects at most 2 subviews"). Pinning the wrapper keeps the
  // container at exactly one native child.
  return (
    <>
      {/* Paint the native sheet's own background with the themed surface color.
          _layout.tsx sets it to 'transparent' (it can't read the live theme
          there), which leaves the strip under the home indicator — the region a
          fitToContents sheet still covers but the content view doesn't paint —
          showing the OS's default grey. Overriding contentStyle here (theme-
          aware) fills that strip for every sheet in the app, light and dark. */}
      <Stack.Screen options={{ contentStyle: { backgroundColor: t.colors.surface } }} />
      {/* Bottom safe-area inset for EVERY sheet, applied once here. A
          fitToContents sheet is only as tall as its React content, so content
          that stops short of the home indicator leaves the strip below it
          uncovered — the gap where the screen behind shows through. Padding the
          host (rather than each sheet) also puts the inset OUTSIDE any inner
          ScrollView, where content-container padding would just scroll away.
          Sheet content must not add insets.bottom of its own. */}
      <View
        collapsable={false}
        style={{ backgroundColor: t.colors.surface, paddingBottom: insets.bottom }}
      >
        {/* iOS renders null here — no view, no layout node — so UIKit's own
            grabber stays the only one and the wrapper keeps exactly the single
            child the fitToContents sizing above depends on. */}
        {Platform.OS === 'android' ? <MaterialDragHandle /> : null}
        {content}
      </View>
    </>
  )
}
