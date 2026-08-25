import { ScrollView, View } from 'react-native'
import Card from '../Card'
import FormSheetShell from '../FormSheetShell'
import ListRow from '../ListRow'
import SectionHeader from '../SectionHeader'
import SymbolIcon from '../SymbolIcon'
import { useTheme } from '../../theme/ThemeProvider'
import { GENERAL_PROGRESSIONS, PRAYER_PROGRESSIONS } from '../../lib/keyref/progressions'
import { formatChordToken } from '../../lib/keyref/render'
import type { Progression } from '../../lib/keyref/types'

// Picks the progression for one pinned slot. Both sets are labelled, and each
// row carries its canonical numeric shorthand as a subtitle so the shape is
// legible before it is pinned — that is also the only place `///` shows, marking
// where a repeated phrase starts.
//
// Presented through the app's native formSheet route (useFormSheet +
// FormSheetShell), like every other sheet outside the builder's chained one.

function shorthand(progression: Progression): string {
  return progression.phrases
    .map((phrase) => phrase.chords.map(formatChordToken).join(' – '))
    .join('  ///  ')
}

export type ProgressionPickerSheetProps = {
  selectedId: string | null
  onPick: (id: string) => void
  onClose: () => void
  title: string
  generalLabel: string
  prayerLabel: string
  labelFor: (progression: Progression) => string
  /** Height cap so a long list scrolls inside the sheet instead of growing it. */
  maxHeight: number
}

export default function ProgressionPickerSheet({
  selectedId,
  onPick,
  onClose,
  title,
  generalLabel,
  prayerLabel,
  labelFor,
  maxHeight,
}: ProgressionPickerSheetProps) {
  const t = useTheme()

  const group = (label: string, items: Progression[]) => (
    <View style={{ marginTop: t.spacing.sm }}>
      <SectionHeader label={label} />
      <Card style={{ marginHorizontal: t.spacing.lg }}>
        {items.map((progression, i) => {
          const selected = progression.id === selectedId
          return (
            <ListRow
              key={progression.id}
              title={labelFor(progression)}
              subtitle={shorthand(progression)}
              isLast={i === items.length - 1}
              accessibilityLabel={labelFor(progression)}
              onPress={() => onPick(progression.id)}
              trailing={
                selected ? (
                  <SymbolIcon name="checkmark" size={15} color={t.colors.accent} weight="semibold" />
                ) : undefined
              }
            />
          )
        })}
      </Card>
    </View>
  )

  return (
    <FormSheetShell title={title} onAction={onClose}>
      {/* The bottom safe-area inset belongs to the sheet HOST, never here. */}
      <ScrollView
        style={{ maxHeight }}
        contentContainerStyle={{ paddingBottom: t.spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {group(generalLabel, GENERAL_PROGRESSIONS)}
        {group(prayerLabel, PRAYER_PROGRESSIONS)}
      </ScrollView>
    </FormSheetShell>
  )
}
