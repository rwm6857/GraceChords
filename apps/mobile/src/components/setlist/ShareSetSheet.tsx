import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FormSheetShell from '../FormSheetShell'
import SymbolIcon, { type SymbolIconProps } from '../SymbolIcon'
import { useFormSheet } from '../../lib/formSheetHost'
import { useTheme } from '../../theme/ThemeProvider'

// The setlist "Export & share" sheet (modeled on the viewer's ExportSheet),
// presented via the native formSheet route (src/lib/formSheetHost.ts). This is
// the builder version — whole-set only, no This song / Whole set scope toggle.
// Set PDF, Copy link, and Telegram all work today (the same combined-PDF export
// the Performer uses, via /api/export/setlist). PDF is the primary (blue)
// action; Copy link and Telegram are full-width secondary rows.

type Busy = 'pdf' | 'link' | 'telegram' | null

type ShareSetProps = {
  visible: boolean
  onClose: () => void
  songCount: number
  onExport: () => Promise<void>
  onCopyLink: () => Promise<void>
  onTelegram: () => Promise<void>
}

export default function ShareSetSheet(props: ShareSetProps) {
  useFormSheet(props.visible, () => <ShareSetContent {...props} />, props.onClose)
  return null
}

function ShareSetContent({ onClose, songCount, onExport, onCopyLink, onTelegram }: ShareSetProps) {
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

  return (
    <FormSheetShell title="Export & share" onAction={onClose}>
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom, gap: t.spacing.md }}>
        {/* Primary set-PDF export — combined PDF via /api/export/setlist. */}
        <Pressable
          onPress={run('pdf', onExport)}
          disabled={!!busy}
          accessibilityRole="button"
          accessibilityLabel="Export set as PDF"
          style={{
            height: 50,
            borderRadius: 13,
            backgroundColor: t.colors.accent,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: t.spacing.sm,
            opacity: busy && busy !== 'pdf' ? 0.5 : 1,
          }}
        >
          {busy === 'pdf' ? (
            <ActivityIndicator color={t.colors.onAccent} />
          ) : (
            <SymbolIcon name="square.and.arrow.up" size={19} color={t.colors.onAccent} />
          )}
          <Text style={{ fontSize: 16, fontWeight: '700', color: t.colors.onAccent }}>
            Export set as PDF · {songCount} {songCount === 1 ? 'song' : 'songs'}
          </Text>
        </Pressable>

        {/* Copy link — works today via the web setlist URL. */}
        <SecondaryRow
          label="Copy link"
          icon="link"
          busy={busy === 'link'}
          dimmed={!!busy && busy !== 'link'}
          disabled={!!busy}
          onPress={run('link', onCopyLink)}
        />

        {/* Telegram */}
        <SecondaryRow
          label="Send set to Telegram"
          subtitle="Optional bot"
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

// Full-width secondary action row: accentSoft icon chip, label (+ optional
// subtitle), trailing chevron. Shared shape for the Copy link and Telegram rows.
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
