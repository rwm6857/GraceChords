import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BottomSheet from '../BottomSheet'
import SymbolIcon from '../SymbolIcon'
import { useTheme } from '../../theme/ThemeProvider'

// Date picker for browsing the reading plan (today + other days). Mirrors the
// [UI] Daily Word floating calendar: a month grid with prev/next navigation and
// a Today shortcut. Built on RN primitives — no extra native date-picker dep.

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function DatePickerSheet({
  visible,
  onClose,
  value,
  onSelect,
}: {
  visible: boolean
  onClose: () => void
  value: Date
  onSelect: (date: Date) => void
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const today = new Date()

  // The month currently on screen (resets to the selected date each open).
  const [view, setView] = useState({ year: value.getFullYear(), month: value.getMonth() })
  useEffect(() => {
    if (visible) setView({ year: value.getFullYear(), month: value.getMonth() })
  }, [visible, value])

  const firstDow = new Date(view.year, view.month, 1).getDay()
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  const shiftMonth = (delta: number) => {
    const next = new Date(view.year, view.month + delta, 1)
    setView({ year: next.getFullYear(), month: next.getMonth() })
  }

  const pick = (day: number) => onSelect(new Date(view.year, view.month, day))

  const NavButton = ({ dir, label }: { dir: -1 | 1; label: string }) => (
    <Pressable
      onPress={() => shiftMonth(dir)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 30,
        height: 30,
        borderRadius: t.radii.pill,
        backgroundColor: t.colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SymbolIcon name={dir < 0 ? 'chevron.left' : 'chevron.right'} size={13} color={t.colors.ink} weight="semibold" />
    </Pressable>
  )

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Select date"
      actionLabel="Today"
      onAction={() => onSelect(new Date())}
    >
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom }}>
        {/* Month header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: t.spacing.md,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', letterSpacing: -0.2, color: t.colors.ink }}>
            {MONTHS[view.month]} {view.year}
          </Text>
          <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
            <NavButton dir={-1} label="Previous month" />
            <NavButton dir={1} label="Next month" />
          </View>
        </View>

        {/* Weekday row */}
        <View style={{ flexDirection: 'row', marginBottom: t.spacing.xs }}>
          {WEEKDAYS.map((d, i) => (
            <Text
              key={i}
              style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: t.colors.muted }}
            >
              {d}
            </Text>
          ))}
        </View>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <View key={wi} style={{ flexDirection: 'row' }}>
            {week.map((day, di) => {
              if (day == null) return <View key={di} style={{ flex: 1, height: 40 }} />
              const cellDate = new Date(view.year, view.month, day)
              const isSelected = sameDay(cellDate, value)
              const isToday = sameDay(cellDate, today)
              return (
                <Pressable
                  key={di}
                  onPress={() => pick(day)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={{ flex: 1, height: 40, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: t.radii.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected ? t.colors.accent : 'transparent',
                      borderWidth: !isSelected && isToday ? 1 : 0,
                      borderColor: t.colors.accent,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: isSelected || isToday ? '700' : '400',
                        color: isSelected ? t.colors.onAccent : isToday ? t.colors.textAccent : t.colors.ink,
                      }}
                    >
                      {day}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>
    </BottomSheet>
  )
}
