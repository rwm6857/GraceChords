import { useEffect, useRef, useState } from 'react'
import { Platform, View } from 'react-native'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FormSheetShell from '../FormSheetShell'
import { useFormSheet } from '../../lib/formSheetHost'
import { useTheme } from '../../theme/ThemeProvider'
import { usesTwentyFourHourClock } from '../../lib/readerReminder'

// Time picker for the Daily Word reminder — the platform's OWN time picker, not a
// hand-rolled stepper: iOS gets the UIDatePicker wheels (spinner) inside the
// native formSheet, Android the native clock dialog (DateTimePickerAndroid). Both
// come from @react-native-community/datetimepicker.
//
// iOS: the draft time is local to the sheet and committed on "Done" (so we don't
// reschedule the OS notification on every wheel tick); a swipe-dismiss discards
// it. Android's dialog owns its own OK/Cancel, so it commits on 'set' only.
//
// 12- vs 24-hour presentation follows the APP language (same Intl resolution as
// `formatReminderTime`), so the wheel and the Settings row always agree.

/** Standard UIDatePicker wheels height — the fitToContents sheet needs a
 * concrete height for the native picker rather than an intrinsic one. */
const IOS_WHEEL_HEIGHT = 216

type ReminderTimeProps = {
  visible: boolean
  onClose: () => void
  hour: number
  minute: number
  onConfirm: (hour: number, minute: number) => void
}

/** A local Date carrying only the reminder's hour/minute (today's date). */
function toDate(hour: number, minute: number): Date {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d
}

export default function ReminderTimeSheet(props: ReminderTimeProps) {
  // Platform.OS never changes at runtime, so this branch is stable.
  return Platform.OS === 'android' ? (
    <AndroidReminderTimeDialog {...props} />
  ) : (
    <ReminderTimeSheetIOS {...props} />
  )
}

function ReminderTimeSheetIOS(props: ReminderTimeProps) {
  useFormSheet(props.visible, () => <ReminderTimeContent {...props} />, props.onClose)
  return null
}

function ReminderTimeContent({ hour, minute, onConfirm, onClose }: ReminderTimeProps) {
  const t = useTheme()
  const { t: tx, i18n } = useTranslation(['settings', 'common'])
  const insets = useSafeAreaInsets()
  // Draft time — mounts from props on open, commits on Done.
  const [draft, setDraft] = useState(() => toDate(hour, minute))

  const confirm = () => {
    onConfirm(draft.getHours(), draft.getMinutes())
    onClose()
  }

  return (
    <FormSheetShell title={tx('reminder.timeSheetTitle')} onAction={confirm}>
      <View
        style={{
          paddingHorizontal: t.spacing.lg,
          paddingTop: t.spacing.sm,
          paddingBottom: t.spacing.md + insets.bottom,
        }}
      >
        <DateTimePicker
          mode="time"
          display="spinner"
          value={draft}
          // Drives 12h/24h + wheel order from the app language, not the device.
          locale={i18n.language}
          // Keeps the wheels legible when the user forces light/dark in Settings
          // (the picker would otherwise follow the OS scheme).
          themeVariant={t.mode}
          onChange={(_event, date) => {
            if (date) setDraft(date)
          }}
          accessibilityLabel={tx('reminder.time')}
          style={{ height: IOS_WHEEL_HEIGHT }}
        />
      </View>
    </FormSheetShell>
  )
}

function AndroidReminderTimeDialog({ visible, hour, minute, onConfirm, onClose }: ReminderTimeProps) {
  const { i18n } = useTranslation()
  // The dialog is imperative: open it once per `visible` transition and let its
  // own OK/Cancel close it (no formSheet involved).
  const openRef = useRef(false)
  const latest = useRef({ onConfirm, onClose })
  latest.current = { onConfirm, onClose }

  useEffect(() => {
    if (!visible) {
      openRef.current = false
      return
    }
    if (openRef.current) return
    openRef.current = true
    DateTimePickerAndroid.open({
      mode: 'time',
      value: toDate(hour, minute),
      is24Hour: usesTwentyFourHourClock(i18n.language),
      onChange: (event, date) => {
        if (event.type === 'set' && date) latest.current.onConfirm(date.getHours(), date.getMinutes())
        latest.current.onClose()
      },
    })
    // Intentionally keyed on `visible` alone — hour/minute/language are read
    // once, when the dialog opens, and the dialog owns the value from then on.
  }, [visible])

  return null
}
