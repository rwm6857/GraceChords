import { ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Screen from '../components/Screen'
import Card from '../components/Card'
import ListRow from '../components/ListRow'
import SectionHeader from '../components/SectionHeader'
import SymbolIcon from '../components/SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'
import type { Tokens } from '@gracechords/tokens/native'

// The Utilities tab landing page. This is a STUB: it establishes the navigation
// slot and lists the planned musician's tools as non-functional "Coming soon"
// rows. No feature logic lives here yet (pitch detection, metronome timing, capo
// math, tone generation are all separate, later tasks). Built entirely from the
// shared primitives (Screen / SectionHeader / Card / ListRow / SymbolIcon) and
// theme tokens, mirroring the grouped-list layout used by Settings.

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

const UTILITIES: { icon: Parameters<typeof SymbolIcon>[0]['name']; title: string }[] = [
  { icon: 'tuningfork', title: 'Tuner' },
  { icon: 'metronome', title: 'Tap Tempo / Metronome' },
  { icon: 'guitars', title: 'Capo Calculator' },
  { icon: 'pianokeys', title: 'Pitch Pipe' },
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
              value="Coming soon"
              isLast={i === UTILITIES.length - 1}
              accessibilityLabel={`${u.title} — coming soon`}
            />
          ))}
        </Card>
      </ScrollView>
    </Screen>
  )
}
