import { Pressable, Switch, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FormSheetShell from './FormSheetShell'
import SegmentedPill from './SegmentedPill'
import AccidentalToggle, { type Accidental } from './AccidentalToggle'
import type { ChordStyle } from './ChordChart'
import type { ColumnCount } from '../lib/columnCapacity'
import { useFormSheet } from '../lib/formSheetHost'
import { useTheme } from '../theme/ThemeProvider'

// Re-export so existing screen imports (`from './ViewOptionsSheet'`) keep working.
export { type Accidental, defaultAccidental, resolvePreferFlat } from './AccidentalToggle'

// The viewer's "View options" sheet (••• button). Everything is
// controlled/ephemeral — the screen owns the state, nothing persists.
// Presented via the native formSheet route (src/lib/formSheetHost.ts): a
// bottom sheet on phones, a centered narrow form sheet on tablets.
// CHORD STYLE has no Numbers segment: no Nashville conversion exists in core
// yet (flagged for a future pass).

export const FONT_SCALE_MIN = 0.8
export const FONT_SCALE_MAX = 1.6
export const FONT_SCALE_STEP = 0.1

function OverlineLabel({ children, first }: { children: string; first?: boolean }) {
  const t = useTheme()
  return (
    <Text
      style={{
        fontSize: t.typography.overline.fontSize,
        fontWeight: t.typography.overline.fontWeight,
        letterSpacing: t.typography.overline.letterSpacing,
        textTransform: 'uppercase',
        color: t.colors.sec,
        marginTop: first ? 0 : t.spacing.xl,
        marginBottom: t.spacing.sm,
      }}
    >
      {children}
    </Text>
  )
}

type ViewOptionsProps = {
  visible: boolean
  onClose: () => void
  showChords: boolean
  onShowChords: (v: boolean) => void
  showSections: boolean
  onShowSections: (v: boolean) => void
  /** The scale currently in effect — auto-fit's pick, or the user's own. */
  fontScale: number
  /** True while auto-fit owns the size; the first A−/A+ tap hands it over. */
  fontAuto?: boolean
  onFontScale: (v: number) => void
  chordStyle: ChordStyle
  onChordStyle: (v: ChordStyle) => void
  // Accidental spelling (session-scoped). Optional — rendered only when wired.
  accidental?: Accidental
  onAccidental?: (v: Accidental) => void
  // Column ceiling (global preference). Optional — the screens wire it only
  // where more than one column is possible, so phones never see the toggle.
  columns?: ColumnCount
  onColumns?: (v: ColumnCount) => void
  /** How many columns this device/viewport can carry (2 or 3). */
  maxColumns?: ColumnCount
  // Optional "hide controls when idle" toggle — rendered only when the screen
  // wires it (Song Viewer + Setlist Performer).
  autoHide?: boolean
  onAutoHide?: (v: boolean) => void
  // Optional "keep screen awake" toggle — persisted shared preference, rendered
  // only when the screen wires it (Song Viewer + Setlist Performer).
  keepAwake?: boolean
  onKeepAwake?: (v: boolean) => void
}

export default function ViewOptionsSheet(props: ViewOptionsProps) {
  useFormSheet(props.visible, () => <ViewOptionsContent {...props} />, props.onClose)
  return null
}

function ViewOptionsContent({
  onClose,
  showChords,
  onShowChords,
  showSections,
  onShowSections,
  fontScale,
  fontAuto,
  onFontScale,
  chordStyle,
  onChordStyle,
  accidental,
  onAccidental,
  columns,
  onColumns,
  maxColumns,
  autoHide,
  onAutoHide,
  keepAwake,
  onKeepAwake,
}: ViewOptionsProps) {
  const t = useTheme()
  const { t: tx } = useTranslation('song')

  const stepFont = (dir: 1 | -1) => {
    const next = Math.round((fontScale + dir * FONT_SCALE_STEP) * 10) / 10
    onFontScale(Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, next)))
  }
  const atMin = fontScale <= FONT_SCALE_MIN
  const atMax = fontScale >= FONT_SCALE_MAX

  return (
    <FormSheetShell title={tx('viewer.viewOptions')} onAction={onClose}>
      <View style={{ padding: t.spacing.lg }}>
        {/* Show chords */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ fontSize: 16, color: t.colors.ink }}>{tx('viewOptions.showChords')}</Text>
          <Switch
            value={showChords}
            onValueChange={onShowChords}
            trackColor={{ true: t.colors.accent }}
            accessibilityLabel={tx('viewOptions.showChords')}
          />
        </View>

        {/* Section labels */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: t.spacing.xl,
          }}
        >
          <Text style={{ fontSize: 16, color: t.colors.ink }}>{tx('viewOptions.sectionLabels')}</Text>
          <Switch
            value={showSections}
            onValueChange={onShowSections}
            trackColor={{ true: t.colors.accent }}
            accessibilityLabel={tx('viewOptions.sectionLabels')}
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
          <Text style={{ fontSize: 16, color: t.colors.ink }}>{tx('viewOptions.fontSize')}</Text>
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
              accessibilityLabel={tx('viewOptions.smallerFont')}
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
              {fontAuto
                ? tx('viewOptions.autoFontSize', { percent: Math.round(fontScale * 100) })
                : `${Math.round(fontScale * 100)}%`}
            </Text>
            <Pressable
              onPress={() => stepFont(1)}
              disabled={atMax}
              accessibilityRole="button"
              accessibilityLabel={tx('viewOptions.largerFont')}
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

        {/* Chord style — inline setting-value picker (content-sized pill). */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: t.spacing.xl,
          }}
        >
          <Text style={{ fontSize: 16, color: t.colors.ink }}>{tx('viewOptions.chordStyle')}</Text>
          <SegmentedPill<ChordStyle>
            options={[
              { value: 'letters', label: tx('viewOptions.letters') },
              { value: 'solfege', label: tx('viewOptions.solfege') },
            ]}
            value={chordStyle}
            onChange={onChordStyle}
          />
        </View>

        {/* Accidentals — ♯/♭ spelling (session-scoped). Rendered only when the
            screen wires it. */}
        {onAccidental && accidental ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: t.spacing.xl,
            }}
          >
            <Text style={{ fontSize: 16, color: t.colors.ink }}>{tx('viewOptions.accidentals')}</Text>
            <AccidentalToggle value={accidental} onChange={onAccidental} />
          </View>
        ) : null}

        {/* Columns — tablet-only layout ceiling, a global preference. The
            options run 1..maxColumns (2 on an iPad mini, 3 on larger tablets).
            It is a CEILING: auto-fit uses fewer columns when fewer give bigger
            text. Rendered only when the screen wires it. */}
        {onColumns && columns ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: t.spacing.xl,
            }}
          >
            <Text style={{ fontSize: 16, color: t.colors.ink }}>{tx('viewOptions.columns')}</Text>
            <SegmentedPill<ColumnCount>
              options={([1, 2, 3] as ColumnCount[])
                .filter((n) => n <= (maxColumns ?? 2))
                .map((n) => ({ value: n, label: String(n) }))}
              value={Math.min(columns, maxColumns ?? 2) as ColumnCount}
              onChange={onColumns}
            />
          </View>
        ) : null}

        {/* Screen preferences — persist across launches (unlike the options
            above). Each row renders only when the screen wires it. */}
        {onAutoHide || onKeepAwake ? <OverlineLabel>{tx('viewOptions.screen')}</OverlineLabel> : null}
        {onAutoHide ? (
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text style={{ fontSize: 16, color: t.colors.ink }}>{tx('viewOptions.hideControlsWhenIdle')}</Text>
            <Switch
              value={!!autoHide}
              onValueChange={onAutoHide}
              trackColor={{ true: t.colors.accent }}
              accessibilityLabel={tx('viewOptions.hideControlsWhenIdle')}
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
            <Text style={{ fontSize: 16, color: t.colors.ink }}>{tx('viewOptions.keepScreenAwake')}</Text>
            <Switch
              value={!!keepAwake}
              onValueChange={onKeepAwake}
              trackColor={{ true: t.colors.accent }}
              accessibilityLabel={tx('viewOptions.keepScreenAwake')}
            />
          </View>
        ) : null}
      </View>
    </FormSheetShell>
  )
}
