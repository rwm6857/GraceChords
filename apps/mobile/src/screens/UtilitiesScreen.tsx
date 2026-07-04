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

// The Utilities tab landing page: musician's tools as a grouped list. Rows
// with a `route` are live features (Tuner → /tuner); the rest are "Coming
// soon" stubs for separate, later tasks (metronome timing, capo math, tone
// generation). Built entirely from the shared primitives (Screen /
// SectionHeader / Card / ListRow / SymbolIcon) and theme tokens, mirroring
// the grouped-list layout used by Settings.

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
  /** Route to push; rows without one render as "Coming soon" stubs. */
  route?: '/tuner'
}[] = [
  { icon: 'tuningfork', title: 'Tuner', route: '/tuner' },
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
          {UTILITIES.map((u, i) => {
            const live = u.route != null
            return (
              <ListRow
                key={u.title}
                title={u.title}
                leading={<RowIcon name={u.icon} t={t} />}
                value={live ? undefined : 'Coming soon'}
                chevron={live}
                onPress={live ? () => router.push(u.route!) : undefined}
                isLast={i === UTILITIES.length - 1}
                accessibilityLabel={live ? u.title : `${u.title} — coming soon`}
              />
            )
          })}
        </Card>

        {__DEV__ ? (
          // Dev-only doorway to the tuner pipeline spike harness
          // (spike/tuner/), kept until the device-verify pass is done.
          <>
            <SectionHeader label="DEV" />
            <Card>
              <ListRow
                title="Tuner spike harness"
                leading={<RowIcon name="waveform" t={t} />}
                chevron
                onPress={() => router.push('/dev/tuner-spike')}
                isLast
                accessibilityLabel="Tuner spike harness (dev only)"
              />
            </Card>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  )
}
