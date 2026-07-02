import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'

// The dense, text-only list row from the design: a title + optional subtitle on
// the left, and an optional two-line trailing block on the right (used for
// key / time signature). `trailing` renders a custom accessory after that
// block (e.g. the add-songs +/✓ badge). Density and scan-speed over decoration.

export type ListRowProps = {
  title: string
  subtitle?: string | null
  trailingTop?: string | null
  trailingBottom?: string | null
  /** Custom accessory rendered at the far right. */
  trailing?: ReactNode
  accessibilityLabel?: string
  onPress?: () => void
}

export default function ListRow({
  title,
  subtitle,
  trailingTop,
  trailingBottom,
  trailing,
  accessibilityLabel,
  onPress,
}: ListRowProps) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingVertical: 11,
        paddingHorizontal: t.spacing.xl,
        borderBottomWidth: 0.5,
        borderBottomColor: t.colors.border,
        backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: t.typography.rowTitle.fontSize,
            fontWeight: t.typography.rowTitle.fontWeight,
            letterSpacing: t.typography.rowTitle.letterSpacing,
            color: t.colors.ink,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{
              marginTop: 2,
              fontSize: t.typography.rowSubtitle.fontSize,
              color: t.colors.sec,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailingTop || trailingBottom ? (
        <View style={{ alignItems: 'flex-end', minWidth: 30 }}>
          {trailingTop ? (
            <Text
              style={{
                fontSize: t.typography.rowKey.fontSize,
                fontWeight: t.typography.rowKey.fontWeight,
                color: t.colors.textAccent,
              }}
            >
              {trailingTop}
            </Text>
          ) : null}
          {trailingBottom ? (
            <Text
              style={{
                marginTop: 2,
                fontSize: t.typography.rowMeta.fontSize,
                color: t.colors.muted,
              }}
            >
              {trailingBottom}
            </Text>
          ) : null}
        </View>
      ) : null}

      {trailing}
    </Pressable>
  )
}
