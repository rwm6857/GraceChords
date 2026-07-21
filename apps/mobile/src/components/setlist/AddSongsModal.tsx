import { useMemo, useState } from 'react'
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import ListRow from '../ListRow'
import SymbolIcon from '../SymbolIcon'
import { useTheme } from '../../theme/ThemeProvider'
import { useKeyboardHeight } from '../../lib/useKeyboardHeight'
import { songMatchRank } from '../../lib/songSearch'
import type { Song } from '../../lib/useSongList'

// Full-screen "Add songs" picker (slides up over the builder): the Song
// Library's search-filter pattern in add-mode — each row's trailing + flips
// to a ✓ while the set count ticks up behind the sheet. The caller owns the
// song list (already fetched for the builder) and the toggle mutation.
export default function AddSongsModal({
  visible,
  onClose,
  songs,
  addedSongIds,
  onToggle,
}: {
  visible: boolean
  onClose: () => void
  songs: Song[]
  addedSongIds: Set<string>
  onToggle: (song: Song) => void
}) {
  const t = useTheme()
  const { t: tx } = useTranslation(['setlist', 'common'])
  const insets = useSafeAreaInsets()
  // Keyboard-aware bottom inset: while the keyboard is up the list gains
  // exactly its height of padding, so the rows behind it can scroll into
  // view; when it closes the padding collapses back to the safe area (no
  // dead gap). iOS's automaticallyAdjustKeyboardInsets can't be trusted
  // inside a Modal, hence the explicit hook.
  const keyboardHeight = useKeyboardHeight()
  const [query, setQuery] = useState('')

  const trimmed = query.trim().toLowerCase()
  const results = useMemo(() => {
    if (!trimmed) return songs.slice().sort((a, b) => a.title.localeCompare(b.title))
    // Rank title matches above tag-only matches, then alphabetically within each.
    return songs
      .map((s) => ({ s, rank: songMatchRank(s, trimmed) }))
      .filter((x) => x.rank !== null)
      .sort((a, b) => a.rank! - b.rank! || a.s.title.localeCompare(b.s.title))
      .map((x) => x.s)
  }, [songs, trimmed])

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: t.spacing.lg,
            paddingVertical: t.spacing.sm,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: t.colors.ink }}>
            {tx('addSongs.title')}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={tx('addSongs.doneAdding')} hitSlop={8}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.textAccent }}>{tx('common:done')}</Text>
          </Pressable>
        </View>

        {/* Search field */}
        <View style={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.sm }}>
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
              placeholder={tx('addSongs.searchPlaceholder')}
              placeholderTextColor={t.colors.muted}
              returnKeyType="search"
              autoCorrect={false}
              style={{ flex: 1, fontSize: 16, color: t.colors.ink, padding: 0 }}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={tx('addSongs.clearSearch')} hitSlop={8}>
                <SymbolIcon name="xmark.circle.fill" size={17} color={t.colors.muted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Results */}
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          ListEmptyComponent={
            <View style={{ alignItems: 'center', padding: t.spacing.xl }}>
              <Text style={{ fontSize: t.typography.body.fontSize, color: t.colors.muted }}>
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
      </View>
    </Modal>
  )
}
