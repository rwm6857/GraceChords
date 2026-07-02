import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BottomSheet from '../BottomSheet'
import SymbolIcon, { type SymbolIconProps } from '../SymbolIcon'
import { useTheme } from '../../theme/ThemeProvider'

// The setlist "Export & share" sheet (modeled on the viewer's ExportSheet).
// Copy link and Telegram work today; the set-PDF / Charts ZIP / ChordPro
// exports need backend endpoints that don't exist yet, so those tiles render
// disabled as "Coming soon" (a later pass, alongside the Setlist Viewer's
// export work).

type Busy = 'link' | 'telegram' | null

export default function ShareSetSheet({
  visible,
  onClose,
  songCount,
  onCopyLink,
  onTelegram,
}: {
  visible: boolean
  onClose: () => void
  songCount: number
  onCopyLink: () => Promise<void>
  onTelegram: () => Promise<void>
}) {
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
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Export & share"
      closeAccessibilityLabel="Close export and share"
    >
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom, gap: t.spacing.md }}>
        {/* Primary set-PDF export — endpoint not built yet. */}
        <View
          accessibilityLabel="Export set as PDF — coming soon"
          style={{
            height: 50,
            borderRadius: 13,
            backgroundColor: t.colors.accent,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: t.spacing.sm,
            opacity: 0.45,
          }}
        >
          <SymbolIcon name="square.and.arrow.down" size={19} color={t.colors.onAccent} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: t.colors.onAccent }}>
            Export set as PDF · {songCount} {songCount === 1 ? 'song' : 'songs'} (soon)
          </Text>
        </View>

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
    </BottomSheet>
  )
}
