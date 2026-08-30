import { Pressable, Text, View } from 'react-native'
import Card from '../Card'
import SectionHeader from '../SectionHeader'
import SymbolIcon from '../SymbolIcon'
import ProgressionSequence from './ProgressionSequence'
import { useTheme } from '../../theme/ThemeProvider'
import { useAccessibilityFlags } from '../../lib/accessibilityFlags'
import { GENERAL_PROGRESSIONS, PRAYER_PROGRESSIONS } from '../../lib/keyref/progressions'
import type { DisplayMode, Progression } from '../../lib/keyref/types'

// Every progression, grouped by set, each row showing its name and its full
// chord sequence so the whole library can be read at a glance. Tapping a row
// selects it; the dial follows.
//
// An earlier revision showed four PINNED slots with a picker sheet behind each
// one. Four out of thirty-three is a lot of machinery to see an eighth of the
// data, so the pinning, the picker and the per-slot long-press action are gone:
// the list is simply the list, and it scrolls.

function ProgressionRow({
  progression,
  selected,
  isLast,
  onSelect,
  tonicKey,
  mode,
  activeIndex,
  onShowNote,
  onReplay,
  showReplay,
  labelFor,
  selectHint,
  noteLabel,
  replayLabel,
  t: tx,
}: {
  progression: Progression
  selected: boolean
  isLast: boolean
  onSelect: () => void
  tonicKey: string
  mode: DisplayMode
  activeIndex: number | null
  onShowNote: (progression: Progression) => void
  onReplay: () => void
  showReplay: boolean
  labelFor: (progression: Progression) => string
  selectHint: string
  noteLabel: string
  replayLabel: string
  t: (key: string, vars: Record<string, string>) => string
}) {
  const t = useTheme()
  const { differentiateWithoutColor } = useAccessibilityFlags()
  const label = labelFor(progression)

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      accessibilityHint={selected ? undefined : selectHint}
      style={({ pressed }) => ({
        paddingHorizontal: t.spacing.md,
        paddingVertical: t.spacing.sm,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: t.colors.border,
        backgroundColor: selected
          ? t.colors.accentSoft
          : pressed
            ? t.colors.surfaceAlt
            : 'transparent',
      })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.xs,
          marginBottom: t.spacing.xs,
        }}
      >
        {/* Selection is a tint; with Differentiate Without Color on it also gets
            a mark, matching the Chip primitive's behaviour. */}
        {selected && differentiateWithoutColor ? (
          <SymbolIcon name="checkmark" size={11} color={t.colors.textAccent} weight="semibold" />
        ) : null}
        <Text
          numberOfLines={1}
          style={{
            flexShrink: 1,
            fontSize: t.typography.overline.fontSize,
            fontWeight: t.typography.overline.fontWeight,
            letterSpacing: t.typography.overline.letterSpacing,
            color: selected ? t.colors.textAccent : t.colors.sec,
          }}
        >
          {label.toUpperCase()}
        </Text>
        {progression.noteKey ? (
          <Pressable
            onPress={() => onShowNote(progression)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={noteLabel}
          >
            <SymbolIcon name="info.circle" size={14} color={t.colors.accent} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        {selected && showReplay ? (
          <Pressable
            onPress={onReplay}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={replayLabel}
          >
            <SymbolIcon name="arrow.triangle.2.circlepath" size={14} color={t.colors.accent} />
          </Pressable>
        ) : null}
      </View>

      <ProgressionSequence
        progression={progression}
        tonicKey={tonicKey}
        mode={mode}
        // Only the selected row's walk is lit; the others sit static so the
        // highlight can never read as belonging to two progressions.
        activeIndex={selected ? activeIndex : null}
        t={tx}
      />
    </Pressable>
  )
}

export type ProgressionListProps = {
  selectedId: string | null
  onSelect: (id: string) => void
  tonicKey: string
  mode: DisplayMode
  /** Index into the SELECTED progression's flattened chords, or null. */
  activeIndex: number | null
  onShowNote: (progression: Progression) => void
  onReplay: () => void
  /** Hidden under Reduce Motion, where there is no walk to replay. */
  showReplay: boolean
  labelFor: (progression: Progression) => string
  generalLabel: string
  prayerLabel: string
  selectHint: string
  noteLabel: string
  replayLabel: string
  t: (key: string, vars: Record<string, string>) => string
}

export default function ProgressionList({
  selectedId,
  onSelect,
  generalLabel,
  prayerLabel,
  ...row
}: ProgressionListProps) {
  const t = useTheme()

  const group = (label: string, items: Progression[], first: boolean) => (
    <View style={{ marginTop: first ? 0 : t.spacing.md }}>
      <SectionHeader label={label} />
      <Card>
        {items.map((progression, i) => (
          <ProgressionRow
            key={progression.id}
            progression={progression}
            selected={progression.id === selectedId}
            isLast={i === items.length - 1}
            onSelect={() => onSelect(progression.id)}
            {...row}
          />
        ))}
      </Card>
    </View>
  )

  return (
    <View>
      {group(generalLabel, GENERAL_PROGRESSIONS, true)}
      {group(prayerLabel, PRAYER_PROGRESSIONS, false)}
    </View>
  )
}
