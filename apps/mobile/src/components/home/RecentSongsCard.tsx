import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { cardStyle } from './cardStyle'
import { useTheme } from '../../theme/ThemeProvider'
import { getRecentlyOpened, type RecentSong } from '../../lib/recents'

// Home's Recent-songs card: the most-recently-opened songs (count from tokens
// layout.recentSongs), each showing the key it was LAST VIEWED in. Tapping
// reopens the song in that stored key via the viewer's existing initialKey
// param — opening the same song from the Library still uses its default key.

export default function RecentSongsCard() {
  const t = useTheme()
  const { t: tx } = useTranslation(['home', 'common'])
  const router = useRouter()
  const recents = getRecentlyOpened().slice(0, t.layout.recentSongs)

  function openSong(s: RecentSong) {
    router.push({
      pathname: '/viewer/[slug]',
      params: {
        slug: s.slug,
        title: s.title,
        artist: s.artist ?? '',
        songKey: s.default_key ?? '',
        ...(s.lastKey ? { initialKey: s.lastKey } : {}),
      },
    })
  }

  return (
    <View style={cardStyle(t)}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          color: t.colors.textAccent,
        }}
      >
        {tx('recentSongsCard.label')}
      </Text>

      {recents.length === 0 ? (
        <Text style={{ marginTop: t.spacing.md, fontSize: t.typography.rowSubtitle.fontSize, color: t.colors.muted }}>
          {tx('recentSongsCard.empty')}
        </Text>
      ) : (
        <View style={{ marginTop: t.spacing.xs }}>
          {recents.map((s, i) => (
            <Pressable
              key={s.slug}
              onPress={() => openSong(s)}
              accessibilityRole="button"
              accessibilityLabel={tx('common:openSong', { title: s.title })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                paddingVertical: 10,
                borderTopWidth: i === 0 ? 0 : 0.5,
                borderTopColor: t.colors.border,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: t.typography.rowTitle.fontSize,
                    fontWeight: t.typography.rowTitle.fontWeight,
                    letterSpacing: t.typography.rowTitle.letterSpacing,
                    color: t.colors.ink,
                  }}
                >
                  {s.title}
                </Text>
                {s.artist ? (
                  <Text
                    numberOfLines={1}
                    style={{ marginTop: 1, fontSize: t.typography.rowSubtitle.fontSize, color: t.colors.sec }}
                  >
                    {s.artist}
                  </Text>
                ) : null}
              </View>
              {s.lastKey ?? s.default_key ? (
                <Text
                  style={{
                    fontSize: t.typography.rowKey.fontSize,
                    fontWeight: t.typography.rowKey.fontWeight,
                    color: t.colors.textAccent,
                  }}
                >
                  {s.lastKey ?? s.default_key}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}
