import { useState } from 'react'
import { ActivityIndicator, Image, Pressable, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import FormSheetShell from '../FormSheetShell'
import TextField from '../TextField'
import SymbolIcon from '../SymbolIcon'
import { useFormSheet } from '../../lib/formSheetHost'
import { useTheme } from '../../theme/ThemeProvider'

// The Songbook "Customize & export" sheet, presented via the native formSheet
// route (bottom sheet on phone, centered form sheet on iPad). The owner screen
// keeps all the option state; this sheet renders it and calls back. Modeled on
// ShareSetSheet. The single primary action exports the PDF (server-rendered via
// /api/export/songbook) and hands the file to the share sheet.

export type SongbookOptionsProps = {
  visible: boolean
  onClose: () => void
  songCount: number
  title: string
  onChangeTitle: (v: string) => void
  subtitle: string
  onChangeSubtitle: (v: string) => void
  includeTOC: boolean
  onToggleTOC: (v: boolean) => void
  coverImageDataUrl: string | null
  coverName: string | null
  onPickCover: () => void
  onClearCover: () => void
  onExport: () => Promise<void>
}

export default function SongbookOptionsSheet(props: SongbookOptionsProps) {
  useFormSheet(props.visible, () => <SongbookOptionsContent {...props} />, props.onClose)
  return null
}

function SongbookOptionsContent({
  onClose,
  songCount,
  title,
  onChangeTitle,
  subtitle,
  onChangeSubtitle,
  includeTOC,
  onToggleTOC,
  coverImageDataUrl,
  coverName,
  onPickCover,
  onClearCover,
  onExport,
}: SongbookOptionsProps) {
  const t = useTheme()
  const { t: tx } = useTranslation('utilities')
  const insets = useSafeAreaInsets()
  const [busy, setBusy] = useState(false)

  const runExport = async () => {
    if (busy || songCount === 0) return
    setBusy(true)
    try {
      await onExport()
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormSheetShell title={tx('songbook.optionsTitle')} onAction={onClose}>
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom, gap: t.spacing.lg }}>
        <TextField
          label={tx('songbook.nameLabel')}
          icon="book"
          value={title}
          onChangeText={onChangeTitle}
          placeholder={tx('songbook.namePlaceholder')}
          autoCapitalize="words"
        />

        <TextField
          label={tx('songbook.subtitleLabel')}
          icon="calendar"
          value={subtitle}
          onChangeText={onChangeSubtitle}
          placeholder={tx('songbook.subtitlePlaceholder')}
          autoCapitalize="words"
        />

        {/* TOC toggle */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            padding: t.spacing.md,
            borderRadius: 13,
            backgroundColor: t.colors.surfaceAlt,
            borderWidth: 1,
            borderColor: t.colors.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.colors.ink }}>
              {tx('songbook.tocLabel')}
            </Text>
            <Text style={{ fontSize: 11.5, color: t.colors.muted, marginTop: 2 }}>
              {tx('songbook.tocHint')}
            </Text>
          </View>
          <Switch
            value={includeTOC}
            onValueChange={onToggleTOC}
            trackColor={{ true: t.colors.accent, false: t.colors.border }}
            accessibilityLabel={tx('songbook.tocLabel')}
          />
        </View>

        {/* Cover image */}
        <View style={{ gap: t.spacing.sm }}>
          <Text style={{ fontSize: 13.5, fontWeight: '600', letterSpacing: -0.1, color: t.colors.sec }}>
            {tx('songbook.coverLabel')}
          </Text>
          {coverImageDataUrl ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                padding: t.spacing.sm,
                borderRadius: 13,
                backgroundColor: t.colors.surfaceAlt,
                borderWidth: 1,
                borderColor: t.colors.border,
              }}
            >
              <Image
                source={{ uri: coverImageDataUrl }}
                style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: t.colors.border }}
                resizeMode="cover"
              />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: t.colors.ink }}>
                {coverName || tx('songbook.coverLabel')}
              </Text>
              <Pressable
                onPress={onPickCover}
                accessibilityRole="button"
                accessibilityLabel={tx('songbook.replaceCover')}
                hitSlop={8}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.colors.textAccent }}>
                  {tx('songbook.replaceCover')}
                </Text>
              </Pressable>
              <Pressable
                onPress={onClearCover}
                accessibilityRole="button"
                accessibilityLabel={tx('songbook.removeCover')}
                hitSlop={8}
              >
                <SymbolIcon name="trash" size={16} color={t.colors.muted} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={onPickCover}
              accessibilityRole="button"
              accessibilityLabel={tx('songbook.addCover')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 11,
                padding: t.spacing.md,
                borderRadius: 13,
                backgroundColor: t.colors.surfaceAlt,
                borderWidth: 1,
                borderColor: t.colors.border,
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
                <SymbolIcon name="photo" size={15} color={t.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.colors.ink }}>
                  {tx('songbook.addCover')}
                </Text>
                <Text style={{ fontSize: 11.5, color: t.colors.muted }}>{tx('songbook.coverHint')}</Text>
              </View>
            </Pressable>
          )}
        </View>

        {/* Export */}
        <Pressable
          onPress={runExport}
          disabled={busy || songCount === 0}
          accessibilityRole="button"
          accessibilityLabel={tx('songbook.exportPdf', { count: songCount })}
          style={{
            height: 50,
            borderRadius: 13,
            backgroundColor: t.colors.accent,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: t.spacing.sm,
            opacity: busy || songCount === 0 ? 0.5 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color={t.colors.onAccent} />
          ) : (
            <SymbolIcon name="square.and.arrow.up" size={19} color={t.colors.onAccent} />
          )}
          <Text style={{ fontSize: 16, fontWeight: '700', color: t.colors.onAccent }}>
            {tx('songbook.exportPdf', { count: songCount })}
          </Text>
        </Pressable>
      </View>
    </FormSheetShell>
  )
}
