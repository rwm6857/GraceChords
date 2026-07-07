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

  return <View style={{ backgroundColor: t.colors.surface }}>{content}</View>
}
