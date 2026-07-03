import { Pressable, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BottomSheet from './BottomSheet'
import AccidentalToggle, { type Accidental } from './AccidentalToggle'
import type { ChordStyle } from './ChordChart'
import { useTheme } from '../theme/ThemeProvider'

// Re-export so existing screen imports (`from './ViewOptionsSheet'`) keep working.
export { type Accidental, defaultAccidental, resolvePreferFlat } from './AccidentalToggle'

// The viewer's "View options" bottom sheet (••• button). Everything is
// controlled/ephemeral — the screen owns the state, nothing persists.
// CHORD STYLE has no Numbers segment: no Nashville conversion exists in core
// yet (flagged for a future pass).

export const FONT_SCALE_MIN = 0.8
export const FONT_SCALE_MAX = 1.6
export const FONT_SCALE_STEP = 0.1

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  const t = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: t.colors.surfaceAlt,
        borderRadius: 12,
        padding: 3,
      }}
    >
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{
              flex: 1,
              paddingVertical: 9,
              borderRadius: 9,
              alignItems: 'center',
              backgroundColor: selected ? t.colors.surface : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: selected ? t.colors.ink : t.colors.sec,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function OverlineLabel({ children, first }: { children: string; first?: boolean }) {
  const t = useTheme()
  return (
    <Text
      style={{
        fontSize: t.typography.overline.fontSize,
        fontWeight: t.typography.overline.fontWeight,
        letterSpacing: t.typography.overline.letterSpacing,
        textTransform: 'uppercase',
        color: t.colors.muted,
        marginTop: first ? 0 : t.spacing.xl,
        marginBottom: t.spacing.sm,
      }}
    >
      {children}
    </Text>
  )
}

export default function ViewOptionsSheet({
  visible,
  onClose,
  showChords,
  onShowChords,
  showSections,
  onShowSections,
  fontScale,
  onFontScale,
  chordStyle,
  onChordStyle,
  accidental,
  onAccidental,
  autoHide,
  onAutoHide,
  keepAwake,
  onKeepAwake,
}: {
  visible: boolean
  onClose: () => void
  showChords: boolean
  onShowChords: (v: boolean) => void
  showSections: boolean
  onShowSections: (v: boolean) => void
  fontScale: number
  onFontScale: (v: number) => void
  chordStyle: ChordStyle
  onChordStyle: (v: ChordStyle) => void
  // Accidental spelling (session-scoped). Optional — rendered only when wired.
  accidental?: Accidental
  onAccidental?: (v: Accidental) => void
  // Optional "hide controls when idle" toggle — rendered only when the screen
  // wires it (Song Viewer + Setlist Performer).
  autoHide?: boolean
  onAutoHide?: (v: boolean) => void
  // Optional "keep screen awake" toggle — persisted shared preference, rendered
  // only when the screen wires it (Song Viewer + Setlist Performer).
  keepAwake?: boolean
  onKeepAwake?: (v: boolean) => void
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()

  const stepFont = (dir: 1 | -1) => {
    const next = Math.round((fontScale + dir * FONT_SCALE_STEP) * 10) / 10
    onFontScale(Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, next)))
  }
  const atMin = fontScale <= FONT_SCALE_MIN
  const atMax = fontScale >= FONT_SCALE_MAX

  return (
    <BottomSheet visible={visible} onClose={onClose} title="View options">
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom }}>
        <OverlineLabel first>Show</OverlineLabel>
        <Segmented
          options={[
            { value: 'chords', label: 'Chords & lyrics' },
            { value: 'lyrics', label: 'Lyrics only' },
          ]}
          value={showChords ? 'chords' : 'lyrics'}
          onChange={(v) => onShowChords(v === 'chords')}
        />

        {/* Section labels */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: t.spacing.xl,
          }}
        >
          <Text style={{ fontSize: 16, color: t.colors.ink }}>Section labels</Text>
          <Switch
            value={showSections}
            onValueChange={onShowSections}
            trackColor={{ true: t.colors.accent }}
            accessibilityLabel="Section labels"
          />
        </View>

        {/* Font size */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: t.spacing.xl,
          }}
        >
          <Text style={{ fontSize: 16, color: t.colors.ink }}>Font size</Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: t.colors.surfaceAlt,
              borderRadius: 12,
              padding: 3,
            }}
          >
            <Pressable
              onPress={() => stepFont(-1)}
              disabled={atMin}
              accessibilityRole="button"
              accessibilityLabel="Smaller font"
              style={{
                width: 40,
                height: 36,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: atMin ? 0.35 : 1,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.ink }}>A</Text>
            </Pressable>
            <Text
              style={{
                minWidth: 52,
                textAlign: 'center',
                fontSize: 13,
                fontWeight: '600',
                color: t.colors.sec,
              }}
            >
              {Math.round(fontScale * 100)}%
            </Text>
            <Pressable
              onPress={() => stepFont(1)}
              disabled={atMax}
              accessibilityRole="button"
              accessibilityLabel="Larger font"
              style={{
                width: 40,
                height: 36,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: atMax ? 0.35 : 1,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: '700', color: t.colors.ink }}>A</Text>
            </Pressable>
          </View>
        </View>

        <OverlineLabel>Chord style</OverlineLabel>
        <Segmented
          options={[
            { value: 'letters', label: 'Letters' },
            { value: 'solfege', label: 'Solfège' },
          ]}
          value={chordStyle}
          onChange={onChordStyle}
        />

        {/* Accidentals — ♯/♭ spelling (session-scoped). Rendered only when the
            screen wires it. */}
        {onAccidental && accidental ? (
          <>
            <OverlineLabel>Accidentals</OverlineLabel>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 16, color: t.colors.ink }}>Spelling</Text>
              <AccidentalToggle value={accidental} onChange={onAccidental} />
            </View>
          </>
        ) : null}

        {/* Screen preferences — persist across launches (unlike the options
            above). Each row renders only when the screen wires it. */}
        {onAutoHide || onKeepAwake ? <OverlineLabel>Screen</OverlineLabel> : null}
        {onAutoHide ? (
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text style={{ fontSize: 16, color: t.colors.ink }}>Hide controls when idle</Text>
            <Switch
              value={!!autoHide}
              onValueChange={onAutoHide}
              trackColor={{ true: t.colors.accent }}
              accessibilityLabel="Hide controls when idle"
            />
          </View>
        ) : null}
        {onKeepAwake ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: onAutoHide ? t.spacing.xl : 0,
            }}
          >
            <Text style={{ fontSize: 16, color: t.colors.ink }}>Keep screen awake</Text>
            <Switch
              value={!!keepAwake}
              onValueChange={onKeepAwake}
              trackColor={{ true: t.colors.accent }}
              accessibilityLabel="Keep screen awake"
            />
          </View>
        ) : null}
      </View>
    </BottomSheet>
  )
}
