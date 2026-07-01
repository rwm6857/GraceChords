import { Pressable, Text, View } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'

export const ALPHABET = [
  '#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
]

// The right-edge A–Z index. Letters present in the list are drawn in the accent;
// absent ones are dimmed and non-interactive. Tapping a present letter asks the
// screen to jump to that section.
export default function AlphaScrubber({
  present,
  onSelect,
}: {
  present: Set<string>
  onSelect: (letter: string) => void
}) {
  const t = useTheme()
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        right: 2,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 3,
      }}
    >
      {ALPHABET.map((letter) => {
        const active = present.has(letter)
        return (
          <Pressable
            key={letter}
            disabled={!active}
            onPress={() => onSelect(letter)}
            hitSlop={{ top: 1, bottom: 1, left: 6, right: 6 }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                lineHeight: 15,
                color: active ? t.colors.accent : t.colors.off,
              }}
            >
              {letter}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
