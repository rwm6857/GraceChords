import { Platform, Pressable, Text, View } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'

// Compact, content-sized segmented control for inline setting-value rows
// (label left, control right-aligned). Matches the visual weight of the
// Font-size stepper and AccidentalToggle pill: a surfaceAlt track with
// content-hugging cells and an accent-filled selected cell — it does NOT
// stretch full width. Full-width segmented controls are reserved for
// view-switchers (e.g. "This song / Whole set").
//
// ANDROID renders Material 3's segmented button: an OUTLINED track rather than
// a filled one, 40dp tall, fully rounded outer ends with square interior edges,
// a 1dp divider between cells, and a ripple state layer.
//
// It keeps the SOLID ACCENT FILL for the selected cell rather than taking MD3's
// pale `secondaryContainer` tint, and that deviation is deliberate. MD3's tint
// only works because the spec pairs it with a check icon on the selected
// segment; the tint alone is not the indicator. Reserving an icon slot on every
// cell (needed, or the control changes width as the selection moves) costs
// ~22dp per segment, and the tightest case here is a THREE-segment pill sharing
// a row with its own label in ko/tr/es — Reader settings. Taking the tint and
// dropping the icon is the one combination that does not work:
//
//   accentSoft vs surface  = 1.23:1 light / 1.24:1 dark
//   accent     vs surface  = 4.04:1 light / 6.03:1 dark
//
// WCAG 1.4.11 wants 3:1 for an indicator that carries meaning, so the tint would
// leave selection resting almost entirely on label colour — weaker than what
// ships today, on the one control whose whole job is showing what is active
// (and this component has no Differentiate-Without-Color cue to fall back on).
// The SHAPE is what makes it read as Material; the fill is what makes it
// readable. lib/__tests__/contrast.test.ts pins the ratio.
export type SegmentedPillOption<T extends string | number> = {
  value: T
  label: string
  labelFontFamily?: string
}

/** MD3 segmented button: 40dp tall, so 38 between the 1dp outline. */
const ANDROID_CELL_HEIGHT = 38
const IOS_CELL_HEIGHT = 30

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
  const isAndroid = Platform.OS === 'android'
  const cellHeight = isAndroid ? ANDROID_CELL_HEIGHT : IOS_CELL_HEIGHT
  // Reach the platform's minimum touch target (48dp Material / 44pt HIG) from
  // the rendered cell height, without changing that height.
  const verticalSlop = isAndroid ? 5 : 7
  return (
    <View
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        backgroundColor: isAndroid ? 'transparent' : t.colors.surfaceAlt,
        borderRadius: isAndroid ? (ANDROID_CELL_HEIGHT + 2) / 2 : 10,
        padding: isAndroid ? 0 : 3,
        // The outline IS the Material track; it also clips the selected cell's
        // fill to the rounded outer ends.
        ...(isAndroid
          ? { borderWidth: 1, borderColor: t.colors.border, overflow: 'hidden' as const }
          : null),
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
            // Material's state layer, from the platform theme
            // (?attr/colorControlHighlight) so it follows light/dark on its own.
            // iOS ignores this prop entirely.
            android_ripple={{ borderless: false, foreground: true }}
            // Reach the minimum touch target without changing the rendered cell.
            // Vertical is free: rows are spacing.xl (24) apart and the cell sits
            // inside the track, so vertically adjacent cells stay well clear.
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
            hitSlop={{
              top: verticalSlop,
              bottom: verticalSlop,
              left: first ? 12 : 0,
              right: last ? 12 : 0,
            }}
            style={{
              height: cellHeight,
              paddingHorizontal: 12,
              borderRadius: isAndroid ? 0 : 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? t.colors.accent : 'transparent',
              // MD3 joins the segments with a divider rather than spacing them.
              ...(isAndroid && !first
                ? { borderLeftWidth: 1, borderLeftColor: t.colors.border }
                : null),
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                fontFamily: opt.labelFontFamily,
                color: selected
                  ? t.colors.onAccent
                  : isAndroid
                    ? t.colors.ink
                    : t.colors.sec,
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
