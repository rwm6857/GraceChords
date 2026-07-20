import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { KEYS, formatKeyDisplay, stepsBetween } from '@gracechords/core'
import Card from '../components/Card'
import Chip from '../components/Chip'
import GlassSurface from '../components/GlassSurface'
import Screen from '../components/Screen'
import SectionHeader from '../components/SectionHeader'
import SymbolIcon from '../components/SymbolIcon'
import { useAppDefaults } from '../lib/defaults'
import { useTheme } from '../theme/ThemeProvider'

// Capo Calculator (Utilities) — pick the key a song sounds in and the open-chord
// key you'd rather play; the readout gives the capo fret that raises those
// shapes into the sounding key. A capo only raises pitch, so the fret is the
// number of semitones UP from the played shapes to the song's key
// (stepsBetween, mod 12). Equal keys mean no capo. All key math reuses
// @gracechords/core — nothing musical is reimplemented here.
//
// `embedded`: rendered inside the Utilities tab's tablet split (right pane) —
// hides the back link and swaps the bar's safe-area padding for regular
// spacing, mirroring the other tool screens.

function KeyGrid({
  selected,
  onSelect,
  chordStyle,
}: {
  selected: string
  onSelect: (key: string) => void
  chordStyle: 'letters' | 'solfege'
}) {
  const t = useTheme()
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm, paddingHorizontal: t.spacing.xs }}>
      {KEYS.map((key) => (
        <Chip
          key={key}
          label={formatKeyDisplay(key, chordStyle)}
          selected={key === selected}
          onPress={() => onSelect(key)}
        />
      ))}
    </View>
  )
}

export default function CapoCalculatorScreen({ embedded }: { embedded?: boolean }) {
  const t = useTheme()
  const { t: tx } = useTranslation(['utilities', 'common', 'nav'])
  const insets = useSafeAreaInsets()
  const { chordStyle } = useAppDefaults()
  const [barH, setBarH] = useState(0)

  const [songKey, setSongKey] = useState('C')
  const [playKey, setPlayKey] = useState('C')

  const fret = stepsBetween(playKey, songKey)
  const songDisplay = formatKeyDisplay(songKey, chordStyle)
  const playDisplay = formatKeyDisplay(playKey, chordStyle)

  return (
    <Screen edges={['left', 'right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: barH + t.spacing.lg,
          paddingHorizontal: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.xxl,
        }}
      >
        {/* Result readout */}
        <Card style={{ alignItems: 'center', paddingVertical: t.spacing.xl, paddingHorizontal: t.spacing.lg }}>
          <Text
            style={{
              fontSize: 44,
              fontWeight: '700',
              letterSpacing: -0.5,
              color: fret === 0 ? t.colors.muted : t.colors.accent,
            }}
          >
            {fret === 0 ? tx('capo.resultNone') : tx('capo.result', { fret })}
          </Text>
          <Text
            style={{
              marginTop: t.spacing.xs,
              fontSize: t.typography.body.fontSize,
              color: t.colors.muted,
              textAlign: 'center',
            }}
          >
            {fret === 0
              ? tx('capo.hintNone', { key: songDisplay })
              : tx('capo.hint', { shape: playDisplay, key: songDisplay })}
          </Text>
        </Card>

        <View style={{ marginTop: t.spacing.lg }}>
          <SectionHeader label={tx('capo.songKey')} />
          <KeyGrid selected={songKey} onSelect={setSongKey} chordStyle={chordStyle} />
        </View>

        <View style={{ marginTop: t.spacing.lg }}>
          <SectionHeader label={tx('capo.playIn')} />
          <KeyGrid selected={playKey} onSelect={setPlayKey} chordStyle={chordStyle} />
        </View>
      </ScrollView>

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
            <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent }}>{tx('nav:utilities')}</Text>
          </Pressable>
        )}
        <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.ink }}>{tx('capo.title')}</Text>
        <View style={{ width: 70 }} />
      </GlassSurface>
    </Screen>
  )
}
