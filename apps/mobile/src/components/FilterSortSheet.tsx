import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BottomSheet from './BottomSheet'
import Button from './Button'
import Card from './Card'
import Chip from './Chip'
import SymbolIcon from './SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'

export type SortKey = 'title' | 'artist' | 'key' | 'recent' | 'tempo'
export type SortDir = 'asc' | 'desc'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'key', label: 'Key' },
  { key: 'recent', label: 'Recently added' },
  { key: 'tempo', label: 'Tempo' },
]

// The Filter & sort bottom sheet (the design's single filter control — no
// segment bar). Sort-by rows show an up/down chevron on the active option;
// tapping it again flips direction. Tags come from the real library and toggle
// the tag filter. The footer button just closes the sheet — the list behind it
// already reflects every change live.
export default function FilterSortSheet({
  visible,
  onClose,
  sortKey,
  sortDir,
  onToggleSort,
  availableTags,
  selectedTags,
  onToggleTag,
  onReset,
  resultCount,
}: {
  visible: boolean
  onClose: () => void
  sortKey: SortKey
  sortDir: SortDir
  onToggleSort: (key: SortKey) => void
  availableTags: string[]
  selectedTags: Set<string>
  onToggleTag: (tag: string) => void
  onReset: () => void
  resultCount: number
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Filter & sort"
      actionLabel="Reset"
      onAction={onReset}
      closeAccessibilityLabel="Close filter and sort"
    >
      <ScrollView
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ padding: t.spacing.lg }}
      >
        {/* Sort by */}
        <Text
          style={{
            fontSize: t.typography.overline.fontSize,
            fontWeight: t.typography.overline.fontWeight,
            letterSpacing: t.typography.overline.letterSpacing,
            textTransform: 'uppercase',
            color: t.colors.muted,
            paddingBottom: t.spacing.sm,
          }}
        >
          Sort by
        </Text>
        <Card>
          {SORT_OPTIONS.map((opt, i) => {
            const selected = sortKey === opt.key
            return (
              <Pressable
                key={opt.key}
                onPress={() => onToggleSort(opt.key)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  height: 48,
                  paddingHorizontal: 14,
                  borderTopWidth: i === 0 ? 0 : 0.5,
                  borderTopColor: t.colors.border,
                  backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
                })}
              >
                <Text style={{ flex: 1, fontSize: 16.5, letterSpacing: -0.3, color: t.colors.ink }}>
                  {opt.label}
                </Text>
                {selected ? (
                  <SymbolIcon
                    name={sortDir === 'asc' ? 'chevron.up' : 'chevron.down'}
                    size={17}
                    color={t.colors.accent}
                  />
                ) : null}
              </Pressable>
            )
          })}
        </Card>

        {/* Filter by tag */}
        {availableTags.length > 0 ? (
          <>
            <Text
              style={{
                fontSize: t.typography.overline.fontSize,
                fontWeight: t.typography.overline.fontWeight,
                letterSpacing: t.typography.overline.letterSpacing,
                textTransform: 'uppercase',
                color: t.colors.muted,
                paddingBottom: t.spacing.md,
                marginTop: t.spacing.xl,
              }}
            >
              Filter by tag
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
              {availableTags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  selected={selectedTags.has(tag)}
                  onPress={() => onToggleTag(tag)}
                />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* Footer */}
      <View
        style={{
          padding: t.spacing.md,
          paddingBottom: t.spacing.md + insets.bottom,
          borderTopWidth: 1,
          borderTopColor: t.colors.border,
        }}
      >
        <Button
          title={`Show ${resultCount} ${resultCount === 1 ? 'song' : 'songs'}`}
          onPress={onClose}
        />
      </View>
    </BottomSheet>
  )
}
