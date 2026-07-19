import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FormSheetShell from '../FormSheetShell'
import SymbolIcon from '../SymbolIcon'
import { useFormSheet } from '../../lib/formSheetHost'
import { useTheme } from '../../theme/ThemeProvider'
import { formatReminderTime } from '../../lib/readerReminder'

// Time picker for the Daily Word reminder: a large localized preview over two
// stepper columns (hour 0–23, minute in 5-minute steps), both wrapping. Built on
// RN primitives — no extra native date-picker dep, matching DatePickerSheet.
// The draft time is local to the sheet and committed on "Done" (so we don't
// reschedule the OS notification on every tap); a swipe-dismiss discards it.

const MINUTE_STEP = 5

type ReminderTimeProps = {
  visible: boolean
  onClose: () => void
  hour: number
  minute: number
  onConfirm: (hour: number, minute: number) => void
}

export default function ReminderTimeSheet(props: ReminderTimeProps) {
  useFormSheet(props.visible, () => <ReminderTimeContent {...props} />, props.onClose)
  return null
}

function StepperColumn({
  label,
  display,
  onUp,
  onDown,
  upLabel,
  downLabel,
}: {
  label: string
  display: string
  onUp: () => void
  onDown: () => void
  upLabel: string
  downLabel: string
}) {
  const t = useTheme()
  const Button = ({ dir, acc }: { dir: -1 | 1; acc: string }) => (
    <Pressable
      onPress={dir < 0 ? onDown : onUp}
      accessibilityRole="button"
      accessibilityLabel={acc}
      style={{
        width: 56,
        height: 40,
        borderRadius: 12,
        backgroundColor: t.colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SymbolIcon name={dir < 0 ? 'chevron.down' : 'chevron.up'} size={15} color={t.colors.ink} weight="semibold" />
    </Pressable>
  )
  return (
    <View style={{ alignItems: 'center', gap: t.spacing.sm }}>
      <Text
        style={{
          fontSize: t.typography.overline.fontSize,
          fontWeight: t.typography.overline.fontWeight,
          letterSpacing: t.typography.overline.letterSpacing,
          textTransform: 'uppercase',
          color: t.colors.muted,
        }}
      >
        {label}
      </Text>
      <Button dir={1} acc={upLabel} />
      <Text style={{ minWidth: 56, textAlign: 'center', fontSize: 30, fontWeight: '700', color: t.colors.ink }}>
        {display}
      </Text>
      <Button dir={-1} acc={downLabel} />
    </View>
  )
}

function ReminderTimeContent({ hour, minute, onConfirm, onClose }: ReminderTimeProps) {
  const t = useTheme()
  const { t: tx, i18n } = useTranslation(['settings', 'common'])
  const insets = useSafeAreaInsets()
  // Draft time — mounts from props on open, commits on Done.
  const [draft, setDraft] = useState({ hour, minute })

  const stepHour = (dir: 1 | -1) => setDraft((d) => ({ ...d, hour: (d.hour + dir + 24) % 24 }))
  const stepMinute = (dir: 1 | -1) =>
    setDraft((d) => ({ ...d, minute: (d.minute + dir * MINUTE_STEP + 60) % 60 }))

  const confirm = () => {
    onConfirm(draft.hour, draft.minute)
    onClose()
  }

  return (
    <FormSheetShell title={tx('reminder.timeSheetTitle')} onAction={confirm}>
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom, alignItems: 'center' }}>
        <Text style={{ fontSize: 34, fontWeight: '800', letterSpacing: -0.5, color: t.colors.textAccent }}>
          {formatReminderTime(draft.hour, draft.minute, i18n.language)}
        </Text>
        <View style={{ flexDirection: 'row', gap: t.spacing.xxl, marginTop: t.spacing.xl }}>
          <StepperColumn
            label={tx('reminder.hour')}
            display={String(draft.hour).padStart(2, '0')}
            onUp={() => stepHour(1)}
            onDown={() => stepHour(-1)}
            upLabel={tx('reminder.increaseHour')}
            downLabel={tx('reminder.decreaseHour')}
          />
          <StepperColumn
            label={tx('reminder.minute')}
            display={String(draft.minute).padStart(2, '0')}
            onUp={() => stepMinute(1)}
            onDown={() => stepMinute(-1)}
            upLabel={tx('reminder.increaseMinute')}
            downLabel={tx('reminder.decreaseMinute')}
          />
        </View>
      </View>
    </FormSheetShell>
  )
}
