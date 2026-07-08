import { useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import ListRow from '../ListRow'
import SymbolIcon from '../SymbolIcon'
import { useTheme } from '../../theme/ThemeProvider'
import { useKeyboardHeight } from '../../lib/useKeyboardHeight'
import type { Song } from '../../lib/useSongList'

// The tablet Setlist Builder's left pane: a searchable, single-column library
// list with the same rows and toggle semantics as AddSongsModal — tap appends
// the song to the end of the set, tapping a song already in the set removes
// its last entry, and the trailing badge flips + / ✓. Its own list instance,
// deliberately NOT shared with the Songs tab (no sections, scrubber, or tag
// filter — search covers lookup at pane width).

export default function LibraryPane({
  songs,
  addedSongIds,
  onToggle,
  loading,
}: {
  songs: Song[]
  addedSongIds: Set<string>
  onToggle: (song: Song) => void
  loading: boolean
}) {
  const t = useTheme()
  const { t: tx } = useTranslation(['setlist', 'common'])
  const insets = useSafeAreaInsets()
  const keyboardHeight = useKeyboardHeight()
  const [query, setQuery] = useState('')

  const trimmed = query.trim().toLowerCase()
  const results = useMemo(() => {
    const base = trimmed
      ? songs.filter(
          (s) =>
            s.title.toLowerCase().includes(trimmed) ||
            (s.artist ?? '').toLowerCase().includes(trimmed),
        )
      : songs
    return base.slice().sort((a, b) => a.title.localeCompare(b.title))
  }, [songs, trimmed])

  return (
    // On `surface` (not the page bg) so the pane reads as a distinct raised
    // panel beside the builder column.
    <View style={{ flex: 1, backgroundColor: t.colors.surface }}>
      {/* Search field — same pattern as AddSongsModal. */}
      <View style={{ paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: t.radii.sm,
            paddingHorizontal: 12,
            height: 44,
          }}
        >
          <SymbolIcon name="magnifyingglass" size={18} color={t.colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tx('libraryPane.searchPlaceholder')}
            placeholderTextColor={t.colors.muted}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={tx('libraryPane.searchLibrary')}
            style={{ flex: 1, fontSize: 16, color: t.colors.ink, padding: 0 }}
          />
          {query ? (
            <Pressable
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel={tx('addSongs.clearSearch')}
              hitSlop={8}
            >
              <SymbolIcon name="xmark.circle.fill" size={17} color={t.colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {loading && songs.length === 0 ? (
        <ActivityIndicator color={t.colors.accent} style={{ marginTop: t.spacing.xl }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          ListEmptyComponent={
            <View style={{ alignItems: 'center', padding: t.spacing.xl }}>
              <Text
                style={{
                  fontSize: t.typography.body.fontSize,
                  color: t.colors.muted,
                  textAlign: 'center',
                }}
              >
                {trimmed ? tx('addSongs.noMatches', { query: query.trim() }) : tx('addSongs.emptyLibrary')}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const added = addedSongIds.has(item.id)
            return (
              <ListRow
                title={item.title}
                subtitle={item.artist}
                trailingTop={item.default_key}
                accessibilityLabel={added ? tx('addSongs.remove', { title: item.title }) : tx('addSongs.add', { title: item.title })}
                onPress={() => onToggle(item)}
                trailing={
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: t.radii.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: added ? t.colors.accent : t.colors.accentSoft,
                    }}
                  >
                    <SymbolIcon
                      name={added ? 'checkmark' : 'plus'}
                      size={15}
                      weight="semibold"
                      color={added ? t.colors.onAccent : t.colors.textAccent}
                    />
                  </View>
                }
              />
            )
          }}
          contentContainerStyle={{
            paddingBottom: Math.max(keyboardHeight, insets.bottom) + t.spacing.lg,
            flexGrow: 1,
          }}
        />
      )}
    </View>
  )
}
