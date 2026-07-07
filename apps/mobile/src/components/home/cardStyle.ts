import type { ViewStyle } from 'react-native'
import type { Tokens } from '@gracechords/tokens/native'

// The Home dashboard's card surface. Unlike the Card primitive (which clips
// with overflow:hidden), this keeps shadows visible — needed for the hero's
// overlapping "Continue" card, and shared by every dashboard card.
export function cardStyle(t: Tokens, elevated = false): ViewStyle {
  return {
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radii.card,
    padding: t.spacing.lg,
    shadowColor: '#000',
    shadowOpacity: elevated ? 0.12 : 0.05,
    shadowRadius: elevated ? 16 : 3,
    shadowOffset: { width: 0, height: elevated ? 8 : 1 },
    elevation: elevated ? 6 : 2,
  }
}
