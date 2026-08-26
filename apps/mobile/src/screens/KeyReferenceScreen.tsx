import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import GlassSurface from '../components/GlassSurface'
import Screen from '../components/Screen'
import SectionHeader from '../components/SectionHeader'
import SegmentedPill from '../components/SegmentedPill'
import SymbolIcon from '../components/SymbolIcon'
import KeyArc, { EMPTY_ANNOTATION, type ArcAnnotation } from '../components/keyref/KeyArc'
import ProgressionList from '../components/keyref/ProgressionList'
import ProgressionNoteSheet from '../components/keyref/ProgressionNoteSheet'
import ProgressionPickerSheet from '../components/keyref/ProgressionPickerSheet'
import { useTheme } from '../theme/ThemeProvider'
import { useAccessibilityFlags } from '../lib/accessibilityFlags'
import { useFormSheet } from '../lib/formSheetHost'
import { PHONE_ARC } from '../lib/keyref/arcGeometry'
import { DEGREE_POSITION, positionKey } from '../lib/keyref/keyWheel'
import {
  PIN_COUNT,
  hydrateKeyRefPrefs,
  setDisplayMode,
  setPinned,
  useKeyRefPrefs,
} from '../lib/keyref/keyRefPrefs'
import { flatChords, progressionById } from '../lib/keyref/progressions'
import { isDiatonic } from '../lib/keyref/render'
import type { DisplayMode, Progression, ProgressionChord } from '../lib/keyref/types'

// Key Reference (Utilities) — a cropped circle-of-fifths arc under the four
// pinned progressions. Standalone: the key is chosen here by turning the arc,
// never seeded from a song or a setlist.
//
// The stack is a scrolling upper region and a fixed lower one, and the split is
// the layout's whole point. All four progressions show their chords and bass at
// once in the upper region, with the letters/numbers toggle docked directly
// beneath them — that toggle changes the spelling in the rows above it, and
// proximity is what makes it self-explanatory, which is why it is here and not
// in the nav bar (where a two-segment pill would also push the title off centre).
// The lower third is the key readout and the arc, pinned where a thumb reaches.
//
// The arc sits OUTSIDE the ScrollView on purpose. Its wheel is a pan gesture,
// and a pan that shares a vertical scroll container spends its life fighting the
// scroll for the same finger; keeping it out means the rows can scroll (large
// Dynamic Type, a three-phrase progression) without ever contending with it.
//
// `embedded`: rendered inside the Utilities tab's tablet split (right pane) —
// hides the back link and swaps the bar's safe-area padding for regular spacing,
// mirroring the other tool screens. That is the existing split behaviour, not a
// tablet layout for this tool: the arc is the phone variant everywhere, and
// nothing here branches on size class.

/** One step of the walk that lights the progression's chords in order. */
const WALK_STEP_MS = 260

