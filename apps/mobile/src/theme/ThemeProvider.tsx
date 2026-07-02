import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
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
  const tokens = useMemo(() => getTokens(resolveThemeMode(theme, scheme)), [theme, scheme])
  return <ThemeContext.Provider value={tokens}>{children}</ThemeContext.Provider>
}

/** Access the resolved design tokens for the current color scheme. */
export function useTheme(): Tokens {
  return useContext(ThemeContext)
}
