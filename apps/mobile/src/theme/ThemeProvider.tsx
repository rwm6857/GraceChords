import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { getTokens, lightTokens, type Tokens } from '@gracechords/tokens/native'

// The app follows the system appearance (app.json userInterfaceStyle:
// "automatic"). ThemeProvider resolves the current scheme to the canonical
// token set from @gracechords/tokens and hands it down; components read it with
// useTheme(). Dark is the primary mode for stage use, but both are correct.

const ThemeContext = createContext<Tokens>(lightTokens)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme()
  const tokens = useMemo(() => getTokens(scheme === 'dark' ? 'dark' : 'light'), [scheme])
  return <ThemeContext.Provider value={tokens}>{children}</ThemeContext.Provider>
}

/** Access the resolved design tokens for the current color scheme. */
export function useTheme(): Tokens {
  return useContext(ThemeContext)
}
