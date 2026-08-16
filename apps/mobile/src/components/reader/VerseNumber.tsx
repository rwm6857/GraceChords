import { Text, View } from 'react-native'
import { verseNumberFontSize, verseNumberLift } from '../../lib/readerSettings'

// The verse numeral that introduces each verse in the reader.
//
// WHY THIS IS A <View> AND NOT A NESTED <Text>
//
// A plain nested <Text> at a smaller size sits on the SAME BASELINE as the body
// text, which parks the numeral at the bottom of a line box that is 1.4–1.85×
// the font size tall — the "it sits at the bottom of the line" look. Lifting an
// inline run is a baseline offset, and React Native has no per-run baseline
// offset on either platform: iOS computes ONE offset for the whole paragraph
// (RCTApplyBaselineOffsetForRange, derived from lineHeight vs font line height)
// and Android has no baseline-shift span at all. `verticalAlign` /
// `textAlignVertical` are Android-only and act on the whole text, not a run.
//
// What both platforms DO support is an inline view, which the text engine
// treats as an attachment whose BOTTOM EDGE rests on the baseline (iOS:
// NSTextAttachment bounds; Android: TextInlineViewPlaceholderSpan, which
// reports `ascent = -height, descent = 0`). So wrapping the numeral in a box
// lifts it by exactly the numeral's own descent, and `paddingBottom` tops that
// up to roughly the body text's cap height.
//
// The box is intentionally SIZED BY ITS CONTENT rather than given a fixed
// height, so the geometry holds under OS font scaling: the numeral and its lift
// both track the reading size.
//
// The box height (≈0.88× the body font size) stays below the line box's ascent
// at every size/spacing pair the settings sheet offers, so a line carrying a
// verse number is never taller than its neighbours — the attachment fits in
// space the line already had.
//
// `pointerEvents="none"` keeps the numeral from swallowing taps: selection is
// toggled by the <Text> that encloses it.
export default function VerseNumber({
  num,
  fontSize,
  color,
  fontFamily,
}: {
  num: number
  /** The reading's body font size — the numeral's own metrics derive from it. */
  fontSize: number
  color: string
  fontFamily?: string
}) {
  return (
    <View pointerEvents="none" style={{ paddingBottom: verseNumberLift(fontSize) }}>
      <Text
        style={{
          fontSize: verseNumberFontSize(fontSize),
          fontWeight: '700',
          fontFamily,
          color,
        }}
      >
        {num}
      </Text>
    </View>
  )
}
