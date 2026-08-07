import { useMemo } from 'react'
import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native'
import { useTheme } from './ThemeProvider'

// React Navigation's theme, rebuilt from OUR tokens.
//
// Why this matters beyond tidiness: expo-router paints each native tab's
// content container with `useTheme().colors.background` from this theme
// (expo-router/build/native-tabs/NativeTabsView.js). The stock React Navigation
// palettes use rgb(242,242,242) / rgb(1,1,1), neither of which is our page
// background (#F5F7F9 / #14171A). Since iOS 18, UITabBarController cross-
// dissolves between tabs — both screens go momentarily semi-transparent — so a
// mismatched container color washes through the whole screen for the length of
// the transition and reads as an unexplained fade of everything except the tab
// bar. Painting the container in the same color the screens themselves use
// makes the dissolve invisible.
//
// (The dissolve itself is a UIKit default that react-native-screens does not
// override and exposes no prop for; matching the backdrop is the fix available
// to us from JS.)

export function useNavigationTheme(): Theme {
  const t = useTheme()
  const base = t.mode === 'dark' ? DarkTheme : DefaultTheme
  return useMemo(
    () => ({
      ...base,
      colors: {
        ...base.colors,
        background: t.colors.bg,
        card: t.colors.surface,
        text: t.colors.ink,
        border: t.colors.border,
        primary: t.colors.accent,
      },
    }),
    [base, t.colors],
  )
}
