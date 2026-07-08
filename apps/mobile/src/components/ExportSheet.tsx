import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import FormSheetShell from './FormSheetShell'
import SymbolIcon, { type SymbolIconProps } from './SymbolIcon'
import { useFormSheet } from '../lib/formSheetHost'
import { useTheme } from '../theme/ThemeProvider'

// The viewer's "Export & share" sheet (share button), presented via the native
// formSheet route (src/lib/formSheetHost.ts): a bottom sheet on phones, a
// centered narrow form sheet on tablets. The screen owns the async work (export
// endpoint fetch, system share sheet, Telegram push, error alerts); this
// component only tracks which action is busy and disables the rest. PDF and
// JPG are equal side-by-side tiles — both export a file and open the system
// share sheet, just in different formats — so neither is a hero and there is
// no separate "share" button. No ChordPro option by design.

type Busy = 'pdf' | 'jpg' | 'telegram' | null

type ExportSheetProps = {
  visible: boolean
  onClose: () => void
  onExport: (format: 'pdf' | 'jpg') => Promise<void>
  onTelegram: () => Promise<void>
}

export default function ExportSheet(props: ExportSheetProps) {
  useFormSheet(props.visible, () => <ExportContent {...props} />, props.onClose)
  return null
}

function ExportContent({ onClose, onExport, onTelegram }: ExportSheetProps) {
  const t = useTheme()
  const { t: tx } = useTranslation('export')
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

  return (
    <FormSheetShell title={tx('title')} onAction={onClose}>
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom, gap: t.spacing.md }}>
        {/* Format tiles — PDF and JPG as equals; both open the share sheet. */}
        <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
          {(
            [
              { format: 'pdf', label: 'PDF', icon: 'doc.text' },
              { format: 'jpg', label: 'JPG', icon: 'photo' },
            ] as const
          ).map((tile) => (
            <FormatTile
              key={tile.format}
              label={tile.label}
              accessibilityLabel={tile.format === 'pdf' ? tx('exportAsPdf') : tx('exportAsJpg')}
              icon={tile.icon}
              busy={busy === tile.format}
              dimmed={!!busy && busy !== tile.format}
              disabled={!!busy}
              onPress={run(tile.format, () => onExport(tile.format))}
            />
          ))}
        </View>

        {/* Telegram */}
        <SecondaryRow
          label={tx('sendToTelegram')}
          subtitle={tx('optionalBot')}
          icon="paperplane.fill"
          busy={busy === 'telegram'}
          dimmed={!!busy && busy !== 'telegram'}
          disabled={!!busy}
          onPress={run('telegram', onTelegram)}
        />
      </View>
    </FormSheetShell>
  )
}

// Side-by-side export-format tile: accent icon over a short label, sized to
// share the row equally with its sibling. PDF and JPG use the same shape so
// the two formats read as equals.
function FormatTile({
  label,
  accessibilityLabel,
  icon,
  busy,
  dimmed,
  disabled,
  onPress,
}: {
  label: string
  accessibilityLabel: string
  icon: SymbolIconProps['name']
  busy: boolean
  dimmed: boolean
  disabled: boolean
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 6,
        paddingVertical: 14,
        borderRadius: 13,
        backgroundColor: t.colors.surfaceAlt,
        borderWidth: 1,
        borderColor: t.colors.border,
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator color={t.colors.accent} />
      ) : (
        <SymbolIcon name={icon} size={24} color={t.colors.accent} />
      )}
      <Text style={{ fontSize: 13, fontWeight: '600', color: t.colors.ink }}>{label}</Text>
    </Pressable>
  )
}

// Full-width secondary action row: accentSoft icon chip, label (+ optional
// subtitle), trailing chevron. Used for the Telegram row.
function SecondaryRow({
  label,
  subtitle,
  icon,
  busy,
  dimmed,
  disabled,
  onPress,
}: {
  label: string
  subtitle?: string
  icon: SymbolIconProps['name']
  busy: boolean
  dimmed: boolean
  disabled: boolean
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        padding: t.spacing.md,
        borderRadius: 13,
        backgroundColor: t.colors.surfaceAlt,
        borderWidth: 1,
        borderColor: t.colors.border,
        opacity: dimmed ? 0.5 : 1,
      }}
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
        {busy ? (
          <ActivityIndicator size="small" color={t.colors.accent} />
        ) : (
          <SymbolIcon name={icon} size={15} color={t.colors.accent} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.colors.ink }}>{label}</Text>
        {subtitle ? <Text style={{ fontSize: 11.5, color: t.colors.muted }}>{subtitle}</Text> : null}
      </View>
      <SymbolIcon name="chevron.right" size={14} color={t.colors.muted} />
    </Pressable>
  )
}
