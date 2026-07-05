import { router } from 'expo-router'
import { ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Screen from '../components/Screen'
import Card from '../components/Card'
import ListRow from '../components/ListRow'
import SectionHeader from '../components/SectionHeader'
import SymbolIcon from '../components/SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'
import type { Tokens } from '@gracechords/tokens/native'

// The Utilities tab landing page: musician's tools as a grouped list. Every
// row pushes a live feature (Tuner, Tap Tempo / Metronome, Pitch Pipe). Capo
// math lives inline in the Song Viewer's capo chip, not as a tool here. Built
// entirely from the shared primitives (Screen / SectionHeader / Card /
// ListRow / SymbolIcon) and theme tokens, mirroring the grouped-list layout
// used by Settings.

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

const UTILITIES: {
  icon: Parameters<typeof SymbolIcon>[0]['name']
  title: string
  route: '/tuner' | '/metronome' | '/pitch-pipe'
}[] = [
  { icon: 'tuningfork', title: 'Tuner', route: '/tuner' },
  { icon: 'metronome', title: 'Tap Tempo / Metronome', route: '/metronome' },
  { icon: 'pianokeys', title: 'Pitch Pipe', route: '/pitch-pipe' },
]

export default function UtilitiesScreen() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Screen edges={['top', 'left', 'right']}>
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
          Utilities
        </Text>

        <SectionHeader label="TOOLS" />
        <Card>
          {UTILITIES.map((u, i) => (
            <ListRow
              key={u.title}
              title={u.title}
              leading={<RowIcon name={u.icon} t={t} />}
              chevron
              onPress={() => router.push(u.route)}
              isLast={i === UTILITIES.length - 1}
              accessibilityLabel={u.title}
            />
          ))}
        </Card>
      </ScrollView>
    </Screen>
  )
}
