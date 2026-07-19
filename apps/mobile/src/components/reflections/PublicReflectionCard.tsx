import { Alert, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Card from '../Card'
import SymbolIcon from '../SymbolIcon'
import { useTheme } from '../../theme/ThemeProvider'
import HeartButton from './HeartButton'
import type { FeedPost } from '../../lib/usePublicReflections'

// One anonymous public reflection: body (serif), heart control + count, and an
// overflow action (report / hide). The author is never shown or known to the
// client. Own posts show a small "Yours" badge, disable the heart, and hide the
// report/hide actions (you can delete your own from the journal).
export default function PublicReflectionCard({
  post,
  onToggleHeart,
  onReport,
  onHide,
}: {
  post: FeedPost
  onToggleHeart: (id: string) => void
  onReport: (id: string) => void
  onHide: (id: string) => void
}) {
  const t = useTheme()
  const { t: tx } = useTranslation('reader')

  const openActions = () => {
    Alert.alert(tx('shared.actionSheetTitle'), undefined, [
      { text: tx('shared.report'), onPress: () => onReport(post.id) },
      { text: tx('shared.hide'), onPress: () => onHide(post.id) },
      { text: tx('shared.cancel'), style: 'cancel' },
    ])
  }

  return (
    <Card style={{ padding: t.spacing.lg }}>
      <Text style={{ fontFamily: 'Georgia', fontSize: 16, lineHeight: 25, color: t.colors.ink }}>
        {post.body}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: t.spacing.md,
        }}
      >
        <HeartButton
          count={post.heart_count}
          hearted={post.hearted}
          disabled={post.isOwn}
          onPress={() => onToggleHeart(post.id)}
        />
        {post.isOwn ? (
          <View
            style={{
              backgroundColor: t.colors.accentSoft,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: t.colors.textAccent }}>
              {tx('shared.ownBadge')}
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={openActions}
            accessibilityRole="button"
            accessibilityLabel={tx('shared.more')}
            hitSlop={8}
          >
            <SymbolIcon name="ellipsis" size={16} color={t.colors.muted} />
          </Pressable>
        )}
      </View>
    </Card>
  )
}
