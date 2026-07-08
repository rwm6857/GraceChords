import { useEffect, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import type { BibleTranslation } from '@gracechords/core'
import Card from '../components/Card'
import Screen from '../components/Screen'
import SymbolIcon from '../components/SymbolIcon'
import GlassSurface from '../components/GlassSurface'
import { useTheme } from '../theme/ThemeProvider'
import { useBibleTranslations } from '../lib/useBibleTranslations'
import { getTranslations } from '../lib/bibleSource'
import {
  deleteBibleDownload,
  isTranslationStale,
  setWifiOnly,
  startBibleDownload,
  useDownloads,
  WifiRequiredError,
  type AbortToken,
  type DownloadProgress,
} from '../lib/downloads'

// Offline & downloads — reached from Settings. Manages downloaded Bible
// translations only (per the design: songs/setlists have no download UI, and
// TGC devotionals stream and aren't stored). Downloads/deletes are LOCAL to this
// device — Bibles are served from public R2 and never stored in Supabase, so
// nothing here can touch song/setlist records or other user data.

// Cosmetic storage-bar reference (the design shows a fixed cap; there is no real
// device quota for our small translation set).
const DISPLAY_CAP_BYTES = 80 * 1024 * 1024

function formatMB(bytes: number, tx: (k: string, o?: Record<string, unknown>) => string): string {
  return tx('mb', { value: (bytes / (1024 * 1024)).toFixed(1) })
}

export default function OfflineDownloadsScreen() {
  const t = useTheme()
  const { t: tx } = useTranslation(['offline', 'common'])
  const router = useRouter()
  const insets = useSafeAreaInsets()
  // Measured glass-bar height feeds the scroll-behind top inset.
  const [barH, setBarH] = useState(0)
  const { translations } = useBibleTranslations()
  const { records, wifiOnly } = useDownloads()

  // Per-translation in-progress state and cancel tokens (session-local).
  const [busy, setBusy] = useState<Record<string, DownloadProgress>>({})
  const tokens = useRef<Record<string, AbortToken>>({})
  const [remoteVersion, setRemoteVersion] = useState('')

  useEffect(() => {
    let alive = true
    getTranslations().then((r) => {
      if (alive) setRemoteVersion(r.version)
    })
    return () => {
      alive = false
    }
  }, [])

  const downloadedList = Object.values(records)
  const downloadedIds = new Set(downloadedList.map((r) => r.id))
  const busyIds = new Set(Object.keys(busy))
  const available = translations.filter((tr) => !downloadedIds.has(tr.id) && !busyIds.has(tr.id))

  const totalBytes = downloadedList.reduce((sum, r) => sum + r.sizeBytes, 0)
  const usagePct = Math.min(100, Math.round((totalBytes / DISPLAY_CAP_BYTES) * 100))

  async function handleDownload(tr: BibleTranslation) {
    if (busy[tr.id]) return
    const token: AbortToken = { aborted: false }
    tokens.current[tr.id] = token
    setBusy((b) => ({ ...b, [tr.id]: { done: 0, total: 1 } }))
    try {
      await startBibleDownload(tr, {
        signal: token,
        onProgress: (p) => setBusy((b) => (b[tr.id] ? { ...b, [tr.id]: p } : b)),
      })
    } catch (err) {
      if (err instanceof WifiRequiredError) {
        Alert.alert(tx('alerts.wifiRequiredTitle'), tx('alerts.wifiRequiredMessage'))
      } else if (!token.aborted) {
        Alert.alert(tx('alerts.downloadFailedTitle'), tx('alerts.downloadFailedMessage'))
      }
    } finally {
      delete tokens.current[tr.id]
      setBusy((b) => {
        const next = { ...b }
        delete next[tr.id]
        return next
      })
    }
  }

  function handleCancel(id: string) {
    const token = tokens.current[id]
    if (token) token.aborted = true
  }

  function handleDelete(id: string, name: string) {
    Alert.alert(tx('alerts.deleteTitle'), tx('alerts.deleteMessage', { name }), [
      { text: tx('common:cancel'), style: 'cancel' },
      { text: tx('common:delete'), style: 'destructive', onPress: () => void deleteBibleDownload(id) },
    ])
  }

  const sectionLabel = (label: string) => (
    <Text
      style={{
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        color: t.colors.muted,
        paddingHorizontal: t.spacing.lg,
        paddingBottom: 7,
        marginTop: t.spacing.xl,
      }}
    >
      {label}
    </Text>
  )

  const rowStyle = (first: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
    minHeight: 54,
    borderTopWidth: first ? 0 : 1,
    borderTopColor: t.colors.border,
  })

  const busyList = translations.filter((tr) => busy[tr.id])

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.spacing.md, paddingTop: barH + t.spacing.md, paddingBottom: t.spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            paddingHorizontal: t.spacing.xs,
            paddingBottom: t.spacing.md,
            fontSize: t.typography.largeTitle.fontSize,
            fontWeight: t.typography.largeTitle.fontWeight,
            letterSpacing: t.typography.largeTitle.letterSpacing,
            color: t.colors.ink,
          }}
        >
          {tx('title')}
        </Text>
        {/* Storage summary */}
        <Card style={{ padding: t.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: t.colors.ink }}>{tx('onThisDeviceStorage')}</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: t.colors.ink }}>{formatMB(totalBytes, tx)}</Text>
          </View>
          <View
            style={{ marginTop: 12, height: 7, borderRadius: t.radii.pill, backgroundColor: t.colors.surfaceAlt, overflow: 'hidden' }}
          >
            <View style={{ height: '100%', width: `${usagePct}%`, backgroundColor: t.colors.accent, borderRadius: t.radii.pill }} />
          </View>
          <Text style={{ fontSize: 12.5, color: t.colors.muted, marginTop: 9 }}>
            {tx('downloadedCount', { count: downloadedList.length, total: translations.length })}
          </Text>
        </Card>

        {/* Downloading */}
        {busyList.length > 0 ? (
          <>
            {sectionLabel(tx('sections.downloading'))}
            <Card>
              {busyList.map((tr, i) => {
                const p = busy[tr.id]
                const pct = p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
                return (
                  <View key={tr.id} style={rowStyle(i === 0)}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '500', color: t.colors.ink }}>
                        {tr.name}
                      </Text>
                      <View
                        style={{ height: 5, borderRadius: t.radii.pill, backgroundColor: t.colors.surfaceAlt, overflow: 'hidden', marginTop: 8 }}
                      >
                        <View style={{ height: '100%', width: `${pct}%`, backgroundColor: t.colors.accent, borderRadius: t.radii.pill }} />
                      </View>
                      <Text style={{ fontSize: 12, color: t.colors.muted, marginTop: 6 }}>{tx('percent', { value: pct })}</Text>
                    </View>
                    <Pressable
                      onPress={() => handleCancel(tr.id)}
                      accessibilityRole="button"
                      accessibilityLabel={tx('cancelDownload')}
                      hitSlop={8}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: t.radii.pill,
                        backgroundColor: t.colors.surfaceAlt,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <SymbolIcon name="xmark" size={13} color={t.colors.sec} weight="bold" />
                    </Pressable>
                  </View>
                )
              })}
            </Card>
          </>
        ) : null}

        {/* On this device */}
        {downloadedList.length > 0 ? (
          <>
            {sectionLabel(tx('sections.onThisDevice', { count: downloadedList.length }))}
            <Card>
              {downloadedList.map((r, i) => {
                const stale = isTranslationStale(r.version, remoteVersion)
                return (
                  <View key={r.id} style={rowStyle(i === 0)}>
                    <SymbolIcon name="checkmark.circle.fill" size={23} color={t.colors.accent} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '500', color: t.colors.ink }}>
                        {r.name}
                      </Text>
                      <Text style={{ fontSize: 12.5, color: t.colors.muted, marginTop: 1 }}>
                        {stale
                          ? tx('translationMetaStale', { language: r.language, size: formatMB(r.sizeBytes, tx) })
                          : tx('translationMeta', { language: r.language, size: formatMB(r.sizeBytes, tx) })}
                      </Text>
                    </View>
                    {stale ? (
                      <Pressable
                        onPress={() => handleDownload({ id: r.id, label: r.label, name: r.name, language: r.language, dataRoot: r.dataRoot })}
                        accessibilityRole="button"
                        accessibilityLabel={tx('updateDownload')}
                        hitSlop={8}
                        style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <SymbolIcon name="arrow.triangle.2.circlepath" size={20} color={t.colors.accent} />
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => handleDelete(r.id, r.name)}
                      accessibilityRole="button"
                      accessibilityLabel={tx('deleteDownload')}
                      hitSlop={8}
                      style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <SymbolIcon name="trash" size={18} color={t.colors.danger} />
                    </Pressable>
                  </View>
                )
              })}
            </Card>
          </>
        ) : null}

        {/* Available */}
        {available.length > 0 ? (
          <>
            {sectionLabel(tx('sections.available'))}
            <Card>
              {available.map((tr, i) => (
                <Pressable
                  key={tr.id}
                  onPress={() => handleDownload(tr)}
                  accessibilityRole="button"
                  accessibilityLabel={tx('download', { name: tr.name })}
                  style={({ pressed }) => [rowStyle(i === 0), { backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent' }]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '500', color: t.colors.ink }}>
                      {tr.name}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: t.colors.muted, marginTop: 1 }}>{tr.language}</Text>
                  </View>
                  <SymbolIcon name="arrow.down.circle" size={23} color={t.colors.accent} />
                </Pressable>
              ))}
            </Card>
          </>
        ) : null}

        {/* Options */}
        {sectionLabel(tx('sections.options'))}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg, minHeight: 54 }}>
            <Text style={{ flex: 1, fontSize: 16, color: t.colors.ink }}>{tx('wifiOnly')}</Text>
            <Switch
              value={wifiOnly}
              onValueChange={setWifiOnly}
              trackColor={{ true: t.colors.accent, false: t.colors.surfaceAlt }}
            />
          </View>
        </Card>
        <Text style={{ fontSize: 12.5, lineHeight: 19, color: t.colors.muted, paddingHorizontal: t.spacing.lg, paddingTop: 8 }}>
          {tx('footer')}
        </Text>
      </ScrollView>

      {/* Scroll-behind top bar: Liquid Glass on iOS 26, opaque page-bg bar on
          iOS < 26 / Android. Content scrolls under it (measured via onLayout). */}
      <GlassSurface
        fallbackColor={t.colors.bg}
        onLayout={(e) => setBarH(e.nativeEvent.layout.height)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          paddingTop: insets.top,
          paddingHorizontal: t.spacing.md,
          paddingBottom: t.spacing.xs,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={tx('backToSettings')}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
        >
          <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
          <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent }}>{tx('back')}</Text>
        </Pressable>
      </GlassSurface>
    </Screen>
  )
}
