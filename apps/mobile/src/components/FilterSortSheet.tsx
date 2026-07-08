import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import FormSheetShell from './FormSheetShell'
import { useFormSheet } from '../lib/formSheetHost'
import Button from './Button'
import Card from './Card'
import Chip from './Chip'
import SymbolIcon from './SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'

export type SortKey = 'title' | 'artist' | 'key' | 'recent' | 'tempo'
export type SortDir = 'asc' | 'desc'

const SORT_OPTIONS: { key: SortKey; labelKey: string }[] = [
  { key: 'title', labelKey: 'filterSheet.sort.title' },
  { key: 'artist', labelKey: 'filterSheet.sort.artist' },
  { key: 'key', labelKey: 'filterSheet.sort.key' },
  { key: 'recent', labelKey: 'filterSheet.sort.recent' },
  { key: 'tempo', labelKey: 'filterSheet.sort.tempo' },
]

// The Filter & sort sheet (the design's single filter control — no segment
// bar), presented via the native formSheet route (src/lib/formSheetHost.ts):
// a bottom sheet on phones, a centered narrow form sheet on tablets. Sort-by
// rows show an up/down chevron on the active option; tapping it again flips
// direction. Tags come from the real library and toggle the tag filter. The
// footer button just closes the sheet — the list behind it already reflects
// every change live.
type FilterSortProps = {
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
}

export default function FilterSortSheet(props: FilterSortProps) {
  useFormSheet(props.visible, () => <FilterSortContent {...props} />, props.onClose)
  return null
}

function FilterSortContent({
  onClose,
  sortKey,
  sortDir,
  onToggleSort,
  availableTags,
  selectedTags,
  onToggleTag,
  onReset,
  resultCount,
}: FilterSortProps) {
  const t = useTheme()
  const { t: tx } = useTranslation(['song', 'common'])
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()

  return (
    <FormSheetShell title={tx('filterSheet.title')} actionLabel={tx('common:reset')} onAction={onReset}>
      <ScrollView
        // The fitToContents detent doesn't bound over-tall content the way the
        // old Modal's maxHeight did, so cap the scroll area ourselves — long
        // tag lists scroll here instead of pushing the footer off screen.
        style={{ flexGrow: 0, maxHeight: Math.round(height * 0.6) }}
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
          {tx('filterSheet.sortBy')}
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
                  {tx(opt.labelKey)}
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
              {tx('filterSheet.filterByTag')}
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
          title={tx('filterSheet.show', { count: resultCount })}
          onPress={onClose}
        />
      </View>
    </FormSheetShell>
  )
}
