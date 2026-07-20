import { useState } from 'react'
import { router } from 'expo-router'
import { ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import Screen from '../components/Screen'
import Card from '../components/Card'
import ListRow from '../components/ListRow'
import SectionHeader from '../components/SectionHeader'
import SymbolIcon from '../components/SymbolIcon'
import TunerScreen from './TunerScreen'
import MetronomeScreen from './MetronomeScreen'
import PitchPipeScreen from './PitchPipeScreen'
import CapoCalculatorScreen from './CapoCalculatorScreen'
import SongbookBuilderScreen from './SongbookBuilderScreen'
import { useTheme } from '../theme/ThemeProvider'
import { useIsTabletWidth } from '../lib/useIsTabletWidth'
import type { Tokens } from '@gracechords/tokens/native'

// The Utilities tab landing page: musician's tools as a grouped list. Every
// row is a live feature (Tuner, Tap Tempo / Metronome, Pitch Pipe, Capo
// Calculator). Built entirely from the shared primitives (Screen /
// SectionHeader / Card / ListRow / SymbolIcon) and theme tokens, mirroring the
// grouped-list layout used by Settings.
//
// Phones push each tool as its own route. At regular (tablet) width the tab
// becomes a list-detail split (tokens layout.split, ~1/3 · 2/3): the tool
// list on the left, the selected tool rendered embedded on the right, with a
// placeholder until one is picked.

/** Rounded leading icon chip, mirroring the Settings grouped-row pattern. */
function RowIcon({ name, t }: { name: Parameters<typeof SymbolIcon>[0]['name']; t: Tokens }) {
  return (
    <View
      style={{
        width: 29,
        height: 29,
        borderRadius: 7,
        backgroundColor: t.colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SymbolIcon name={name} size={16} color={t.colors.accent} />
    </View>
  )
}

type ToolRoute = '/tuner' | '/metronome' | '/pitch-pipe' | '/capo' | '/songbook'

const UTILITIES: {
  icon: Parameters<typeof SymbolIcon>[0]['name']
  titleKey: string
  route: ToolRoute
}[] = [
  { icon: 'tuningfork', titleKey: 'tools.tuner', route: '/tuner' },
  { icon: 'metronome', titleKey: 'tools.metronome', route: '/metronome' },
  { icon: 'pianokeys', titleKey: 'tools.pitchPipe', route: '/pitch-pipe' },
  { icon: 'book', titleKey: 'tools.songbook', route: '/songbook' },
  { icon: 'music.note', titleKey: 'tools.capo', route: '/capo' },
]

export default function UtilitiesScreen() {
  const t = useTheme()
  const { t: tx } = useTranslation('utilities')
  const insets = useSafeAreaInsets()
  const isTablet = useIsTabletWidth()
  const [tool, setTool] = useState<ToolRoute | null>(null)

  const toolList = (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: t.spacing.lg,
        paddingBottom: insets.bottom + t.spacing.xxl,
      }}
    >
      <Text
        style={{
          fontSize: t.typography.largeTitle.fontSize,
          fontWeight: t.typography.largeTitle.fontWeight,
          letterSpacing: t.typography.largeTitle.letterSpacing,
          color: t.colors.ink,
          paddingHorizontal: t.spacing.xs,
          paddingTop: t.spacing.sm,
          paddingBottom: t.spacing.md,
        }}
      >
        {tx('title')}
      </Text>

      <SectionHeader label={tx('sectionTools')} />
      <Card>
        {UTILITIES.map((u, i) => {
          const selected = isTablet && tool === u.route
          const title = tx(u.titleKey)
          return (
            <ListRow
              key={u.route}
              title={title}
              leading={<RowIcon name={u.icon} t={t} />}
              chevron={!selected}
              trailing={
                selected ? (
                  <SymbolIcon name="checkmark" size={15} color={t.colors.accent} weight="semibold" />
                ) : undefined
              }
              onPress={() => (isTablet ? setTool(u.route) : router.push(u.route))}
              isLast={i === UTILITIES.length - 1}
              accessibilityLabel={title}
            />
          )
        })}
      </Card>
    </ScrollView>
  )

  if (!isTablet) {
    return <Screen edges={['top', 'left', 'right']}>{toolList}</Screen>
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View
          style={{
            flex: t.layout.split.list,
            borderRightWidth: 1,
            borderRightColor: t.colors.border,
          }}
        >
          {toolList}
        </View>
        <View style={{ flex: t.layout.split.detail }}>
          {tool === '/tuner' ? (
            <TunerScreen embedded />
          ) : tool === '/metronome' ? (
            <MetronomeScreen embedded />
          ) : tool === '/pitch-pipe' ? (
            <PitchPipeScreen embedded />
          ) : tool === '/songbook' ? (
            <SongbookBuilderScreen embedded />
          ) : tool === '/capo' ? (
            <CapoCalculatorScreen embedded />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: t.spacing.md,
              }}
            >
              <SymbolIcon name="wrench.and.screwdriver" size={34} color={t.colors.muted} />
              <Text style={{ fontSize: t.typography.body.fontSize, color: t.colors.muted }}>
                {tx('pickTool')}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Screen>
  )
}
