import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import * as Sharing from 'expo-sharing'
import {
  createSetlist,
  effectiveKey,
  formatSetSummary,
  summarizeSet,
} from '@gracechords/core'
import Screen from '../components/Screen'
import Card from '../components/Card'
import Button from '../components/Button'
import SymbolIcon from '../components/SymbolIcon'
import HeaderIconButton from '../components/HeaderIconButton'
import SetlistTimeline, { type TimelineCallbacks } from '../components/setlist/SetlistTimeline'
import KeyPickerSheet from '../components/setlist/KeyPickerSheet'
import SetOptionsSheet from '../components/setlist/SetOptionsSheet'
import ShareSetSheet from '../components/setlist/ShareSetSheet'
import AddSongsModal from '../components/setlist/AddSongsModal'
import { useTheme } from '../theme/ThemeProvider'
import { useSetlistBuilder } from '../lib/useSetlistBuilder'
import { supabase } from '../lib/supabase'
import { buildSetlistShareUrl } from '../lib/setlistShare'
import { exportSetlist } from '../lib/exportSong'
import { pushSetToTelegram, TELEGRAM_BOT_URL } from '../lib/telegramPush'
import { timeAgo } from '../lib/relativeTime'
import { uuidv4 } from '../lib/uuid'
import { errMessage } from '../lib/errors'

const TOAST_MS = 1900

