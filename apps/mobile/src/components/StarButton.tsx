import { Pressable } from 'react-native'
import SymbolIcon from './SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'
import { useSongStar } from '../lib/useSongStar'

// Favorite toggle shared by the Song Viewer and Setlist Performer. Hollow
// muted outline when not starred; filled gold (`star.fill`) when the user has
// favorited the song. Writes to user_starred_songs via useSongStar
// (optimistic). Renders nothing until we know the song id.
export default function StarButton({
  songId,
  size = 24,
}: {
  songId: string | undefined
  size?: number
}) {
  const t = useTheme()
  const { starred, toggle } = useSongStar(songId)
  if (!songId) return null
  return (
    <Pressable
      onPress={toggle}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={starred ? 'Remove from favorites' : 'Add to favorites'}
      accessibilityState={{ selected: starred }}
    >
      <SymbolIcon
        name={starred ? 'star.fill' : 'star'}
        size={size}
        color={starred ? t.colors.star : t.colors.muted}
      />
    </Pressable>
  )
}
