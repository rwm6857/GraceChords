import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { Appearance, useColorScheme } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { getTokens, lightTokens, type Tokens } from '@gracechords/tokens/native'
import { resolveThemeMode, useAppDefaults } from '../lib/defaults'

// ThemeProvider is the single source of truth for the app's color scheme. It
// resolves the user's theme preference (Settings → Appearance, stored in the
// defaults store) against the OS scheme: 'system' follows the device (the
// original app.json userInterfaceStyle: "automatic" behavior), while
// 'light'/'dark' force a mode. Changing the setting re-renders the whole app
// immediately. Components read the resolved tokens with useTheme().

const ThemeContext = createContext<Tokens>(lightTokens)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme()
  const { theme } = useAppDefaults()
  // Push the preference down to the native color scheme so RN-managed surfaces
  // (keyboard, share/action sheets, alerts) match a forced light/dark override
  // instead of tracking the OS. 'system' clears the override ('unspecified' →
  // follow OS).
  useEffect(() => {
    Appearance.setColorScheme(theme === 'system' ? 'unspecified' : theme)
  }, [theme])
  const tokens = useMemo(() => getTokens(resolveThemeMode(theme, scheme)), [theme, scheme])
  return <ThemeContext.Provider value={tokens}>{children}</ThemeContext.Provider>
}

/** Access the resolved design tokens for the current color scheme. */
export function useTheme(): Tokens {
  return useContext(ThemeContext)
}

/**
 * Status bar whose icon color follows the app-wide resolved theme (not the OS
 * scheme), so a forced light/dark override stays consistent: light content on a
 * dark background and vice-versa. Render inside ThemeProvider.
 */
export function ThemedStatusBar() {
  const { mode } = useTheme()
  return <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
}
