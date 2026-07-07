import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FormSheetShell from './FormSheetShell'
import SymbolIcon from './SymbolIcon'
import { useFormSheet } from '../lib/formSheetHost'
import { useTheme } from '../theme/ThemeProvider'

// The viewer's "Export & share" sheet (share button), presented via the native
// formSheet route (src/lib/formSheetHost.ts): a bottom sheet on phones, a
// centered narrow form sheet on tablets. The screen owns the async work
// (endpoint fetch, share sheet, Telegram push, error alerts); this component
// only tracks which action is busy and disables the rest. No ChordPro option
// by design.

type Busy = 'share' | 'pdf' | 'jpg' | 'telegram' | null

type ExportSheetProps = {
  visible: boolean
  onClose: () => void
  onShare: () => Promise<void>
  onExport: (format: 'pdf' | 'jpg') => Promise<void>
  onTelegram: () => Promise<void>
}

export default function ExportSheet(props: ExportSheetProps) {
  useFormSheet(props.visible, () => <ExportContent {...props} />, props.onClose)
  return null
}

function ExportContent({ onClose, onShare, onExport, onTelegram }: ExportSheetProps) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [busy, setBusy] = useState<Busy>(null)

  const run = (which: Exclude<Busy, null>, fn: () => Promise<void>) => async () => {
    if (busy) return
    setBusy(which)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  const disabledStyle = (which: Busy) => ({ opacity: busy && busy !== which ? 0.5 : 1 })

  return (
    <FormSheetShell title="Export & share" onAction={onClose}>
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom, gap: t.spacing.md }}>
        {/* Primary: system share sheet */}
        <Pressable
          onPress={run('share', onShare)}
          disabled={!!busy}
          accessibilityRole="button"
          accessibilityLabel="Open share sheet"
          style={[
            {
              height: 50,
              borderRadius: 13,
              backgroundColor: t.colors.accent,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: t.spacing.sm,
            },
            disabledStyle('share'),
          ]}
        >
          {busy === 'share' ? (
            <ActivityIndicator color={t.colors.onAccent} />
          ) : (
            <SymbolIcon name="square.and.arrow.up" size={19} color={t.colors.onAccent} />
          )}
          <Text style={{ fontSize: 16, fontWeight: '700', color: t.colors.onAccent }}>
            Open share sheet…
          </Text>
        </Pressable>

        {/* Format tiles */}
        <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
          {(
            [
              { format: 'pdf', label: 'PDF', icon: 'doc.text' },
              { format: 'jpg', label: 'JPG', icon: 'photo' },
            ] as const
          ).map((tile) => (
            <Pressable
              key={tile.format}
              onPress={run(tile.format, () => onExport(tile.format))}
              disabled={!!busy}
              accessibilityRole="button"
              accessibilityLabel={`Export as ${tile.label}`}
              style={[
                {
                  flex: 1,
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 14,
                  borderRadius: 13,
                  backgroundColor: t.colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: t.colors.border,
                },
                disabledStyle(tile.format),
              ]}
            >
              {busy === tile.format ? (
                <ActivityIndicator color={t.colors.accent} />
              ) : (
                <SymbolIcon name={tile.icon} size={24} color={t.colors.accent} />
              )}
              <Text style={{ fontSize: 13, fontWeight: '600', color: t.colors.ink }}>
                {tile.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Telegram */}
        <Pressable
          onPress={run('telegram', onTelegram)}
          disabled={!!busy}
          accessibilityRole="button"
          accessibilityLabel="Send to Telegram"
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 11,
              padding: t.spacing.md,
              borderRadius: 13,
              backgroundColor: t.colors.surfaceAlt,
              borderWidth: 1,
              borderColor: t.colors.border,
            },
            disabledStyle('telegram'),
          ]}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: t.colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {busy === 'telegram' ? (
              <ActivityIndicator size="small" color={t.colors.accent} />
            ) : (
              <SymbolIcon name="paperplane.fill" size={15} color={t.colors.accent} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.colors.ink }}>
              Send to Telegram
            </Text>
            <Text style={{ fontSize: 11.5, color: t.colors.muted }}>Optional bot</Text>
          </View>
          <SymbolIcon name="chevron.right" size={14} color={t.colors.muted} />
        </Pressable>
      </View>
    </FormSheetShell>
  )
}
