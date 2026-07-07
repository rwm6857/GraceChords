import { useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import Screen from '../components/Screen'
import ListRow from '../components/ListRow'
import SectionHeader from '../components/SectionHeader'
import SymbolIcon from '../components/SymbolIcon'
import AlphaScrubber from '../components/AlphaScrubber'
import FilterSortSheet, { type SortDir, type SortKey } from '../components/FilterSortSheet'
import { useTheme } from '../theme/ThemeProvider'
import { useIsTabletWidth } from '../lib/useIsTabletWidth'
import { chunkRows } from '../lib/gridRows'
import { useSongList, type Song } from '../lib/useSongList'

// A list entry is one song (phone, single-column) or a grid row of songs
// (tablet — sections are chunked N per row, so letter headers stay full-width
// and sections never interleave across columns).
type LibraryRow = Song | Song[]
type Section = { key: string; title: string; letter: string | null; data: LibraryRow[] }

// First-letter bucket for the A–Z index; anything not A–Z lands under "#".
function bucketLetter(value: string | null | undefined): string {
  const ch = (value ?? '').trim().charAt(0).toUpperCase()
  return ch >= 'A' && ch <= 'Z' ? ch : '#'
}

function byTitle(a: Song, b: Song) {
  return a.title.localeCompare(b.title)
}

// Group + sort the filtered songs into SectionList sections according to the
// active sort. Title/Artist bucket by first letter (with the A–Z scrubber);
// Key regroups into "Key of X"; Recently added / Tempo are a single flat,
// header-less section. sortDir flips the order.
function buildSections(songs: Song[], sortKey: SortKey, sortDir: SortDir): Section[] {
  const desc = sortDir === 'desc'

  if (sortKey === 'title' || sortKey === 'artist') {
    const pick = (s: Song) => (sortKey === 'artist' ? s.artist : s.title)
    const groups = new Map<string, Song[]>()
    for (const s of songs) {
      const letter = bucketLetter(pick(s))
      const arr = groups.get(letter)
      if (arr) arr.push(s)
      else groups.set(letter, [s])
    }
    const letters = [...groups.keys()].sort()
    if (desc) letters.reverse()
    return letters.map((letter) => {
      const data = groups.get(letter)!.slice().sort((a, b) => {
        const primary =
          sortKey === 'artist' ? (a.artist ?? '').localeCompare(b.artist ?? '') : 0
        return primary !== 0 ? primary : byTitle(a, b)
      })
      if (desc) data.reverse()
      return { key: letter, title: letter, letter, data }
    })
  }

  if (sortKey === 'key') {
    const groups = new Map<string, Song[]>()
    for (const s of songs) {
      const k = s.default_key ?? ''
      const arr = groups.get(k)
      if (arr) arr.push(s)
      else groups.set(k, [s])
    }
    const keys = [...groups.keys()].sort()
    if (desc) keys.reverse()
    return keys.map((k) => ({
      key: k || '__nokey',
      title: k ? `Key of ${k}` : 'No key',
      letter: null,
      data: groups.get(k)!.slice().sort(byTitle),
    }))
  }

  // recent / tempo — one flat, header-less section.
  const data = songs.slice()
  if (sortKey === 'recent') {
    // Default (asc) shows the most recently added first.
    data.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  } else {
    // tempo — numeric, nulls last.
    data.sort((a, b) => (a.tempo ?? Number.POSITIVE_INFINITY) - (b.tempo ?? Number.POSITIVE_INFINITY))
  }
  if (desc) data.reverse()
  return data.length ? [{ key: '__flat', title: '', letter: null, data }] : []
}

export default function SongLibraryScreen() {
  const t = useTheme()
  const router = useRouter()
  const { songs, loading, error } = useSongList()
  const isTablet = useIsTabletWidth()
  const { width, height } = useWindowDimensions()
  // Grid columns: tablet-only (tokens layout.libraryColumns), 1 on phones —
  // the single-column path renders exactly as before (no chunking at all).
  const columns = isTablet
    ? width > height
      ? t.layout.libraryColumns.landscape
      : t.layout.libraryColumns.portrait
    : 1

  const [query, setQuery] = useState('')
  const [searchActive, setSearchActive] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('title')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())

  const inputRef = useRef<TextInput>(null)
  const listRef = useRef<SectionList<LibraryRow, Section>>(null)
  const pendingSection = useRef(0)

  const availableTags = useMemo(() => {
    const set = new Set<string>()
    for (const s of songs) for (const tag of s.tags ?? []) set.add(tag)
    return [...set].sort()
  }, [songs])

  const tagFiltered = useMemo(() => {
    if (selectedTags.size === 0) return songs
    return songs.filter((s) => (s.tags ?? []).some((tag) => selectedTags.has(tag)))
  }, [songs, selectedTags])

  const sections = useMemo(
    () => buildSections(tagFiltered, sortKey, sortDir),
    [tagFiltered, sortKey, sortDir],
  )

  // Presentation-only chunking for the tablet grid: each section's songs
  // become rows of N cells. Section count and order are untouched, so the
  // scrubber's section-index jumps (and sticky full-width headers) work
  // exactly as in the single-column list.
  const displaySections = useMemo(
    () =>
      columns === 1
        ? sections
        : sections.map((s) => ({ ...s, data: chunkRows(s.data as Song[], columns) })),
    [sections, columns],
  )

  const trimmedQuery = query.trim().toLowerCase()
  const results = useMemo(() => {
    if (!trimmedQuery) return []
    return tagFiltered
      .filter(
        (s) =>
          s.title.toLowerCase().includes(trimmedQuery) ||
          (s.artist ?? '').toLowerCase().includes(trimmedQuery),
      )
      .slice()
      .sort(byTitle)
  }, [tagFiltered, trimmedQuery])

  const resultRows: LibraryRow[] = useMemo(
    () => (columns === 1 ? results : chunkRows(results, columns)),
    [results, columns],
  )

  const showScrubber = !searchActive && (sortKey === 'title' || sortKey === 'artist')
  const presentLetters = useMemo(() => {
    const set = new Set<string>()
    if (showScrubber) for (const s of sections) if (s.letter) set.add(s.letter)
    return set
  }, [sections, showScrubber])

  const filterActive = sortKey !== 'title' || sortDir !== 'asc' || selectedTags.size > 0

  function openSong(song: Song) {
    router.push({
      pathname: '/viewer/[slug]',
      params: {
        slug: song.slug,
        title: song.title,
        artist: song.artist ?? '',
        songKey: song.default_key ?? '',
      },
    })
  }

  function cancelSearch() {
    setQuery('')
    setSearchActive(false)
    inputRef.current?.blur()
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  function resetFilters() {
    setSortKey('title')
    setSortDir('asc')
    setSelectedTags(new Set())
  }

  function scrollToLetter(letter: string) {
    const index = sections.findIndex((s) => s.letter === letter)
    if (index < 0) return
    pendingSection.current = index
    // Non-animated so continuous scrubbing tracks the finger without lag; the
    // failure fallback (onScrollToIndexFailed) recovers when the target section
    // is outside the render window.
    listRef.current?.scrollToLocation({
      sectionIndex: index,
      itemIndex: 0,
      animated: false,
      viewPosition: 0,
    })
  }

  const rowMeta = (song: Song) => ({
    trailingTop: song.default_key ?? undefined,
    trailingBottom: song.time_signature ?? undefined,
  })

  const keyForRow = (item: LibraryRow) => (Array.isArray(item) ? item[0].id : item.id)

  // One renderer for both lists: a single song renders the row exactly as the
  // phone list always has; a chunk renders a full-width grid row of flex-equal
  // cells, the last row padded with empty cells so columns stay aligned.
  function renderRow({ item }: { item: LibraryRow }) {
    if (Array.isArray(item)) {
      return (
        <View style={{ flexDirection: 'row' }}>
          {item.map((song) => (
            <View key={song.id} style={{ flex: 1 }}>
              <ListRow
                title={song.title}
                // Artist-less songs keep a blank subtitle line so every cell in
                // a grid row is the same height and the hairlines align.
                subtitle={song.artist || ' '}
                {...rowMeta(song)}
                onPress={() => openSong(song)}
              />
            </View>
          ))}
          {Array.from({ length: columns - item.length }, (_, i) => (
            <View key={`pad-${i}`} style={{ flex: 1 }} />
          ))}
        </View>
      )
    }
    return (
      <ListRow
        title={item.title}
        subtitle={item.artist}
        {...rowMeta(item)}
        onPress={() => openSong(item)}
      />
    )
  }

  function renderHeader() {
    return (
      <View
        style={{
          paddingHorizontal: searchActive ? 14 : t.spacing.lg,
          paddingTop: t.spacing.sm,
          paddingBottom: t.spacing.sm,
        }}
      >
        {!searchActive ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
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
              Song Library
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add song"
              hitSlop={8}
              onPress={() => {}}
              style={{
                width: 38,
                height: 38,
                borderRadius: t.radii.pill,
                backgroundColor: t.colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SymbolIcon name="plus" size={20} color={t.colors.onAccent} weight="semibold" />
            </Pressable>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              flex: 1,
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
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              onFocus={() => setSearchActive(true)}
              placeholder="Search songs, artists, themes…"
              placeholderTextColor={t.colors.muted}
              returnKeyType="search"
              autoCorrect={false}
              style={{ flex: 1, fontSize: 16, color: t.colors.ink, padding: 0 }}
            />
          </View>

          {searchActive ? (
            <Pressable onPress={cancelSearch} accessibilityRole="button" hitSlop={8}>
              <Text style={{ fontSize: 16, color: t.colors.textAccent }}>Cancel</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Filter and sort"
              style={{
                width: 44,
                height: 44,
                borderRadius: t.radii.sm,
                backgroundColor: t.colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SymbolIcon name="line.3.horizontal.decrease" size={22} color={t.colors.accent} />
              {filterActive ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 9,
                    height: 9,
                    borderRadius: t.radii.pill,
                    backgroundColor: t.colors.accent,
                    borderWidth: 2,
                    borderColor: t.colors.surfaceAlt,
                  }}
                />
              ) : null}
            </Pressable>
          )}
        </View>
      </View>
    )
  }

  function centeredMessage(message: string) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl }}>
        <Text style={{ fontSize: t.typography.body.fontSize, color: t.colors.muted, textAlign: 'center' }}>
          {message}
        </Text>
      </View>
    )
  }

  function renderBody() {
    if (loading) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.colors.accent} />
        </View>
      )
    }
    if (error) return centeredMessage(error)
    if (songs.length === 0) return centeredMessage('Your library is empty.')

    if (searchActive) {
      if (!trimmedQuery) return <View style={{ flex: 1 }} />
      if (results.length === 0) return centeredMessage(`No songs match “${query.trim()}”.`)
      return (
        <SectionList
          sections={[{ key: '__results', title: '', letter: null, data: resultRows }]}
          keyExtractor={keyForRow}
          keyboardShouldPersistTaps="handled"
          renderSectionHeader={() => (
            <View style={{ backgroundColor: t.colors.bg, paddingHorizontal: t.spacing.xl, paddingVertical: 6 }}>
              <Text
                style={{
                  fontSize: t.typography.overline.fontSize,
                  fontWeight: t.typography.overline.fontWeight,
                  letterSpacing: t.typography.overline.letterSpacing,
                  textTransform: 'uppercase',
                  color: t.colors.muted,
                }}
              >
                {results.length} {results.length === 1 ? 'result' : 'results'}
              </Text>
            </View>
          )}
          renderItem={renderRow}
        />
      )
    }

    if (sections.length === 0) return centeredMessage('No songs match your filters.')

    return (
      <View style={{ flex: 1 }}>
        <SectionList
          ref={listRef}
          sections={displaySections}
          keyExtractor={keyForRow}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) =>
            section.title ? <SectionHeader label={section.title} /> : null
          }
          renderItem={renderRow}
          onScrollToIndexFailed={(info) => {
            // scrollToLocation can't reach a section outside the render window
            // without getItemLayout — it fires this and scrolls nowhere. Nudge
            // the list to an approximate offset so the target renders, then
            // retry the precise scroll. Repeats (advancing each time) converge
            // on far jumps instead of looping in place.
            const approxOffset = info.averageItemLength * info.index
            listRef.current?.getScrollResponder()?.scrollTo({ y: approxOffset, animated: false })
            setTimeout(() => {
              listRef.current?.scrollToLocation({
                sectionIndex: pendingSection.current,
                itemIndex: 0,
                animated: true,
                viewPosition: 0,
              })
            }, 60)
          }}
          contentContainerStyle={{ paddingBottom: t.spacing.sm }}
        />
        {showScrubber ? (
          <AlphaScrubber present={presentLetters} onSelect={scrollToLetter} />
        ) : null}
      </View>
    )
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      {renderHeader()}
      {renderBody()}
      <FilterSortSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        sortKey={sortKey}
        sortDir={sortDir}
        onToggleSort={toggleSort}
        availableTags={availableTags}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        onReset={resetFilters}
        resultCount={tagFiltered.length}
      />
    </Screen>
  )
}
