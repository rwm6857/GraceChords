import { Pressable, Text, View } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'

// Compact, content-sized segmented control for inline setting-value rows
// (label left, control right-aligned). Matches the visual weight of the
// Font-size stepper and AccidentalToggle pill: a surfaceAlt track with
// content-hugging cells and an accent-filled selected cell — it does NOT
// stretch full width. Full-width segmented controls are reserved for
// view-switchers (e.g. "This song / Whole set").
export type SegmentedPillOption<T extends string | number> = {
  value: T
  label: string
  labelFontFamily?: string
}

export default function SegmentedPill<T extends string | number>({
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
      {options.map((opt, i) => {
        const selected = opt.value === value
        const first = i === 0
        const last = i === options.length - 1
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            // Reach the 44pt minimum touch target without changing the rendered
            // 30pt cell. Vertical is free: rows are spacing.xl (24) apart and the
            // cell sits inside 3pt of track padding, so vertically adjacent cells
            // are 30pt apart and 7pt each still leaves 16pt of clearance.
            //
            // Horizontal is NOT free, and this is why the slop is per-edge rather
            // than a scalar. Cells are flush siblings with a 0pt gap, so a
            // symmetric hitSlop would make each cell's region overlap its
            // neighbour's VISIBLE bounds — a tap 2pt inside one cell could select
            // the other, and which one wins depends on hit-test ordering. Giving
            // interior edges zero slop keeps every region disjoint (they share
            // only a zero-width boundary), so the outcome cannot be ambiguous.
            //
            // Only the track's outer edges expand, where the neighbour is the
            // row's label Text — non-interactive, and 12pt away.
            //
            // A consequence worth knowing: an interior cell reaches 44pt wide on
            // its own text width alone (24 + label). True for every label in every
            // shipped locale — the narrowest interior label is ko "보통" (~52pt) —
            // but a very short future translation of a 3-option pill's MIDDLE
            // option would need its own fix, since it can borrow no slop.
            hitSlop={{ top: 7, bottom: 7, left: first ? 12 : 0, right: last ? 12 : 0 }}
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
