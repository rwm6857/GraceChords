import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FormSheetShell from '../FormSheetShell'
import SymbolIcon, { type SymbolIconProps } from '../SymbolIcon'
import { useFormSheet } from '../../lib/formSheetHost'
import { useTheme } from '../../theme/ThemeProvider'

// The setlist "Export & share" sheet (modeled on the viewer's ExportSheet),
// presented via the native formSheet route (src/lib/formSheetHost.ts).
// Set PDF, Copy link, and Telegram work today (the same combined-PDF export the
// Performer uses, via /api/export/setlist). Only the Charts ZIP / ChordPro
// exports still need backend endpoints that don't exist yet, so those two tiles
// render disabled as "Coming soon".

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

  const disabledTile = (label: string, icon: SymbolIconProps['name']) => (
    <View
      key={label}
      accessibilityLabel={`${label} — coming soon`}
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 6,
        paddingVertical: 14,
        borderRadius: 13,
        backgroundColor: t.colors.surfaceAlt,
        borderWidth: 1,
        borderColor: t.colors.border,
        opacity: 0.45,
      }}
    >
      <SymbolIcon name={icon} size={24} color={t.colors.accent} />
      <Text style={{ fontSize: 13, fontWeight: '600', color: t.colors.ink }}>{label}</Text>
      <Text style={{ fontSize: 10.5, color: t.colors.muted }}>Coming soon</Text>
    </View>
  )

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
            <SymbolIcon name="square.and.arrow.down" size={19} color={t.colors.onAccent} />
          )}
          <Text style={{ fontSize: 16, fontWeight: '700', color: t.colors.onAccent }}>
            Export set as PDF · {songCount} {songCount === 1 ? 'song' : 'songs'}
          </Text>
        </Pressable>

        <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
          {disabledTile('Charts ZIP', 'folder')}
          {disabledTile('ChordPro', 'music.note.list')}

          {/* Copy link — works today via the web setlist URL. */}
          <Pressable
            onPress={run('link', onCopyLink)}
            disabled={!!busy}
            accessibilityRole="button"
            accessibilityLabel="Copy set link"
            style={{
              flex: 1,
              alignItems: 'center',
              gap: 6,
              paddingVertical: 14,
              borderRadius: 13,
              backgroundColor: t.colors.surfaceAlt,
              borderWidth: 1,
              borderColor: t.colors.border,
              opacity: busy && busy !== 'link' ? 0.5 : 1,
            }}
          >
            {busy === 'link' ? (
              <ActivityIndicator color={t.colors.accent} />
            ) : (
              <SymbolIcon name="link" size={24} color={t.colors.accent} />
            )}
            <Text style={{ fontSize: 13, fontWeight: '600', color: t.colors.ink }}>Copy link</Text>
          </Pressable>
        </View>

        {/* Telegram */}
        <Pressable
          onPress={run('telegram', onTelegram)}
          disabled={!!busy}
          accessibilityRole="button"
          accessibilityLabel="Send set to Telegram"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 11,
            padding: t.spacing.md,
            borderRadius: 13,
            backgroundColor: t.colors.surfaceAlt,
            borderWidth: 1,
            borderColor: t.colors.border,
            opacity: busy && busy !== 'telegram' ? 0.5 : 1,
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
            {busy === 'telegram' ? (
              <ActivityIndicator size="small" color={t.colors.accent} />
            ) : (
              <SymbolIcon name="paperplane.fill" size={15} color={t.colors.accent} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.colors.ink }}>
              Send set to Telegram
            </Text>
            <Text style={{ fontSize: 11.5, color: t.colors.muted }}>Optional bot</Text>
          </View>
          <SymbolIcon name="chevron.right" size={14} color={t.colors.muted} />
        </Pressable>
      </View>
    </FormSheetShell>
  )
}
