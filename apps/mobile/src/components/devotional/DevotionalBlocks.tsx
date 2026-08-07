import { Platform, Text, View } from 'react-native'
import type { DevotionalBlock, Span, VerseLine } from '@gracechords/core/devotional/types'
import { useTheme } from '../../theme/ThemeProvider'

// Renders a devotional body from precomputed `bodyBlocks`. There is NO markup
// parser here and there must never be one: the body was parsed offline into
// paragraphs, verse stanzas and italic spans, so all three platforms render the
// same structure without three parsers having to agree.
//
// This is the longest-form reading surface in the app, so measure and rhythm
// matter more than anywhere else. Line height is set as a multiple of the
// resolved font size rather than a fixed pixel value, so it scales with Dynamic
// Type instead of clamping the leading at large sizes.

/** Body copy size. Slightly larger than tokens.typography.body — this is a read. */
const BODY_SIZE = 17
const BODY_LINE_HEIGHT = 1.55
/** Verse stanzas are set smaller and tighter than prose. */
const VERSE_SIZE = 15.5
const VERSE_LINE_HEIGHT = 1.42

const warned = new Set<string>()

function warnUnknownOnce(type: string) {
  if (!__DEV__ || warned.has(type)) return
  warned.add(type)
  console.warn(
    `[DevotionalBlocks] unknown block type "${type}" — rendering nothing. ` +
    'Authored content may introduce block types this build does not know.'
  )
}

/** Spans as nested <Text>, italic where `i` is true. */
function Spans({ spans, color }: { spans: Span[], color: string }) {
  return (
    <>
      {spans.map((span, i) => (
        <Text
          key={i}
          style={span.i ? { fontStyle: 'italic', color } : { color }}
        >
          {span.t}
        </Text>
      ))}
    </>
  )
}

function Paragraph({ spans, isFirst }: { spans: Span[], isFirst: boolean }) {
  const t = useTheme()
  return (
    <Text
      style={{
        fontSize: BODY_SIZE,
        lineHeight: BODY_SIZE * BODY_LINE_HEIGHT,
        color: t.colors.ink,
        marginTop: isFirst ? 0 : BODY_SIZE * 0.95,
      }}
    >
      <Spans spans={spans} color={t.colors.ink} />
    </Text>
  )
}

/**
 * A hymn or verse stanza. Set centred, smaller, and in the accent-soft surface
 * so it reads as a quotation rather than another paragraph — 105 of these ship,
 * and the whole point is that they must not look like prose.
 *
 * `indent` from the artifact is deliberately IGNORED: it records the source's
 * hanging indentation, which is meaningless once the stanza is centred. It stays
 * in the data so the artifact is lossless, not because a renderer must honour it.
 */
function Verse({ lines }: { lines: VerseLine[] }) {
  const t = useTheme()
  return (
    <View
      style={{
        marginTop: BODY_SIZE * 1.1,
        marginBottom: BODY_SIZE * 0.4,
        paddingVertical: t.spacing.md,
        paddingHorizontal: t.spacing.md,
        backgroundColor: t.colors.accentSoft,
        borderRadius: t.radii.card,
      }}
    >
      {lines.map((line, i) => (
        <Text
          key={i}
          style={{
            fontSize: VERSE_SIZE,
            lineHeight: VERSE_SIZE * VERSE_LINE_HEIGHT,
            color: t.colors.textAccent,
            textAlign: 'center',
            // Italic by convention for quoted verse on iOS; Android's Material
            // guidance prefers upright for readability at small sizes.
            fontStyle: Platform.OS === 'ios' ? 'italic' : 'normal',
          }}
        >
          <Spans spans={line.spans} color={t.colors.textAccent} />
        </Text>
      ))}
    </View>
  )
}

export default function DevotionalBlocks({ blocks }: { blocks: DevotionalBlock[] }) {
  let proseIndex = 0
  return (
    <View>
      {blocks.map((block, i) => {
        if (block.type === 'p') {
          const isFirst = proseIndex === 0
          proseIndex += 1
          return <Paragraph key={i} spans={(block as { spans: Span[] }).spans} isFirst={isFirst} />
        }
        if (block.type === 'verse') {
          return <Verse key={i} lines={(block as { lines: VerseLine[] }).lines} />
        }
        // Unknown type: render nothing, warn once in dev, never crash.
        warnUnknownOnce(block.type)
        return null
      })}
    </View>
  )
}
