import { Pressable, Text, View } from 'react-native'
import Card from '../Card'
import SymbolIcon from '../SymbolIcon'
import ProgressionSequence from './ProgressionSequence'
import { useTheme } from '../../theme/ThemeProvider'
import { useAccessibilityFlags } from '../../lib/accessibilityFlags'
import { PIN_COUNT } from '../../lib/keyref/keyRefPrefs'
import type { DisplayMode, Progression } from '../../lib/keyref/types'

// The four pinned progressions, all visible at once — each row shows its name
// and its full chord-and-bass sequence, so the set can be compared at a glance
// instead of one at a time. Tapping a row selects it; the arc follows.
//
// This replaced a row of four name-only chips plus a separate display of the
// selected sequence below it. Two thirds of the screen sat empty under that
// arrangement, and the chips could not say anything about the progressions they
// named.
//
// TWO ACTIONS, ONE ROW. Selecting and re-pinning both have to live here, and a
// sub-target inside a row this dense cannot reliably reach 44pt, so they are
// separated in time rather than in space: tapping an unselected row selects it,
// and tapping the row that is ALREADY selected opens the picker for that slot.
// An empty slot has nothing to select, so it opens the picker directly. Long
// press opens it from anywhere, and the same action is published to assistive
// tech through accessibilityActions so it is reachable from the VoiceOver rotor
// rather than depending on a gesture nobody announces.

export type ProgressionListProps = {
  pinned: (Progression | null)[]
  selectedSlot: number | null
  onSelect: (slot: number) => void
  onEdit: (slot: number) => void
  tonicKey: string
  mode: DisplayMode
  /** Index into the SELECTED progression's flattened chords, or null. */
  activeIndex: number | null
  onShowNote: (progression: Progression) => void
  onReplay: () => void
  /** Hidden under Reduce Motion, where there is no walk to replay. */
  showReplay: boolean
  labelFor: (progression: Progression) => string
  emptyLabel: string
  changeActionLabel: string
  selectHint: string
  bassRowLabel: string
  noteLabel: string
  replayLabel: string
  t: (key: string, vars: Record<string, string>) => string
}

export default function ProgressionList({
  pinned,
  selectedSlot,
  onSelect,
  onEdit,
  tonicKey,
  mode,
  activeIndex,
  onShowNote,
  onReplay,
  showReplay,
  labelFor,
  emptyLabel,
  changeActionLabel,
  selectHint,
  bassRowLabel,
  noteLabel,
  replayLabel,
  t: tx,
}: ProgressionListProps) {
  const t = useTheme()
  const { differentiateWithoutColor } = useAccessibilityFlags()

  return (
    <Card>
      {Array.from({ length: PIN_COUNT }, (_, slot) => {
        const progression = pinned[slot] ?? null
        const selected = selectedSlot === slot && progression != null
        const label = progression ? labelFor(progression) : emptyLabel
        const isLast = slot === PIN_COUNT - 1
        return (
          <Pressable
            key={slot}
            onPress={() => (progression == null || selected ? onEdit(slot) : onSelect(slot))}
            onLongPress={() => onEdit(slot)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            accessibilityHint={selected ? changeActionLabel : selectHint}
            accessibilityActions={[{ name: 'longpress', label: changeActionLabel }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'longpress') onEdit(slot)
            }}
            style={({ pressed }) => ({
              paddingHorizontal: t.spacing.md,
              paddingTop: t.spacing.sm,
              paddingBottom: t.spacing.sm,
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
                marginBottom: progression ? t.spacing.xs : 0,
              }}
            >
              {/* Selection is a tint; with Differentiate Without Color on it
                  also gets a mark, matching the Chip primitive's behaviour. */}
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
                  color: selected ? t.colors.textAccent : progression ? t.colors.sec : t.colors.muted,
                }}
              >
                {label.toUpperCase()}
              </Text>
              {progression?.noteKey ? (
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
                  <SymbolIcon
                    name="arrow.triangle.2.circlepath"
                    size={14}
                    color={t.colors.accent}
                  />
                </Pressable>
              ) : null}
            </View>

            {progression ? (
              <ProgressionSequence
                progression={progression}
                tonicKey={tonicKey}
                mode={mode}
                // Only the selected row's walk is lit; the others sit static so
                // the highlight can never read as belonging to two progressions.
                activeIndex={selected ? activeIndex : null}
                bassRowLabel={bassRowLabel}
                t={tx}
              />
            ) : null}
          </Pressable>
        )
      })}
    </Card>
  )
}
