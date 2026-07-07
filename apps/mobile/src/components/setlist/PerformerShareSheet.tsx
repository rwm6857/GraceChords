import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FormSheetShell from '../FormSheetShell'
import SymbolIcon, { type SymbolIconProps } from '../SymbolIcon'
import { useFormSheet } from '../../lib/formSheetHost'
import { useTheme } from '../../theme/ThemeProvider'

// Performer "Export & share" sheet with a This song / Whole set scope toggle,
// presented via the native formSheet route (src/lib/formSheetHost.ts) — the
// viewer version, which keeps the scope toggle (the builder's ShareSetSheet
// does not). This-song mirrors the Song Viewer's ExportSheet (PDF and JPG as
// equal side-by-side tiles — both export a file and open the system share
// sheet — plus Telegram); Whole-set offers the combined PDF (server endpoint)
// as the primary (blue) action, Copy link and Telegram. No separate "share"
// button, and no ChordPro. The screen owns the async work and error alerts;
// this component only tracks which action is busy.

type Scope = 'song' | 'set'
type Busy = string | null

export type PerformerShareHandlers = {
  // This song
  onExportSong: (format: 'pdf' | 'jpg') => Promise<void>
  onTelegramSong: () => Promise<void>
  // Whole set
  onExportSet: () => Promise<void>
  onCopyLink: () => Promise<void>
  onTelegramSet: () => Promise<void>
}

type PerformerShareProps = {
  visible: boolean
  onClose: () => void
  songCount: number
  /** Defaults the toggle: whole set for multi-song, this song otherwise. */
  initialScope: Scope
  handlers: PerformerShareHandlers
}

export default function PerformerShareSheet(props: PerformerShareProps) {
  useFormSheet(props.visible, () => <PerformerShareContent {...props} />, props.onClose)
  return null
}

function PerformerShareContent({ onClose, songCount, initialScope, handlers }: PerformerShareProps) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  // The content mounts fresh on every open (formSheet route), so the scope
  // initializer re-seeds per open (single-song sets shouldn't land on
  // "Whole set").
  const [scope, setScope] = useState<Scope>(initialScope)
  const [busy, setBusy] = useState<Busy>(null)

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

  // Full-width secondary action row: accentSoft icon chip, label (+ optional
  // subtitle), trailing chevron. Shared shape for JPG, Copy link and Telegram.
  const secondaryRow = (
    label: string,
    icon: SymbolIconProps['name'],
    which: string,
    fn: () => Promise<void>,
    subtitle?: string,
  ) => (
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

  // Side-by-side export-format tile: accent icon over a short label, sized to
  // share the row equally with its sibling — mirrors the Song Viewer's
  // ExportSheet so PDF and JPG read as equals.
  const formatTile = (label: string, icon: SymbolIconProps['name'], which: string, fn: () => Promise<void>) => (
    <Pressable
      onPress={run(which, fn)}
      disabled={!!busy}
      accessibilityRole="button"
      accessibilityLabel={`Export as ${label}`}
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
    <FormSheetShell title="Export & share" onAction={onClose}>
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom, gap: t.spacing.md }}>
        {/* Scope toggle — a full-width view-switcher (kept full width by design). */}
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
            {/* Format tiles — PDF and JPG as equals; both open the share sheet. */}
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              {formatTile('PDF', 'doc.text', 'song-pdf', () => handlers.onExportSong('pdf'))}
              {formatTile('JPG', 'photo', 'song-jpg', () => handlers.onExportSong('jpg'))}
            </View>
            {secondaryRow('Send to Telegram', 'paperplane.fill', 'song-telegram', handlers.onTelegramSong, 'Optional bot')}
          </>
        ) : (
          <>
            {primaryButton(
              `Export set as PDF · ${songCount} ${songCount === 1 ? 'song' : 'songs'}`,
              'square.and.arrow.up',
              'set-pdf',
              handlers.onExportSet,
            )}
            {secondaryRow('Copy link', 'link', 'set-link', handlers.onCopyLink)}
            {secondaryRow('Send set to Telegram', 'paperplane.fill', 'set-telegram', handlers.onTelegramSet, 'Optional bot')}
          </>
        )}
      </View>
    </FormSheetShell>
  )
}
