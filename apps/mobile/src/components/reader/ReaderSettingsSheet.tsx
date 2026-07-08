import type { ReactNode } from 'react'
import { Pressable, Switch, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import FormSheetShell from '../FormSheetShell'
import SegmentedPill from '../SegmentedPill'
import { useFormSheet } from '../../lib/formSheetHost'
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

// Inline setting-value row: label left, control right-aligned and content-sized.
// `stack` puts the control on its own line below the label — used on narrow
// iPhone widths where a 3-option control would collide with its label.
function SettingRow({ label, stack, children }: { label: string; stack?: boolean; children: ReactNode }) {
  const t = useTheme()
  if (stack) {
    return (
      <View style={{ marginTop: t.spacing.xl }}>
        <Text style={{ fontSize: 16, color: t.colors.ink, marginBottom: t.spacing.sm }}>{label}</Text>
        {children}
      </View>
    )
  }
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: t.spacing.md,
        marginTop: t.spacing.xl,
      }}
    >
      <Text style={{ fontSize: 16, color: t.colors.ink }}>{label}</Text>
      {children}
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

type ReaderSettingsProps = {
  visible: boolean
  onClose: () => void
  settings: ReaderSettings
  onChange: (next: ReaderSettings) => void
}

export default function ReaderSettingsSheet(props: ReaderSettingsProps) {
  useFormSheet(props.visible, () => <ReaderSettingsContent {...props} />, props.onClose)
  return null
}

function ReaderSettingsContent({ onClose, settings, onChange }: ReaderSettingsProps) {
  const t = useTheme()
  const { t: tx } = useTranslation('reader')
  const insets = useSafeAreaInsets()
  const streak = useReadingStreak()
  // On narrow iPhone widths the 3-option Line spacing control would collide
  // with its label, so that row stacks. 2-option rows stay inline everywhere.
  const { width } = useWindowDimensions()
  const stackWide = width < 380

  const stepPt = (dir: 1 | -1) => {
    const next = Math.min(READER_PT_MAX, Math.max(READER_PT_MIN, settings.pt + dir))
    onChange({ ...settings, pt: next })
  }
  const atMin = settings.pt <= READER_PT_MIN
  const atMax = settings.pt >= READER_PT_MAX

  return (
    <FormSheetShell title={tx('settings.title')} onAction={onClose}>
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom }}>
        <OverlineLabel first>{tx('settings.textSize')}</OverlineLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <Pressable
            onPress={() => stepPt(-1)}
            disabled={atMin}
            accessibilityRole="button"
            accessibilityLabel={tx('settings.smallerText')}
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
            {tx('settings.pt', { pt: settings.pt })}
          </Text>
          <Pressable
            onPress={() => stepPt(1)}
            disabled={atMax}
            accessibilityRole="button"
            accessibilityLabel={tx('settings.largerText')}
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

        <SettingRow label={tx('settings.typeface')}>
          <SegmentedPill<Typeface>
            options={[
              // Render "Serif" in the serif face it selects so the choice is
              // self-evident (matches the reading font — Georgia).
              { value: 'serif', label: tx('settings.serif'), labelFontFamily: 'Georgia' },
              { value: 'sans', label: tx('settings.sans') },
            ]}
            value={settings.typeface}
            onChange={(v) => onChange({ ...settings, typeface: v })}
          />
        </SettingRow>

        <SettingRow label={tx('settings.verseLayout')}>
          <SegmentedPill<VerseLayout>
            options={[
              { value: 'lines', label: tx('settings.lines') },
              { value: 'prose', label: tx('settings.prose') },
            ]}
            value={settings.layout}
            onChange={(v) => onChange({ ...settings, layout: v })}
          />
        </SettingRow>

        <SettingRow label={tx('settings.lineSpacing')} stack={stackWide}>
          <SegmentedPill<LineSpacing>
            options={[
              { value: 'tight', label: tx('settings.tight') },
              { value: 'normal', label: tx('settings.normal') },
              { value: 'relaxed', label: tx('settings.relaxed') },
            ]}
            value={settings.lineSpacing}
            onChange={(v) => onChange({ ...settings, lineSpacing: v })}
          />
        </SettingRow>

        <OverlineLabel>{tx('settings.readingStreak')}</OverlineLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: t.colors.ink }}>{tx('settings.trackReadingStreak')}</Text>
            <Text style={{ fontSize: 12.5, color: t.colors.muted, marginTop: 2 }}>
              {tx('settings.trackReadingStreakDesc')}
            </Text>
          </View>
          <Switch
            value={streak.enabled}
            onValueChange={setStreakEnabled}
            trackColor={{ true: t.colors.accent }}
            accessibilityLabel={tx('settings.trackReadingStreak')}
          />
        </View>
      </View>
    </FormSheetShell>
  )
}
