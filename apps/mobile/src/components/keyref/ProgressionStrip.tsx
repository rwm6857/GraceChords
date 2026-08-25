import { Pressable, Text, View } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { useAccessibilityFlags } from '../../lib/accessibilityFlags'
import SymbolIcon from '../SymbolIcon'
import { PIN_COUNT } from '../../lib/keyref/keyRefPrefs'
import type { Progression } from '../../lib/keyref/types'

// The four pinned progressions. Tapping one selects it; the sequence row and the
// arc follow.
//
// TWO ACTIONS, ONE CHIP. Selecting and re-pinning both have to live here, and a
// sub-target inside an 80pt chip cannot reach the 44pt minimum, so they are
// separated in time rather than in space: tapping an unselected chip selects it,
// and tapping the chip that is ALREADY selected opens the picker for that slot.
// An empty slot has nothing to select, so it opens the picker directly. Long
// press opens it from anywhere, and the same action is published to assistive
// tech through accessibilityActions so it is reachable from the VoiceOver rotor
// rather than depending on a gesture nobody announces.

const CHIP_HEIGHT = 56

export type ProgressionStripProps = {
  pinned: (Progression | null)[]
  selectedSlot: number | null
  onSelect: (slot: number) => void
  onEdit: (slot: number) => void
  labelFor: (progression: Progression) => string
  emptyLabel: string
  changeActionLabel: string
  selectHint: string
}

export default function ProgressionStrip({
  pinned,
  selectedSlot,
  onSelect,
  onEdit,
  labelFor,
  emptyLabel,
  changeActionLabel,
  selectHint,
}: ProgressionStripProps) {
  const t = useTheme()
  const { differentiateWithoutColor } = useAccessibilityFlags()

  return (
    <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
      {Array.from({ length: PIN_COUNT }, (_, slot) => {
        const progression = pinned[slot] ?? null
        const selected = selectedSlot === slot && progression != null
        const label = progression ? labelFor(progression) : emptyLabel
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
              flex: 1,
              height: CHIP_HEIGHT,
              borderRadius: t.radii.md,
              paddingHorizontal: 6,
              paddingVertical: t.spacing.xs,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? t.colors.accent : t.colors.surface,
              borderWidth: 1,
              borderColor: selected ? t.colors.accent : t.colors.border,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            {/* Selection is a fill; with Differentiate Without Color on it also
                gets a mark, matching the Chip primitive's behaviour. */}
            {selected && differentiateWithoutColor ? (
              <SymbolIcon name="checkmark" size={11} color={t.colors.onAccent} weight="semibold" />
            ) : null}
            <Text
              numberOfLines={2}
              style={{
                fontSize: 11.5,
                // White on Signal Blue is only ever semibold or heavier.
                fontWeight: selected ? '700' : '600',
                lineHeight: 14,
                textAlign: 'center',
                color: selected
                  ? t.colors.onAccent
                  : progression
                    ? t.colors.ink
                    : t.colors.muted,
              }}
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
