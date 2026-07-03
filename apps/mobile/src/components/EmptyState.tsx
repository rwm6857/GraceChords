import { Text, View } from 'react-native'
import Button from './Button'
import SymbolIcon, { type SymbolIconProps } from './SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'

// The "Empty · first run" component from [DOC] Components & Foundations: a
// centered icon tile (accent-soft, 72pt), a title, an optional subtitle, and
// an optional primary action. Icon is an SF Symbol so each surface can pick
// its own (e.g. list.bullet for setlists, music.note for songs).
export default function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon: SymbolIconProps['name']
  title: string
  subtitle?: string
  actionLabel?: string
  onAction?: () => void
}) {
  const t = useTheme()
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: t.spacing.xxl,
        gap: t.spacing.lg,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          backgroundColor: t.colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SymbolIcon name={icon} size={34} color={t.colors.accent} />
      </View>
      <View style={{ alignItems: 'center', gap: 7 }}>
        <Text style={{ fontSize: 19, fontWeight: '700', color: t.colors.ink, textAlign: 'center' }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 14, lineHeight: 21, color: t.colors.sec, textAlign: 'center' }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} fullWidth={false} style={{ alignSelf: 'center' }} />
      ) : null}
    </View>
  )
}
