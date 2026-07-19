import { Pressable, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import SymbolIcon from '../SymbolIcon'
import { useTheme } from '../../theme/ThemeProvider'

// Heart control + count for a public reflection card. Disabled (dimmed, no
// press) on the user's own post — self-hearts are impossible in the UI and RLS
// backstops it. Filled heart = the current user has hearted it.
export default function HeartButton({
  count,
  hearted,
  disabled,
  onPress,
}: {
  count: number
  hearted: boolean
  disabled?: boolean
  onPress?: () => void
}) {
  const t = useTheme()
  const { t: tx } = useTranslation('reader')
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: hearted, disabled: !!disabled }}
      accessibilityLabel={hearted ? tx('shared.unheart') : tx('shared.heart')}
      hitSlop={8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, opacity: disabled ? 0.45 : 1 }}
    >
      <SymbolIcon
        name={hearted ? 'heart.fill' : 'heart'}
        size={16}
        color={hearted ? t.colors.danger : t.colors.muted}
      />
      <Text style={{ fontSize: 13, fontWeight: '600', color: t.colors.sec }}>{count}</Text>
    </Pressable>
  )
}
