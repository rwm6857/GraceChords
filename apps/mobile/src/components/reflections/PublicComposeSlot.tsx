import { useCallback } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useFocusEffect, useRouter } from 'expo-router'
import Card from '../Card'
import SymbolIcon from '../SymbolIcon'
import { useTheme } from '../../theme/ThemeProvider'
import { useMyPublicPost } from '../../lib/usePublicReflections'

// The "Share a reflection" slot on the landing — DISTINCT from the private
// compose (separate action, own section). If the user hasn't shared publicly
// today, it's a compose CTA that pushes the public composer. Once they've
// posted, it's replaced by their own public reflection with its live heart
// count (one public post per day). Rendered only when the flag is on.
export default function PublicComposeSlot() {
  const t = useTheme()
  const router = useRouter()
  const { t: tx } = useTranslation('reader')
  const { post, loading, refresh } = useMyPublicPost()

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  return (
    <View>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 0.9,
          textTransform: 'uppercase',
          color: t.colors.muted,
          marginTop: t.spacing.xl,
          marginBottom: t.spacing.md,
        }}
      >
        {tx('shared.slotHeader')}
      </Text>

      {loading ? (
        <View style={{ paddingVertical: t.spacing.md, alignItems: 'center' }}>
          <ActivityIndicator color={t.colors.accent} />
        </View>
      ) : post ? (
        <Card style={{ padding: t.spacing.lg }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: t.colors.muted, marginBottom: 6 }}>
            {tx('shared.yourPublicLabel')}
          </Text>
          <Text style={{ fontFamily: 'Georgia', fontSize: 16, lineHeight: 25, color: t.colors.ink }}>
            {post.body}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: t.spacing.md }}>
            <SymbolIcon name="heart.fill" size={14} color={t.colors.danger} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: t.colors.sec }}>{post.heart_count}</Text>
          </View>
        </Card>
      ) : (
        <Pressable
          onPress={() => router.push('/daily/public-reflection')}
          accessibilityRole="button"
          accessibilityLabel={tx('shared.composeCta')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            backgroundColor: t.colors.surface,
            borderColor: t.colors.accent,
            borderWidth: 1,
            borderRadius: t.radii.card,
            paddingVertical: 14,
            paddingHorizontal: t.spacing.lg,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              backgroundColor: t.colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SymbolIcon name="person.2" size={16} color={t.colors.textAccent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: t.colors.ink }}>
              {tx('shared.composeCta')}
            </Text>
            <Text style={{ fontSize: 12.5, color: t.colors.muted, marginTop: 1 }}>
              {tx('shared.composeHint')}
            </Text>
          </View>
          <SymbolIcon name="chevron.right" size={13} color={t.colors.muted} />
        </Pressable>
      )}
    </View>
  )
}
