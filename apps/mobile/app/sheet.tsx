import { useEffect } from 'react'
import { View } from 'react-native'
import { notifyFormSheetRouteClosed, useFormSheetContent } from '../src/lib/formSheetHost'
import { useTheme } from '../src/theme/ThemeProvider'

// The shared native-sheet route: presented as `formSheet` (see app/_layout.tsx)
// so phones get a native bottom sheet with detents/grabber and iPads get the
// centered, naturally-narrow form sheet. Content comes from the formSheetHost
// bridge — the owning screen keeps its state and callbacks.

export default function SheetRoute() {
  const t = useTheme()
  const content = useFormSheetContent()

  useEffect(() => () => notifyFormSheetRouteClosed(), [])

  // collapsable={false}: RN's view flattening would otherwise merge this
  // wrapper (and the shell) into the sheet container, so react-native-screens'
  // fitToContents sizing sees many subviews and warns ("FormSheet with
  // ScrollView expects at most 2 subviews"). Pinning the wrapper keeps the
  // container at exactly one native child.
  return (
    <View collapsable={false} style={{ backgroundColor: t.colors.surface }}>
      {content}
    </View>
  )
}
