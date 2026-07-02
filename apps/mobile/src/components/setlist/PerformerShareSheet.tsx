import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BottomSheet from '../BottomSheet'
import SymbolIcon, { type SymbolIconProps } from '../SymbolIcon'
import { useTheme } from '../../theme/ThemeProvider'

// Performer "Export & share" sheet with a This song / Whole set scope toggle.
// This-song mirrors the Song Viewer's ExportSheet (system share + PDF/JPG +
// Telegram, no ChordPro). Whole-set offers the combined PDF (server endpoint),
// Copy link and Telegram — all working today — with Charts ZIP / ChordPro /
// Set list rendered disabled ("Coming soon") pending backends. The screen owns
// the async work and error alerts; this component only tracks which action is
// busy.

type Scope = 'song' | 'set'
type Busy = string | null

export type PerformerShareHandlers = {
  // This song
  onShareSong: () => Promise<void>
  onExportSong: (format: 'pdf' | 'jpg') => Promise<void>
  onTelegramSong: () => Promise<void>
  // Whole set
  onExportSet: () => Promise<void>
  onCopyLink: () => Promise<void>
  onTelegramSet: () => Promise<void>
}

export default function PerformerShareSheet({
  visible,
  onClose,
  songCount,
  initialScope,
  handlers,
}: {
  visible: boolean
  onClose: () => void
  songCount: number
  /** Defaults the toggle: whole set for multi-song, this song otherwise. */
  initialScope: Scope
  handlers: PerformerShareHandlers
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [scope, setScope] = useState<Scope>(initialScope)
  const [busy, setBusy] = useState<Busy>(null)

  // Re-seed the scope each time the sheet opens (single-song sets shouldn't
  // land on "Whole set").
  useEffect(() => {
    if (visible) setScope(initialScope)
  }, [visible, initialScope])

  const run = (which: string, fn: () => Promise<void>) => async () => {
    if (busy) return
    setBusy(which)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  const primaryButton = (label: string, icon: SymbolIconProps['name'], which: string, fn: () => Promise<void>) => (
    <Pressable
      onPress={run(which, fn)}
      disabled={!!busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        height: 50,
        borderRadius: 13,
        backgroundColor: t.colors.accent,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.spacing.sm,
        opacity: busy && busy !== which ? 0.5 : 1,
      }}
    >
      {busy === which ? (
        <ActivityIndicator color={t.colors.onAccent} />
      ) : (
        <SymbolIcon name={icon} size={19} color={t.colors.onAccent} />
      )}
      <Text style={{ fontSize: 16, fontWeight: '700', color: t.colors.onAccent }}>{label}</Text>
    </Pressable>
  )

  const actionTile = (label: string, icon: SymbolIconProps['name'], which: string, fn: () => Promise<void>) => (
    <Pressable
      key={label}
      onPress={run(which, fn)}
      disabled={!!busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 6,
        paddingVertical: 14,
        borderRadius: 13,
        backgroundColor: t.colors.surfaceAlt,
        borderWidth: 1,
        borderColor: t.colors.border,
        opacity: busy && busy !== which ? 0.5 : 1,
      }}
    >
      {busy === which ? (
        <ActivityIndicator color={t.colors.accent} />
      ) : (
        <SymbolIcon name={icon} size={24} color={t.colors.accent} />
      )}
      <Text style={{ fontSize: 13, fontWeight: '600', color: t.colors.ink }}>{label}</Text>
    </Pressable>
  )

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

  const telegramRow = (label: string, which: string, fn: () => Promise<void>) => (
    <Pressable
      onPress={run(which, fn)}
      disabled={!!busy}
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
        opacity: busy && busy !== which ? 0.5 : 1,
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
        {busy === which ? (
          <ActivityIndicator size="small" color={t.colors.accent} />
        ) : (
          <SymbolIcon name="paperplane.fill" size={15} color={t.colors.accent} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.colors.ink }}>{label}</Text>
        <Text style={{ fontSize: 11.5, color: t.colors.muted }}>Optional bot</Text>
      </View>
      <SymbolIcon name="chevron.right" size={14} color={t.colors.muted} />
    </Pressable>
  )

  const segment = (value: Scope, label: string) => {
    const active = scope === value
    return (
      <Pressable
        onPress={() => setScope(value)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={{
          flex: 1,
          height: 34,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? t.colors.surface : 'transparent',
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: active ? t.colors.ink : t.colors.sec }}>
          {label}
        </Text>
      </Pressable>
    )
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Export & share"
      closeAccessibilityLabel="Close export and share"
    >
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom, gap: t.spacing.md }}>
        {/* Scope toggle */}
        <View
          style={{
            flexDirection: 'row',
            padding: 3,
            borderRadius: 10,
            backgroundColor: t.colors.surfaceAlt,
          }}
        >
          {segment('song', 'This song')}
          {segment('set', 'Whole set')}
        </View>

        {scope === 'song' ? (
          <>
            {primaryButton('Open share sheet…', 'square.and.arrow.up', 'song-share', handlers.onShareSong)}
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              {actionTile('PDF', 'doc.text', 'song-pdf', () => handlers.onExportSong('pdf'))}
              {actionTile('JPG', 'photo', 'song-jpg', () => handlers.onExportSong('jpg'))}
            </View>
            {telegramRow('Send to Telegram', 'song-telegram', handlers.onTelegramSong)}
          </>
        ) : (
          <>
            {primaryButton(
              `Export set as PDF · ${songCount} ${songCount === 1 ? 'song' : 'songs'}`,
              'square.and.arrow.down',
              'set-pdf',
              handlers.onExportSet,
            )}
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              {disabledTile('Charts ZIP', 'folder')}
              {disabledTile('ChordPro', 'music.note.list')}
              {actionTile('Copy link', 'link', 'set-link', handlers.onCopyLink)}
            </View>
            {telegramRow('Send set to Telegram', 'set-telegram', handlers.onTelegramSet)}
          </>
        )}
      </View>
    </BottomSheet>
  )
}
