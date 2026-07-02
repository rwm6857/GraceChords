import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'
import SymbolIcon from './SymbolIcon'

// The dense, text-only list row from the design: a title + optional subtitle on
// the left, and an optional two-line trailing block on the right (used for
// key / time signature). `trailing` renders a custom accessory after that
// block (e.g. the add-songs +/✓ badge). Density and scan-speed over decoration.
//
// The grouped Settings screen reuses this row with `leading` (an SF Symbol
// slot), a muted `value` string, a disclosure `chevron`, and `isLast` to drop
// the hairline on the final row inside a rounded Card group.

export type ListRowProps = {
  title: string
  subtitle?: string | null
  trailingTop?: string | null
  trailingBottom?: string | null
  /** Custom accessory rendered at the far right. */
  trailing?: ReactNode
  /** Leading accessory (e.g. an SF Symbol) rendered before the title. */
  leading?: ReactNode
  /** Muted trailing value text (settings rows: "English", "Letters"). */
  value?: string | null
  /** Show a disclosure chevron at the far right (navigation rows). */
  chevron?: boolean
  /** Drop the bottom hairline — use on the last row inside a grouped Card. */
  isLast?: boolean
  accessibilityLabel?: string
  onPress?: () => void
}

export default function ListRow({
  title,
  subtitle,
  trailingTop,
  trailingBottom,
  trailing,
  leading,
  value,
  chevron,
  isLast,
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
        borderBottomWidth: isLast ? 0 : 0.5,
        borderBottomColor: t.colors.border,
        backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
      })}
    >
      {leading}
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

      {value ? (
        <Text
          numberOfLines={1}
          style={{
            fontSize: t.typography.body.fontSize,
            color: t.colors.sec,
            maxWidth: '45%',
          }}
        >
          {value}
        </Text>
      ) : null}

      {trailing}

      {chevron ? <SymbolIcon name="chevron.right" size={14} color={t.colors.muted} /> : null}
    </Pressable>
  )
}
