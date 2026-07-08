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
import { useSetlists, type SetlistRow } from '../lib/useSetlists'
import { timeAgo } from '../lib/relativeTime'
import { uuidv4 } from '../lib/uuid'
import { errMessage } from '../lib/errors'

// The Setlists tab: every personal setlist (newest-edited first), a New set
// action, and tap-to-open into the builder.
export default function SetlistsScreen() {
  const t = useTheme()
  const { t: tx, i18n } = useTranslation(['setlist', 'common'])
  const router = useRouter()
  const { setlists, loading, error, refresh, create, remove, removeMany, limit, atLimit } =
    useSetlists()
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [pruneOpen, setPruneOpen] = useState(false)

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
    router.push(`/setlist/${id}`)
    try {
      await create({ id })
    } catch (err: unknown) {
      // A stale role/limit read can let an over-cap create slip through to the
      // trigger. Surface the prune flow rather than a raw error.
      if (errMessage(err).includes('PERSONAL_SETLIST_LIMIT_REACHED')) {
        router.back()
        await refresh()
        setPruneOpen(true)
      } else {
        Alert.alert(tx('alerts.couldNotCreate'), errMessage(err))
      }
    } finally {
      setCreating(false)
    }
  }

  async function onDeleteSetlist(item: SetlistRow) {
    try {
      await remove(item.id)
    } catch (err: unknown) {
      Alert.alert(tx('alerts.couldNotDelete'), errMessage(err))
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
    if (error) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl }}>
          <Text style={{ fontSize: t.typography.body.fontSize, color: t.colors.muted, textAlign: 'center' }}>
            {error}
          </Text>
        </View>
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
