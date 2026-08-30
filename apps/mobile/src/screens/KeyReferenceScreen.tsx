import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import GlassSurface from '../components/GlassSurface'
import Screen from '../components/Screen'
import SegmentedPill from '../components/SegmentedPill'
import SymbolIcon from '../components/SymbolIcon'
import KeyArc, { EMPTY_ANNOTATION, type ArcAnnotation } from '../components/keyref/KeyArc'
import ProgressionList from '../components/keyref/ProgressionList'
import ProgressionNoteSheet from '../components/keyref/ProgressionNoteSheet'
import { useTheme } from '../theme/ThemeProvider'
import { useAccessibilityFlags } from '../lib/accessibilityFlags'
import { useFormSheet } from '../lib/formSheetHost'
import { PHONE_ARC } from '../lib/keyref/arcGeometry'
import { DEGREE_POSITION, keyAtOffset, positionKey } from '../lib/keyref/keyWheel'
import {
  hydrateKeyRefPrefs,
  setDisplayMode,
  setSelectedProgression,
  useKeyRefPrefs,
} from '../lib/keyref/keyRefPrefs'
import { flatChords, progressionById } from '../lib/keyref/progressions'
import { isDiatonic, numberStyleFor } from '../lib/keyref/render'
import type { DisplayMode, Progression, ProgressionChord } from '../lib/keyref/types'

// Key Reference (Utilities) — a cropped circle-of-fifths dial under the whole
// progression library. Standalone: the key is chosen here by turning the dial,
// never seeded from a song or a setlist.
//
// Three regions, and the split is the layout's whole point:
//
//   • a FIXED header carrying the Letters/Numbers/Nashville switcher, so the one
//     control that reprints every row below it never scrolls away from them;
//   • a SCROLLING list of every progression, grouped by set;
//   • a FIXED dial in the lower third, where a thumb reaches, flanked by turn
//     arrows either side of the key readout.
//
// The dial sits OUTSIDE the ScrollView on purpose. Its wheel is a pan gesture,
// and a pan that shares a vertical scroll container spends its life fighting the
// scroll for the same finger; keeping it out means the list scrolls freely
// without ever contending with it.
//
// `embedded`: rendered inside the Utilities tab's tablet split (right pane) —
// hides the back link and swaps the bar's safe-area padding for regular spacing,
// mirroring the other tool screens. That is the existing split behaviour, not a
// tablet layout for this tool: the dial is the phone variant everywhere, and
// nothing here branches on size class.

/** One step of the walk that lights the progression's chords in order. */
const WALK_STEP_MS = 520

export default function KeyReferenceScreen({ embedded }: { embedded?: boolean }) {
  const t = useTheme()
  const { t: tx } = useTranslation(['utilities', 'common', 'nav'])
  const insets = useSafeAreaInsets()
  const { reduceMotion } = useAccessibilityFlags()
  const [barH, setBarH] = useState(0)

  const prefs = useKeyRefPrefs()
  useEffect(() => {
    hydrateKeyRefPrefs(AsyncStorage).catch(() => {})
  }, [])

  const [tonicKey, setTonicKey] = useState('C')
  const [noteFor, setNoteFor] = useState<Progression | null>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const selected = progressionById(prefs.selectedId)
  const chords = useMemo(() => (selected ? flatChords(selected) : []), [selected])

  // The walk: on selecting a progression its chords light in order, once, then
  // the sequence settles with every position it uses left ringed on the dial.
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

  /** The turn arrows: the same one-fifth step the edge bubbles take. */
  const turn = useCallback((steps: number) => setTonicKey((k) => keyAtOffset(k, steps)), [])

  useFormSheet(
    noteFor?.noteKey != null,
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

  const arrow = (direction: -1 | 1) => (
    <Pressable
      onPress={() => turn(direction)}
      hitSlop={16}
      accessibilityRole="button"
      accessibilityLabel={tx('keyRef.a11yAdvance', { key: keyAtOffset(tonicKey, direction) })}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: t.spacing.xs })}
    >
      <SymbolIcon
        name={direction < 0 ? 'chevron.left' : 'chevron.right'}
        size={22}
        color={t.colors.spotlight}
        weight="semibold"
      />
    </Pressable>
  )

  return (
    <Screen edges={['left', 'right']}>
      <View style={{ flex: 1, paddingTop: barH }}>
        {/* Fixed switcher. Content-sized and centred rather than full width —
            SegmentedPill hugs its content by design, and three segments at this
            type size come to ~240pt, which centres comfortably at 375. */}
        <View
          style={{
            alignItems: 'center',
            paddingVertical: t.spacing.sm,
            paddingHorizontal: t.spacing.lg,
          }}
        >
          <SegmentedPill<DisplayMode>
            options={[
              { value: 'letters', label: tx('keyRef.letters') },
              { value: 'numbers', label: tx('keyRef.numbers') },
              { value: 'nashville', label: tx('keyRef.nashville') },
            ]}
            value={prefs.display}
            onChange={setDisplayMode}
          />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: t.spacing.lg,
            paddingBottom: t.spacing.md,
          }}
        >
          <ProgressionList
            selectedId={prefs.selectedId}
            onSelect={setSelectedProgression}
            tonicKey={tonicKey}
            mode={prefs.display}
            activeIndex={activeIndex}
            onShowNote={setNoteFor}
            onReplay={startWalk}
            showReplay={!reduceMotion}
            labelFor={labelFor}
            generalLabel={tx('keyRef.setGeneral')}
            prayerLabel={tx('keyRef.setPrayer')}
            selectHint={tx('keyRef.selectHint')}
            noteLabel={tx('keyRef.showNote')}
            replayLabel={tx('keyRef.replay')}
            t={translate}
          />
        </ScrollView>

        {/* Key readout + dial. Full-bleed, and deliberately WITHOUT bottom
            padding: the dial's face is extended by the home-indicator inset so
            the circle runs off the bottom of the screen. */}
        <View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: t.spacing.md,
              marginBottom: t.spacing.xs,
            }}
          >
            {arrow(-1)}
            <Text
              accessibilityRole="header"
              style={{
                fontSize: 26,
                fontWeight: '700',
                letterSpacing: -0.4,
                color: t.colors.ink,
              }}
            >
              {tx('keyRef.keyOf', { key: tonicKey })}
            </Text>
            {arrow(1)}
          </View>
          <KeyArc
            variant={PHONE_ARC}
            tonicKey={tonicKey}
            onKeyChange={setTonicKey}
            extraBottom={insets.bottom}
            numberStyle={numberStyleFor(prefs.display)}
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
