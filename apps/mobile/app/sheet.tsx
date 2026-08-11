import { useEffect } from 'react'
import { View } from 'react-native'
import { Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { notifyFormSheetRouteClosed, useFormSheetContent } from '../src/lib/formSheetHost'
import { useTheme } from '../src/theme/ThemeProvider'

// The shared native-sheet route: presented as `formSheet` (see app/_layout.tsx)
// so phones get a native bottom sheet with detents/grabber and iPads get the
// centered, naturally-narrow form sheet. Content comes from the formSheetHost
// bridge — the owning screen keeps its state and callbacks.

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
        {content}
      </View>
    </>
  )
}
