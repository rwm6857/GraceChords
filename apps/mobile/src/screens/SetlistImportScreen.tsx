import { useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  createSetlist,
  effectiveKey,
  formatSetSummary,
  summarizeSet,
  updateSetlist,
} from '@gracechords/core'
import Screen from '../components/Screen'
import Card from '../components/Card'
import Button from '../components/Button'
import ListRow from '../components/ListRow'
import EmptyState from '../components/EmptyState'
import SymbolIcon from '../components/SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'
import { useSongList } from '../lib/useSongList'
import { supabase } from '../lib/supabase'
import { uuidv4 } from '../lib/uuid'
import { errMessage } from '../lib/errors'
import {
  buildMissingWarning,
  buildSavePayload,
  DEFAULT_IMPORT_NAME,
  resolveImport,
} from '../lib/setlistImport'

// Read-only PREVIEW of a shared setlist link, with a "Save to my setlists"
// action that materializes the user's own copy. This is IMPORT (not viewing
// someone else's set): decode the link, resolve slugs against the shared
// catalog, show the resolved songs with their imported keys, warn about any
// dropped (unresolved) songs, then create a normal setlist row on save. Reached
// via the shared-link deep link (app/+native-intent.tsx remaps to this route)
// and directly navigable for testing: /setlist/import?ids=<slugs>&toKeys=<keys>
// or /setlist/import?code=<CODE>.
export default function SetlistImportScreen({
  ids,
  toKeys,
  code,
}: {
  ids?: string
  toKeys?: string
  code?: string
}) {
  const t = useTheme()
  const { t: tx } = useTranslation(['setlist', 'common'])
  const router = useRouter()
  const { songs, loading: songsLoading, error: songsError } = useSongList()
  const [saving, setSaving] = useState(false)

  // Resolution needs the full catalog, so compute only once it's loaded (an
  // empty catalog would mark every song "unresolved").
  const resolution = useMemo(
    () => (songsLoading ? { resolved: [], unresolved: [] } : resolveImport({ ids, toKeys, code }, songs)),
    [songsLoading, songs, ids, toKeys, code],
  )
  const warning = buildMissingWarning(resolution.unresolved, tx)
  const summary = useMemo(
    () =>
      formatSetSummary(
        summarizeSet(
          resolution.resolved.map((r) => ({
            toKey: r.toKey,
            default_key: r.song.default_key,
            tempo: r.song.tempo,
          })),
        ),
      ),
    [resolution.resolved],
  )

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace('/setlists')
  }

  async function save() {
    if (resolution.resolved.length === 0 || saving) return
    setSaving(true)
    const id = uuidv4()
    try {
      // Mirror the builder's create-then-populate flow (createSetlist +
      // wipe-and-replace updateSetlist), so the imported copy is an ordinary
      // setlist row. Unresolved songs are dropped (never persisted).
      await createSetlist(supabase, { id, name: DEFAULT_IMPORT_NAME })
      await updateSetlist(supabase, id, {
        name: DEFAULT_IMPORT_NAME,
        songs: buildSavePayload(resolution.resolved),
      })
      router.replace(`/setlist/${id}`)
    } catch (err: unknown) {
      setSaving(false)
      Alert.alert(tx('import.couldNotImportAlert'), errMessage(err))
    }
  }

  const header = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: t.spacing.lg,
        paddingVertical: t.spacing.sm,
      }}
    >
      <Pressable
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel={tx('import.back')}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
      >
        <SymbolIcon name="chevron.left" size={17} color={t.colors.textAccent} weight="semibold" />
        <Text style={{ fontSize: 16, color: t.colors.textAccent }}>{tx('import.back')}</Text>
      </Pressable>
    </View>
  )

  if (songsLoading) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.colors.accent} />
        </View>
      </Screen>
    )
  }

  if (songsError) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        {header}
        <EmptyState
          icon="wifi.slash"
          title={tx('import.couldNotLoadTitle')}
          subtitle={tx('import.couldNotLoadSubtitle')}
        />
      </Screen>
    )
  }

  if (resolution.resolved.length === 0) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        {header}
        <EmptyState
          icon="music.note.list"
          title={tx('import.couldNotImportTitle')}
          subtitle={warning ?? tx('import.couldNotImportSubtitle')}
          actionLabel={tx('import.backToSetlists')}
          onAction={goBack}
        />
      </Screen>
    )
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      {header}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xl }}
      >
        <View style={{ marginBottom: t.spacing.lg }}>
          <Text
            style={{
              fontSize: t.typography.largeTitle.fontSize,
              fontWeight: t.typography.largeTitle.fontWeight,
              letterSpacing: t.typography.largeTitle.letterSpacing,
              color: t.colors.ink,
            }}
          >
            {tx('import.title')}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 14, color: t.colors.sec }}>{summary}</Text>
        </View>

        {warning ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: t.spacing.sm,
              padding: t.spacing.md,
              marginBottom: t.spacing.lg,
              borderRadius: t.radii.md,
              backgroundColor: t.colors.surfaceAlt,
              borderWidth: 0.5,
              borderColor: t.colors.border,
            }}
          >
            <SymbolIcon name="exclamationmark.triangle.fill" size={16} color={t.colors.danger} />
            <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: t.colors.sec }}>
              {warning}
            </Text>
          </View>
        ) : null}

        <Card>
          {resolution.resolved.map((entry, i) => (
            <ListRow
              key={`${entry.song.id}:${i}`}
              title={entry.song.title}
              subtitle={entry.song.artist}
              trailingTop={effectiveKey({ toKey: entry.toKey }, entry.song)}
              leading={
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: t.colors.accentSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: t.colors.textAccent }}>
                    {i + 1}
                  </Text>
                </View>
              }
              isLast={i === resolution.resolved.length - 1}
            />
          ))}
        </Card>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: t.spacing.lg,
          paddingTop: t.spacing.sm,
          paddingBottom: t.spacing.md,
          borderTopWidth: 0.5,
          borderTopColor: t.colors.border,
        }}
      >
        <Button
          title={saving ? tx('import.saving') : tx('import.save')}
          onPress={save}
          disabled={saving}
        />
      </View>
    </Screen>
  )
}
