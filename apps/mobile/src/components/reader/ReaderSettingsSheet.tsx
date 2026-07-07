import { Pressable, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BottomSheet from '../BottomSheet'
import { useTheme } from '../../theme/ThemeProvider'
import { setStreakEnabled, useReadingStreak } from '../../lib/readingStreak'
import {
  READER_PT_MAX,
  READER_PT_MIN,
  type LineSpacing,
  type ReaderSettings,
  type Typeface,
  type VerseLayout,
} from '../../lib/useReader'

// Reader settings sheet (Daily Word screen 18): text size stepper, typeface,
// verse layout, and line spacing. All session-ephemeral — the screen owns the
// state and nothing persists across launches — EXCEPT the reading-streak
// opt-in at the bottom, which is a persisted device-local preference
// (src/lib/readingStreak.ts, read by Home's Daily Word card).

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; labelFontFamily?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  const t = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: t.colors.surfaceAlt,
        borderRadius: 12,
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
              flex: 1,
              paddingVertical: 9,
              borderRadius: 9,
              alignItems: 'center',
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

function OverlineLabel({ children, first }: { children: string; first?: boolean }) {
  const t = useTheme()
  return (
    <Text
      style={{
        fontSize: t.typography.overline.fontSize,
        fontWeight: t.typography.overline.fontWeight,
        letterSpacing: t.typography.overline.letterSpacing,
        textTransform: 'uppercase',
        color: t.colors.muted,
        marginTop: first ? 0 : t.spacing.xl,
        marginBottom: t.spacing.sm,
      }}
    >
      {children}
    </Text>
  )
}

export default function ReaderSettingsSheet({
  visible,
  onClose,
  settings,
  onChange,
}: {
  visible: boolean
  onClose: () => void
  settings: ReaderSettings
  onChange: (next: ReaderSettings) => void
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const streak = useReadingStreak()

  const stepPt = (dir: 1 | -1) => {
    const next = Math.min(READER_PT_MAX, Math.max(READER_PT_MIN, settings.pt + dir))
    onChange({ ...settings, pt: next })
  }
  const atMin = settings.pt <= READER_PT_MIN
  const atMax = settings.pt >= READER_PT_MAX

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Reader settings">
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom }}>
        <OverlineLabel first>Text size</OverlineLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <Pressable
            onPress={() => stepPt(-1)}
            disabled={atMin}
            accessibilityRole="button"
            accessibilityLabel="Smaller text"
            style={{
              flex: 1,
              height: 46,
              borderRadius: 12,
              backgroundColor: t.colors.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 4,
              opacity: atMin ? 0.35 : 1,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.colors.ink }}>A</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: t.colors.ink }}>−</Text>
          </Pressable>
          <Text
            style={{ minWidth: 44, textAlign: 'center', fontSize: 14, fontWeight: '600', color: t.colors.muted }}
          >
            {settings.pt} pt
          </Text>
          <Pressable
            onPress={() => stepPt(1)}
            disabled={atMax}
            accessibilityRole="button"
            accessibilityLabel="Larger text"
            style={{
              flex: 1,
              height: 46,
              borderRadius: 12,
              backgroundColor: t.colors.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 4,
              opacity: atMax ? 0.35 : 1,
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: '600', color: t.colors.ink }}>A</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: t.colors.ink }}>+</Text>
          </Pressable>
        </View>

        <OverlineLabel>Typeface</OverlineLabel>
        <Segmented<Typeface>
          options={[
            // Render "Serif" in the serif face it selects so the choice is
            // self-evident (matches the reading font — Georgia).
            { value: 'serif', label: 'Serif', labelFontFamily: 'Georgia' },
            { value: 'sans', label: 'Sans' },
          ]}
          value={settings.typeface}
          onChange={(v) => onChange({ ...settings, typeface: v })}
        />

        <OverlineLabel>Verse layout</OverlineLabel>
        <Segmented<VerseLayout>
          options={[
            { value: 'lines', label: 'Lines' },
            { value: 'prose', label: 'Prose' },
          ]}
          value={settings.layout}
          onChange={(v) => onChange({ ...settings, layout: v })}
        />

        <OverlineLabel>Line spacing</OverlineLabel>
        <Segmented<LineSpacing>
          options={[
            { value: 'tight', label: 'Tight' },
            { value: 'normal', label: 'Normal' },
            { value: 'relaxed', label: 'Relaxed' },
          ]}
          value={settings.lineSpacing}
          onChange={(v) => onChange({ ...settings, lineSpacing: v })}
        />

        <OverlineLabel>Reading streak</OverlineLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: t.colors.ink }}>Track reading streak</Text>
            <Text style={{ fontSize: 12.5, color: t.colors.muted, marginTop: 2 }}>
              Counts consecutive days you open today's reading.
            </Text>
          </View>
          <Switch
            value={streak.enabled}
            onValueChange={setStreakEnabled}
            trackColor={{ true: t.colors.accent }}
            accessibilityLabel="Track reading streak"
          />
        </View>
      </View>
    </BottomSheet>
  )
}
