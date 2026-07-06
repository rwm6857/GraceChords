import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'

// Live keyboard overlap height. On iOS it rises with keyboardWillShow and
// returns to 0 on hide, so a scroll view can grow its bottom padding only
// while the keyboard is up — rows behind the keyboard scroll into view, and
// no dead gap remains once it closes. iOS-only by design: Android's window
// resizes itself (adjustResize), so extra padding there would double up.
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0)
  useEffect(() => {
    if (Platform.OS !== 'ios') return
    const show = Keyboard.addListener('keyboardWillShow', (e) =>
      setHeight(e.endCoordinates.height),
    )
    const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])
  return height
}
