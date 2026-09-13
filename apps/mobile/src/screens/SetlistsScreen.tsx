import { useCallback, useState } from 'react'
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Screen from '../components/Screen'
import ConstrainedContent from '../components/ConstrainedContent'
import ListRow from '../components/ListRow'
import EmptyState from '../components/EmptyState'
import LoadingSkeleton from '../components/LoadingSkeleton'
import SwipeToDelete from '../components/SwipeToDelete'
import SymbolIcon from '../components/SymbolIcon'
import PruneSetlistsModal from '../components/setlist/PruneSetlistsModal'
import { useTheme } from '../theme/ThemeProvider'
import { duplicateSetlist, nextCopyName, timeAgo } from '@gracechords/core'
import { defaultSetlistName } from '../lib/setlistName'
import { supabase } from '../lib/supabase'
import { useSetlists, type SetlistRow } from '../lib/useSetlists'
import { uuidv4 } from '../lib/uuid'
import { actionFailureMessage, errMessage } from '../lib/errors'

// The Setlists tab: every personal setlist (newest-edited first), a New set
// action, and tap-to-open into the builder.
export default function SetlistsScreen() {
  const t = useTheme()
  const { t: tx, i18n } = useTranslation(['setlist', 'common', 'errors'])
  const router = useRouter()
  const { setlists, loading, error, refresh, create, remove, removeMany, limit, atLimit } =
    useSetlists()
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [pruneOpen, setPruneOpen] = useState(false)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  // Refresh whenever the tab regains focus so edits made in the builder
  // (name, songs, deletes) are reflected without a manual pull.
  useFocusEffect(
    useCallback(() => {
      refresh()
    }, [refresh]),
  )

  async function onRefresh() {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  async function onCreate() {
    if (creating) return
    // At the per-role cap: prune instead of navigating into a set the INSERT
    // would reject. The DB trigger is the real gate; this just avoids a dead
    // optimistic open.
    if (atLimit) {
      setPruneOpen(true)
      return
    }
    setCreating(true)
    // Optimistic: mint the id, open the builder instantly, insert in the
    // background. The builder retries its initial fetch a few times to cover
    // the in-flight INSERT.
    const id = uuidv4()
    // Named here rather than in core's createSetlist: this is the one caller
    // that already holds every existing name, so it is the only one that can
    // de-duplicate a second set made on the same day without a round trip.
    const name = defaultSetlistName(
      (key, opts) => tx(key, opts),
      i18n.language,
      setlists.map((row) => row.name),
    )
    router.push(`/setlist/${id}`)
    try {
      await create({ id, name })
    } catch (err: unknown) {
      // A stale role/limit read can let an over-cap create slip through to the
      // trigger. Surface the prune flow rather than a raw error.
      if (errMessage(err).includes('PERSONAL_SETLIST_LIMIT_REACHED')) {
        router.back()
        await refresh()
        setPruneOpen(true)
      } else {
        Alert.alert(tx('alerts.couldNotCreate'), actionFailureMessage('Setlists.create', err, tx))
      }
    } finally {
      setCreating(false)
    }
  }

  // Duplicate from the row's swipe actions. Numbered against the names already
  // in the list ("Sunday" → "Sunday (2)"), so the copy is distinguishable at a
  // glance — the complaint behind QA Nº 6994's M-01 was a column of identical
  // rows, and an unnumbered copy would recreate it.
  async function onDuplicateSetlist(item: SetlistRow) {
    if (duplicatingId) return
    // Same cap as creating: a duplicate is a new setlist and the DB trigger
    // rejects it exactly the same way.
    if (atLimit) {
      setPruneOpen(true)
      return
    }
    setDuplicatingId(item.id)
    try {
      const name = nextCopyName(
        item.name,
        setlists.map((row) => row.name),
      )
      await duplicateSetlist(supabase, item.id, name)
      await refresh()
    } catch (err: unknown) {
      if (errMessage(err).includes('PERSONAL_SETLIST_LIMIT_REACHED')) {
        await refresh()
        setPruneOpen(true)
      } else {
        Alert.alert(
          tx('alerts.couldNotDuplicate'),
          actionFailureMessage('Setlists.duplicate', err, tx),
        )
        await refresh()
      }
    } finally {
      setDuplicatingId(null)
    }
  }

  async function onDeleteSetlist(item: SetlistRow) {
    try {
      await remove(item.id)
    } catch (err: unknown) {
      Alert.alert(tx('alerts.couldNotDelete'), actionFailureMessage('Setlists.delete', err, tx))
      refresh()
    }
  }

  function subtitle(item: SetlistRow) {
    const edited = timeAgo(item.updated_at, (k, o) => tx(`common:${k}`, o), i18n.language)
    return [tx('common:songCount', { count: item.songCount }), edited ? tx('editedAgo', { time: edited }) : null]
      .filter(Boolean)
      .join(' · ')
  }

  function renderBody() {
    if (loading) {
      return <LoadingSkeleton label={tx('syncing')} />
    }
    // `error` is an i18n key, not raw error text (see useSetlists / errors.ts).
    // The RefreshControl below only exists on the populated list, so before 1.0.1
    // this branch had no way forward at all even though `refresh` was in scope.
    if (error) {
      return (
        <EmptyState
          icon="wifi.slash"
          title={tx(error)}
          subtitle={tx('errors:load.hint')}
          actionLabel={tx('common:retry')}
          onAction={() => void refresh()}
        />
      )
    }
    if (setlists.length === 0) {
      return (
        <EmptyState
          icon="list.bullet"
          title={tx('empty')}
          actionLabel={tx('newSet')}
          onAction={onCreate}
        />
      )
    }
    return (
      <FlatList
        data={setlists}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.muted} />
        }
        renderItem={({ item }) => (
          <SwipeToDelete
            onDelete={() => onDeleteSetlist(item)}
            confirm={{
              title: tx('deleteConfirm.title', { name: item.name }),
              message: tx('deleteConfirm.message'),
            }}
            secondary={{
              label: tx('rowActions.duplicate'),
              icon: 'plus.square.on.square',
              onPress: () => void onDuplicateSetlist(item),
            }}
          >
            <ListRow
              title={item.name}
              subtitle={subtitle(item)}
              onPress={() => router.push(`/setlist/${item.id}`)}
            />
          </SwipeToDelete>
        )}
        contentContainerStyle={{ paddingBottom: t.spacing.sm }}
      />
    )
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ConstrainedContent tier="content" style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: t.spacing.lg,
          paddingTop: t.spacing.sm,
          paddingBottom: t.spacing.sm,
        }}
      >
        <Text
          style={{
            fontSize: t.typography.largeTitle.fontSize,
            fontWeight: t.typography.largeTitle.fontWeight,
            letterSpacing: t.typography.largeTitle.letterSpacing,
            color: t.colors.ink,
          }}
        >
          {tx('title')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tx('newSet')}
          hitSlop={8}
          onPress={onCreate}
          disabled={creating}
          style={{
            width: 38,
            height: 38,
            borderRadius: t.radii.pill,
            backgroundColor: t.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: creating ? 0.5 : 1,
          }}
        >
          <SymbolIcon name="plus" size={20} color={t.colors.onAccent} weight="semibold" />
        </Pressable>
      </View>
      {renderBody()}
      </ConstrainedContent>
      <PruneSetlistsModal
        visible={pruneOpen}
        onClose={() => setPruneOpen(false)}
        setlists={setlists}
        limit={limit}
        onConfirmDelete={async (ids) => {
          await removeMany(ids)
          await refresh()
        }}
      />
    </Screen>
  )
}