export default function KeyReferenceScreen({ embedded }: { embedded?: boolean }) {
  const t = useTheme()
  const { t: tx } = useTranslation(['utilities', 'common', 'nav'])
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const { reduceMotion } = useAccessibilityFlags()
  const [barH, setBarH] = useState(0)

  const prefs = useKeyRefPrefs()
  useEffect(() => {
    hydrateKeyRefPrefs(AsyncStorage).catch(() => {})
  }, [])

  const [tonicKey, setTonicKey] = useState('C')
  const [selectedSlot, setSelectedSlot] = useState<number | null>(0)
  const [editingSlot, setEditingSlot] = useState<number | null>(null)
  const [noteFor, setNoteFor] = useState<Progression | null>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const pinned = useMemo(
    () => Array.from({ length: PIN_COUNT }, (_, i) => progressionById(prefs.pinned[i])),
    [prefs.pinned],
  )
  const selected = selectedSlot == null ? null : pinned[selectedSlot]
  const chords = useMemo(() => (selected ? flatChords(selected) : []), [selected])

  // The walk: on selecting a progression its chords light in order, once, then
  // the sequence settles with every position it uses left ringed on the arc.
  // Under Reduce Motion it goes straight to the settled state. The walk only
  // changes fills — it never moves accessibility focus — so it needs no separate
  // screen-reader branch.
  const walk = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopWalk = useCallback(() => {
    if (walk.current) clearInterval(walk.current)
    walk.current = null
  }, [])

  const startWalk = useCallback(() => {
    stopWalk()
    if (chords.length === 0 || reduceMotion) {
      setActiveIndex(null)
      return
    }
    setActiveIndex(0)
    let step = 0
    walk.current = setInterval(() => {
      step += 1
      if (step >= chords.length) {
        stopWalk()
        setActiveIndex(null)
        return
      }
      setActiveIndex(step)
    }, WALK_STEP_MS)
    // Keyed on the chord array, not its length: two different progressions can
    // both be eight chords long, and depending on the length would leave the
    // walk stale when you switched between them.
  }, [chords, reduceMotion, stopWalk])

  useEffect(() => {
    startWalk()
    return stopWalk
  }, [startWalk, stopWalk])

  const annotation: ArcAnnotation = useMemo(() => {
    if (!selected) return EMPTY_ANNOTATION
    const ringed = new Set<string>()
    const altered = new Map<string, ProgressionChord>()
    for (const chord of chords) {
      const position = DEGREE_POSITION[chord.degree]
      const key = positionKey(position.ring, position.slot)
      ringed.add(key)
      // A chord that is not what the key's scale gives at this degree marks the
      // position rather than lighting it: highlighting the diatonic ii for a
      // `2maj` would show the wrong chord as the one being played.
      if (!isDiatonic(chord)) altered.set(key, chord)
    }
    const activeChord = activeIndex == null ? null : chords[activeIndex]
    const activePosition = activeChord ? DEGREE_POSITION[activeChord.degree] : null
    return {
      ringed,
      altered,
      active: activePosition ? positionKey(activePosition.ring, activePosition.slot) : null,
    }
  }, [selected, chords, activeIndex])

  // Progression labels come from the locale files; the data layer only carries keys.
  const labelFor = useCallback((progression: Progression) => tx(progression.labelKey), [tx])

  // The pure render helpers take an injected translator so they stay RN-free.
  const translate = useCallback(
    (key: string, vars: Record<string, string>) => tx(key, vars),
    [tx],
  )

  const arcLabels = useMemo(
    () => ({
      position: (name: string, number: string | null) =>
        number ? tx('keyRef.a11yPosition', { chord: name, number }) : name,
      advance: (key: string) => tx('keyRef.a11yAdvance', { key }),
    }),
    [tx],
  )

  const pickerOpen = editingSlot != null
  useFormSheet(
    pickerOpen,
    () => (
      <ProgressionPickerSheet
        selectedId={editingSlot == null ? null : (prefs.pinned[editingSlot] ?? null)}
        onPick={(id) => {
          if (editingSlot != null) {
            setPinned(editingSlot, id)
            setSelectedSlot(editingSlot)
          }
          setEditingSlot(null)
        }}
        onClose={() => setEditingSlot(null)}
        title={tx('keyRef.pickerTitle')}
        generalLabel={tx('keyRef.setGeneral')}
        prayerLabel={tx('keyRef.setPrayer')}
        labelFor={labelFor}
        maxHeight={Math.max(280, height * 0.6)}
      />
    ),
    () => setEditingSlot(null),
  )

  // The formSheet host carries one sheet at a time (so does iOS), so the note is
  // gated on the picker being closed rather than racing it for the route.
  useFormSheet(
    noteFor?.noteKey != null && !pickerOpen,
    () =>
      noteFor?.noteKey ? (
        <ProgressionNoteSheet
          title={labelFor(noteFor)}
          body={tx(noteFor.noteKey)}
          onClose={() => setNoteFor(null)}
        />
      ) : null,
    () => setNoteFor(null),
  )

  return (
    <Screen edges={['left', 'right']}>
      <View style={{ flex: 1, paddingTop: barH + t.spacing.sm }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          // Centred rather than top-aligned: on a tall phone the rows do not
          // fill the upper region, and pooling every spare point below the
          // toggle is exactly the dead zone this pass exists to remove. When the
          // content does overflow (a three-phrase progression, large Dynamic
          // Type) this has no effect and it simply scrolls.
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: t.spacing.lg,
            paddingBottom: t.spacing.md,
          }}
        >
          <SectionHeader label={tx('keyRef.progressionsHeader')} />
          <ProgressionList
            pinned={pinned}
            selectedSlot={selectedSlot}
            onSelect={setSelectedSlot}
            onEdit={setEditingSlot}
            tonicKey={tonicKey}
            mode={prefs.display}
            activeIndex={activeIndex}
            onShowNote={setNoteFor}
            onReplay={startWalk}
            showReplay={!reduceMotion}
            labelFor={labelFor}
            emptyLabel={tx('keyRef.emptySlot')}
            changeActionLabel={tx('keyRef.changeProgression')}
            selectHint={tx('keyRef.selectHint')}
            bassRowLabel={tx('keyRef.bassLabel')}
            noteLabel={tx('keyRef.showNote')}
            replayLabel={tx('keyRef.replay')}
            t={translate}
          />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: t.spacing.md,
            }}
          >
            <Text style={{ fontSize: t.typography.body.fontSize, color: t.colors.sec }}>
              {tx('keyRef.showAs')}
            </Text>
            <SegmentedPill<DisplayMode>
              options={[
                { value: 'letters', label: tx('keyRef.letters') },
                { value: 'numbers', label: tx('keyRef.numbers') },
              ]}
              value={prefs.display}
              onChange={setDisplayMode}
            />
          </View>
        </ScrollView>

        {/* Key readout + arc: the lower third, out of the scroll view. The arc
            is full-bleed, so no horizontal padding here. */}
        <View style={{ paddingBottom: insets.bottom }}>
          <Text
            accessibilityRole="header"
            style={{
              textAlign: 'center',
              marginBottom: t.spacing.sm,
              fontSize: 26,
              fontWeight: '700',
              letterSpacing: -0.4,
              color: t.colors.ink,
            }}
          >
            {tx('keyRef.keyOf', { key: tonicKey })}
          </Text>
          <KeyArc
            variant={PHONE_ARC}
            tonicKey={tonicKey}
            onKeyChange={setTonicKey}
            annotation={annotation}
            labels={arcLabels}
          />
        </View>
      </View>

      {/* Scroll-behind top bar, same pattern as the other tools. */}
      <GlassSurface
        fallbackColor={t.colors.bg}
        fallbackHairline
        onLayout={(e) => setBarH(e.nativeEvent.layout.height)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          paddingTop: embedded ? t.spacing.sm : insets.top,
          paddingHorizontal: t.spacing.md,
          paddingBottom: t.spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {embedded ? (
          <View style={{ width: 70 }} />
        ) : (
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={tx('common:back')}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
          >
            <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
            <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.textAccent }}>
              {tx('nav:utilities')}
            </Text>
          </Pressable>
        )}
        <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.ink }}>
          {tx('keyRef.title')}
        </Text>
        <View style={{ width: 70 }} />
      </GlassSurface>
    </Screen>
  )
}
