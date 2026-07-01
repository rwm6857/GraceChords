import { Text, View } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'

// Sticky list section header — the A–Z letter, or "Key of G" when grouped by
// key. Painted with the page background so it stays opaque while pinned over the
// scrolling list.

export default function SectionHeader({ label }: { label: string }) {
  const t = useTheme()
  return (
    <View
      style={{
        backgroundColor: t.colors.bg,
        paddingTop: 7,
        paddingBottom: 4,
        paddingHorizontal: t.spacing.xl,
      }}
    >
      <Text
        style={{
          fontSize: t.typography.sectionHeader.fontSize,
          fontWeight: t.typography.sectionHeader.fontWeight,
          letterSpacing: t.typography.sectionHeader.letterSpacing,
          color: t.colors.muted,
        }}
      >
        {label}
      </Text>
    </View>
  )
}
