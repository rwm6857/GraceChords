import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FormSheetShell from '../FormSheetShell'
import { useFormSheet } from '../../lib/formSheetHost'
import { useTheme } from '../../theme/ThemeProvider'

// Report a public reflection with an optional reason. Presented via the native
// formSheet route. On submit it calls back to the owner (which posts to the 2A
// report endpoint → admin Telegram alert, then auto-hides the post locally).
type ReportProps = {
  visible: boolean
  onClose: () => void
  onSubmit: (reason: string) => Promise<void>
}

const MAX_REASON = 500

export default function ReportReflectionSheet(props: ReportProps) {
  useFormSheet(props.visible, () => <ReportContent {...props} />, props.onClose)
  return null
}

function ReportContent({ onClose, onSubmit }: ReportProps) {
  const t = useTheme()
  const { t: tx } = useTranslation('reader')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onSubmit(reason.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormSheetShell title={tx('shared.reportTitle')} actionLabel={tx('shared.cancel')} onAction={onClose}>
      <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <TextInput
          value={reason}
          onChangeText={(v) => setReason(v.slice(0, MAX_REASON))}
          placeholder={tx('shared.reportReasonPlaceholder')}
          placeholderTextColor={t.colors.muted}
          multiline
          textAlignVertical="top"
          maxLength={MAX_REASON}
          style={{
            minHeight: 90,
            fontSize: 15,
            lineHeight: 21,
            color: t.colors.ink,
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: t.radii.md,
            padding: t.spacing.md,
          }}
        />
        <Pressable
          onPress={submit}
          disabled={busy}
          accessibilityRole="button"
          style={{
            height: 48,
            borderRadius: t.radii.md,
            backgroundColor: t.colors.danger,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color={t.colors.onDanger} />
          ) : (
            <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.onDanger }}>
              {tx('shared.reportSubmit')}
            </Text>
          )}
        </Pressable>
      </View>
    </FormSheetShell>
  )
}