// The Setlist Builder (build mode): hero set card with inline rename, the
// numbered drag-to-reorder timeline, summary footer, Add + Start set bar,
// and the share / options / key / row sheets. All edits autosave through
// useSetlistBuilder; opening a song pushes the Viewer seeded at the entry's
// setlist key via the existing initialKey param.
export default function SetlistBuilderScreen({ setlistId }: { setlistId: string }) {
  const t = useTheme()
  const router = useRouter()
  const {
    name,
    items,
    songs,
    loading,
    notFound,
    error,
    setName,
    toggleSong,
    removeEntry,
    moveEntry,
    setKeyFor,
    deleteSet,
    updatedAt,
  } = useSetlistBuilder(setlistId)

  // Inline rename (in the hero card, no modal): select-all on focus, × clears
  // and refocuses, Done/return commits, an empty draft reverts.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const nameInput = useRef<TextInput>(null)

  const [keyIndex, setKeyIndex] = useState<number | null>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  // Toast pill (bottom-center, auto-dismiss).
  const [toast, setToast] = useState<string | null>(null)
  const toastOpacity = useRef(new Animated.Value(0)).current
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback(
    (message: string) => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
      setToast(message)
      Animated.timing(toastOpacity, { toValue: 1, duration: 160, useNativeDriver: true }).start()
      toastTimer.current = setTimeout(() => {
        Animated.timing(toastOpacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(
          ({ finished }) => {
            if (finished) setToast(null)
          },
        )
      }, TOAST_MS)
    },
    [toastOpacity],
  )
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )

  const effectiveKeys = useMemo(
    () => items.map((item) => effectiveKey(item, item.song)),
    [items],
  )
  const summary = useMemo(
    () =>
      summarizeSet(
        items.map((item) => ({
          toKey: item.toKey,
          default_key: item.song.default_key,
          tempo: item.song.tempo,
        })),
      ),
    [items],
  )
  const addedSongIds = useMemo(() => new Set(items.map((item) => item.songId)), [items])

  function startRename() {
    setDraft(name)
    setEditing(true)
  }

  function commitRename() {
    const next = draft.trim()
    if (next && next !== name) setName(next)
    setEditing(false)
  }

  const openSong = useCallback(
    (index: number) => {
      const item = items[index]
      if (!item) return
      const key = effectiveKeys[index]
      router.push({
        pathname: '/viewer/[slug]',
        params: {
          slug: item.song.slug,
          title: item.song.title,
          artist: item.song.artist ?? '',
          songKey: item.song.default_key ?? '',
          ...(key ? { initialKey: key } : {}),
        },
      })
    },
    [items, effectiveKeys, router],
  )

  function confirmDelete() {
    Alert.alert('Delete set?', `“${name}” and its songs will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSet()
            router.back()
          } catch (err: unknown) {
            Alert.alert('Could not delete set', errMessage(err))
          }
        },
      },
    ])
  }

  async function newSet() {
    // Optimistic: open the new (empty) set immediately; insert in the
    // background (the builder retries its initial fetch to cover the race).
    const id = uuidv4()
    router.replace(`/setlist/${id}`)
    createSetlist(supabase, { id }).catch((err: unknown) => {
      Alert.alert('Could not create set', errMessage(err))
    })
  }

  async function copyLink() {
    if (items.length === 0) {
      showToast('Add songs first')
      return
    }
    try {
      await Clipboard.setStringAsync(buildSetlistShareUrl(items))
      showToast('Set link copied')
    } catch (err: unknown) {
      Alert.alert('Could not copy link', errMessage(err))
    }
  }

  async function exportSet() {
    if (items.length === 0) {
      showToast('Add songs first')
      return
    }
    try {
      // Combined-set PDF via the same /api/export/setlist endpoint the Performer
      // uses; keys resolve to each entry's effective key (override or default).
      const uri = await exportSetlist(
        items.map((item, i) => ({ songId: item.songId, key: effectiveKeys[i] })),
      )
      await Sharing.shareAsync(uri)
    } catch (err: unknown) {
      Alert.alert('Export failed', errMessage(err))
    }
  }

  async function sendTelegram() {
    if (items.length === 0) {
      showToast('Add songs first')
      return
    }
    try {
      const result = await pushSetToTelegram(
        items.map((item, i) => ({ songId: item.songId, key: effectiveKeys[i] })),
      )
      if (result === 'not_linked') {
        Alert.alert('Telegram not linked', `Link your account with the bot first: ${TELEGRAM_BOT_URL}`)
        return
      }
      showToast('Sent to Telegram')
    } catch (err: unknown) {
      Alert.alert('Could not send set', errMessage(err))
    }
  }

  // Stable identity so the memoized timeline rows don't re-render (and
  // rebuild their gesture chains) on unrelated screen state changes. Actions
  // resolve the rendered index to the entry's stable key before mutating —
  // entries the catalog can't resolve stay in state but aren't rendered, so
  // rendered indexes are not entry indexes.
  const callbacks: TimelineCallbacks = useMemo(
    () => ({
      onPressRow: openSong,
      onKeyTap: setKeyIndex,
      onMove: (from, to) => {
        const fromKey = items[from]?.entryKey
        const toKey = items[to]?.entryKey
        if (fromKey && toKey) moveEntry(fromKey, toKey)
      },
      onRemove: (index) => {
        const entryKey = items[index]?.entryKey
        if (!entryKey) return
        removeEntry(entryKey)
        showToast('Removed from set')
      },
    }),
    [openSong, items, moveEntry, removeEntry, showToast],
  )

  const metaLine = formatSetSummary(summary)
  const edited = timeAgo(updatedAt)

  if (notFound) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl }}>
          <Text style={{ fontSize: t.typography.body.fontSize, color: t.colors.muted }}>
            This setlist no longer exists.
          </Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      {/* Header: back + more + share. Plain bar on the page background — same
          chrome as the Viewer/Performer headers. (Glass here drew a visible
          material edge around the bar because it sits inside the safe area.) */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: t.spacing.lg,
          paddingVertical: t.spacing.sm,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to setlists"
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
        >
          <SymbolIcon name="chevron.left" size={17} color={t.colors.textAccent} weight="semibold" />
          <Text style={{ fontSize: 16, color: t.colors.textAccent }}>Setlists</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
          <HeaderIconButton icon="ellipsis" label="Setlist options" onPress={() => setOptionsOpen(true)} />
          <HeaderIconButton
            icon="square.and.arrow.up"
            iconSize={22}
            label="Export and share"
            onPress={() => setShareOpen(true)}
          />
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.colors.accent} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xl }}
        >
          {/* Hero set card */}
          <Card style={{ padding: t.spacing.lg, marginBottom: t.spacing.lg }}>
            {editing ? (
              <View style={{ gap: t.spacing.sm }}>
                <Text
                  style={{
                    fontSize: t.typography.overline.fontSize,
                    fontWeight: t.typography.overline.fontWeight,
                    letterSpacing: t.typography.overline.letterSpacing,
                    textTransform: 'uppercase',
                    color: t.colors.muted,
                  }}
                >
                  Set name
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    borderWidth: 1.5,
                    borderColor: t.colors.accent,
                    borderRadius: t.radii.md,
                    paddingHorizontal: 12,
                    height: 46,
                  }}
                >
                  <TextInput
                    ref={nameInput}
                    value={draft}
                    onChangeText={setDraft}
                    autoFocus
                    selectTextOnFocus
                    returnKeyType="done"
                    onSubmitEditing={commitRename}
                    accessibilityLabel="Set name"
                    style={{ flex: 1, fontSize: 17, fontWeight: '600', color: t.colors.ink, padding: 0 }}
                  />
                  <Pressable
                    onPress={() => {
                      setDraft('')
                      nameInput.current?.focus()
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Clear set name"
                    hitSlop={8}
                  >
                    <SymbolIcon name="xmark.circle.fill" size={18} color={t.colors.muted} />
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: t.typography.rowMeta.fontSize, color: t.colors.sec }}>
                    {metaLine}
                  </Text>
                  <Button title="Done" onPress={commitRename} fullWidth={false} style={{ height: 40 }} />
                </View>
              </View>
            ) : (
              <Pressable onPress={startRename} accessibilityRole="button" accessibilityLabel="Rename set">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                  <Text
                    numberOfLines={1}
                    style={{ flexShrink: 1, fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: t.colors.ink }}
                  >
                    {name}
                  </Text>
                  <SymbolIcon name="pencil" size={15} color={t.colors.muted} />
                </View>
                <Text style={{ marginTop: 6, fontSize: t.typography.rowMeta.fontSize, color: t.colors.sec }}>
                  {metaLine}
                </Text>
                {edited ? (
                  <Text style={{ marginTop: 2, fontSize: t.typography.rowMeta.fontSize, color: t.colors.muted }}>
                    Last edited {edited}
                  </Text>
                ) : null}
              </Pressable>
            )}
          </Card>

          {/* Timeline */}
          {error ? (
            <Text
              style={{
                marginBottom: t.spacing.sm,
                fontSize: t.typography.rowMeta.fontSize,
                color: t.colors.danger,
              }}
            >
              {error}
            </Text>
          ) : null}
          {items.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: t.spacing.xxl, gap: 4 }}>
              <Text style={{ fontSize: t.typography.body.fontSize, fontWeight: '600', color: t.colors.ink }}>
                No songs yet
              </Text>
              <Text style={{ fontSize: t.typography.rowSubtitle.fontSize, color: t.colors.muted }}>
                Tap Add to search your library.
              </Text>
            </View>
          ) : (
            <SetlistTimeline items={items} effectiveKeys={effectiveKeys} callbacks={callbacks} />
          )}
        </ScrollView>
      )}

      {/* Bottom action bar — borderless, on the page background. */}
      <View
        style={{
          flexDirection: 'row',
          gap: t.spacing.sm,
          paddingHorizontal: t.spacing.lg,
          paddingTop: t.spacing.sm,
        }}
      >
        <Pressable
          onPress={() => setAddOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Add songs"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            height: 48,
            paddingHorizontal: t.spacing.lg,
            borderRadius: t.radii.md,
            backgroundColor: t.colors.surfaceAlt,
          }}
        >
          <SymbolIcon name="plus" size={16} color={t.colors.ink} weight="semibold" />
          <Text style={{ fontSize: 16, fontWeight: '600', letterSpacing: -0.2, color: t.colors.ink }}>
            Add
          </Text>
        </Pressable>
        <Button
          title="Start set"
          onPress={() => router.push(`/perform/${setlistId}`)}
          disabled={items.length === 0}
          style={{ flex: 1 }}
          fullWidth={false}
        />
      </View>

      {/* Toast */}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 84,
            alignSelf: 'center',
            opacity: toastOpacity,
            backgroundColor: t.colors.ink,
            borderRadius: t.radii.pill,
            paddingHorizontal: t.spacing.lg,
            paddingVertical: 10,
          }}
        >
          <Text style={{ fontSize: 13.5, fontWeight: '600', color: t.colors.bg }}>{toast}</Text>
        </Animated.View>
      ) : null}

      {/* Sheets */}
      <KeyPickerSheet
        visible={keyIndex != null}
        onClose={() => setKeyIndex(null)}
        songTitle={keyIndex != null ? items[keyIndex]?.song.title ?? null : null}
        currentKey={keyIndex != null ? effectiveKeys[keyIndex] ?? null : null}
        nativeKey={keyIndex != null ? items[keyIndex]?.song.default_key ?? null : null}
        hasOverride={keyIndex != null ? items[keyIndex]?.toKey != null : false}
        onPick={(key) => {
          const entryKey = keyIndex != null ? items[keyIndex]?.entryKey : undefined
          if (entryKey) setKeyFor(entryKey, key)
        }}
      />
      <SetOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        onRename={startRename}
        onSavedSets={() => router.navigate('/setlists')}
        onNewSet={newSet}
        onDeleteSet={confirmDelete}
      />
      <ShareSetSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        songCount={items.length}
        onExport={exportSet}
        onCopyLink={copyLink}
        onTelegram={sendTelegram}
      />
      <AddSongsModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        songs={songs}
        addedSongIds={addedSongIds}
        onToggle={toggleSong}
      />
    </Screen>
  )
}
