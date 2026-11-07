import { Linking, ScrollView, Text, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SONG_STATS_RULES } from '@gracechords/core'
import FormSheetShell from '../FormSheetShell'
import ListRow from '../ListRow'
import Card from '../Card'
import { useFormSheet } from '../../lib/formSheetHost'
import { useSongStatsControls } from '../../lib/useSongStatsControls'
import { useTheme } from '../../theme/ThemeProvider'

const PRIVACY_URL = 'https://gracechords.com/privacy'

type Props = { visible: boolean; onClose: () => void }

/**
 * "About Song Stats": what is counted, who can see it, and the two controls.
 * The thresholds in the copy are read from SONG_STATS_RULES, the same
 * constants the capture rule uses, so the sheet can never describe a rule the
 * code no longer applies.
 */
export default function SongStatsAboutSheet(props: Props) {
  useFormSheet(props.visible, () => <AboutContent {...props} />, props.onClose)
  return null
}

function AboutContent({ onClose }: Props) {
  const t = useTheme()
  const { t: tx, i18n } = useTranslation('stats')
  const controls = useSongStatsControls()
  const { height } = useWindowDimensions()
  const num = (n: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(n)
  const para = { fontSize: 15, lineHeight: 21, color: t.colors.ink }
  return (
    <FormSheetShell title={tx('about.title')} onAction={onClose}>
      {/* fitToContents sheet: cap the scroll area so a small phone can still reach the controls. */}
      <ScrollView
        style={{ flexGrow: 0, maxHeight: Math.round(height * 0.7) }}
        contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}
      >
        <Text style={para}>{tx('about.intro')}</Text>
        <Text style={para}>
          {tx('about.rule', {
            perSong: num(SONG_STATS_RULES.perSongSessionMs / 1000),
            min: num(SONG_STATS_RULES.minSessionMs / 60_000),
            seconds: num(SONG_STATS_RULES.minSongDisplayMs / 1000),
          })}
        </Text>
        <Text style={para}>{tx('about.private')}</Text>
        <Text style={para}>{tx('about.control')}</Text>
        <Card>
          <ListRow
            title={tx('about.privacy')}
            chevron
            onPress={() => void Linking.openURL(PRIVACY_URL)}
          />
          <ListRow
            title={tx('about.clear')}
            onPress={controls.busy ? undefined : controls.confirmClear}
          />
          <ListRow
            title={controls.enabled ? tx('about.turnOff') : tx('about.turnOn')}
            isLast
            onPress={controls.busy ? undefined : () => controls.toggle(!controls.enabled)}
          />
        </Card>
      </ScrollView>
    </FormSheetShell>
  )
}
