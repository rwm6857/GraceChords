import { useEffect, useRef } from 'react'
import { ActivityIndicator, Animated, Text, View } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'

// The "Loading · spinner · skeleton" component from [DOC] Components &
// Foundations: a syncing label with a spinner over shimmering placeholder
// rows (title + subtitle bars and a trailing chip), used while list data
// loads. The reference's moving-gradient shimmer is translated to a subtle
// opacity pulse (HIG-friendly, no gradient/asset dependency).

// Title/subtitle bar widths per the reference's skeleton data.
const ROWS = [
  { title: '70%', sub: '45%' },
  { title: '58%', sub: '38%' },
  { title: '66%', sub: '42%' },
  { title: '52%', sub: '34%' },
  { title: '62%', sub: '40%' },
] as const

export default function LoadingSkeleton({ label = 'Loading…' }: { label?: string }) {
  const t = useTheme()
  const pulse = useRef(new Animated.Value(0.45)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  const bar = (width: string, height: number) => (
    <Animated.View
      style={{
        width: width as `${number}%`,
        height,
        borderRadius: 4,
        backgroundColor: t.colors.surfaceAlt,
        opacity: pulse,
      }}
    />
  )

  return (
    <View style={{ paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: t.spacing.lg }}>
        <ActivityIndicator size="small" color={t.colors.accent} />
        <Text style={{ fontSize: 13, color: t.colors.muted }}>{label}</Text>
      </View>

      {ROWS.map((row, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 11,
            borderBottomWidth: 0.5,
            borderBottomColor: t.colors.border,
          }}
        >
          <View style={{ flex: 1, gap: 8 }}>
            {bar(row.title, 13)}
            {bar(row.sub, 11)}
          </View>
          <Animated.View
            style={{
              width: 24,
              height: 13,
              borderRadius: 4,
              backgroundColor: t.colors.surfaceAlt,
              opacity: pulse,
            }}
          />
        </View>
      ))}
    </View>
  )
}
