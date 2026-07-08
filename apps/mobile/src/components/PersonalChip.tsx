import { Text, View } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'

// Tiny inline pills for the library / viewer: "Personal" (any owned draft) and
// "Pending" (submitted, awaiting review). Tokens only so both read correctly in
// light and dark.

export function PersonalChip() {
  const t = useTheme()
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: t.radii.pill,
        backgroundColor: t.colors.accentSoft,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '700', color: t.colors.textAccent }}>Personal</Text>
    </View>
  )
}

export function PendingBadge() {
  const t = useTheme()
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: t.radii.pill,
        backgroundColor: t.colors.surfaceAlt,
        borderWidth: 1,
        borderColor: t.colors.border,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '700', color: t.colors.muted }}>Pending</Text>
    </View>
  )
}

/** Pick the right chip for a personal song's status (null for catalog songs). */
export function songBadge(source: string | undefined, reviewStatus: string | undefined) {
  if (source !== 'personal') return null
  if (reviewStatus === 'submitted') return <PendingBadge />
  return <PersonalChip />
}
