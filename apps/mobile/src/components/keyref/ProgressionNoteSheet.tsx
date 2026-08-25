import { Text, View } from 'react-native'
import FormSheetShell from '../FormSheetShell'
import { useTheme } from '../../theme/ThemeProvider'

// A playing note carried over from the source document — "add the 9th when you
// play the 4/6", "it lands hardest when the 2maj resolves into 1/3 – 4".
//
// These are guidance for the player, not chords, so they are deliberately NOT
// encoded as data in the progression: putting a 9th into the sequence would say
// the chord IS a ninth, and putting the resolution note anywhere but here would
// say it is a separate chord. Only the two progressions the source annotates
// show the affordance that opens this.

export default function ProgressionNoteSheet({
  title,
  body,
  onClose,
}: {
  title: string
  body: string
  onClose: () => void
}) {
  const t = useTheme()
  return (
    <FormSheetShell title={title} onAction={onClose}>
      {/* The bottom safe-area inset belongs to the sheet HOST, never here. */}
      <View style={{ paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.lg }}>
        <Text
          style={{
            fontSize: t.typography.body.fontSize,
            lineHeight: 23,
            color: t.colors.ink,
          }}
        >
          {body}
        </Text>
      </View>
    </FormSheetShell>
  )
}
