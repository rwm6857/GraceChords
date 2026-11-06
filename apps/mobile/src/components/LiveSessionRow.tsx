import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import SymbolIcon from './SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'

// The lead row of every share sheet (Song Viewer, Performer, Setlist Builder):
// start a live session, described by what it does rather than its name. Once a
// session is live for this song/set it becomes the way back to its links / End.
// Followed by <LiveSessionDivider /> above the sheet's existing copy actions.

type Props = {
  live: boolean
  busy?: boolean
  disabled?: boolean
  onPress: () => void
}

export default function LiveSessionRow({ live, busy = false, disabled = false, onPress }: Props) {
  const t = useTheme()
  const { t: tx } = useTranslation('export')
  const title = live ? tx('liveNowTitle') : tx('liveTitle')
  const body = live ? tx('liveNowBody') : tx('liveBody')
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: t.spacing.md,
        borderRadius: 13,
        backgroundColor: t.colors.accentSoft,
        borderWidth: 1,
        borderColor: t.colors.accent,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: t.colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={t.colors.onAccent} />
        ) : (
          <SymbolIcon name="antenna.radiowaves.left.and.right" size={17} color={t.colors.onAccent} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {live ? (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.accent }} />
          ) : null}
          <Text style={{ fontSize: 15.5, fontWeight: '700', color: t.colors.ink }}>{title}</Text>
        </View>
        <Text style={{ fontSize: 12.5, lineHeight: 17, color: t.colors.sec }}>{body}</Text>
      </View>
      <SymbolIcon name="chevron.right" size={14} color={t.colors.sec} />
    </Pressable>
  )
}

/** "Or send a copy" — separates the live row from the sheet's file/link actions. */
export function LiveSessionDivider() {
  const t = useTheme()
  const { t: tx } = useTranslation('export')
  return (
    <Text
      style={{
        marginTop: t.spacing.xs,
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        color: t.colors.sec,
      }}
    >
      {tx('orSendCopy')}
    </Text>
  )
}
