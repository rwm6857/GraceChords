import { Pressable, Text, View } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'

// Compact, content-sized segmented control for inline setting-value rows
// (label left, control right-aligned). Matches the visual weight of the
// Font-size stepper and AccidentalToggle pill: a surfaceAlt track with
// content-hugging cells and an accent-filled selected cell — it does NOT
// stretch full width. Full-width segmented controls are reserved for
// view-switchers (e.g. "This song / Whole set").
export type SegmentedPillOption<T extends string> = {
  value: T
  label: string
  labelFontFamily?: string
}

export default function SegmentedPill<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentedPillOption<T>[]
  value: T
  onChange: (v: T) => void
}) {
  const t = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        backgroundColor: t.colors.surfaceAlt,
        borderRadius: 10,
        padding: 3,
      }}
    >
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{
              height: 30,
              paddingHorizontal: 12,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? t.colors.accent : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                fontFamily: opt.labelFontFamily,
                color: selected ? t.colors.onAccent : t.colors.sec,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
