import type { ImageSourcePropType } from 'react-native'

// Canonical sprite ids — MUST stay in sync with SPRITE_IDS in
// apps/web/src/components/ui/SpritePicker.jsx: the persisted value
// (users.preferences.sprite) is shared with the web app. Duplicated here
// because mobile cannot import from apps/web.
export const SPRITE_IDS = [
  'acoustic', 'bible', 'boba', 'charlie', 'drums', 'elec',
  'heart', 'keys', 'lamb', 'lion', 'mic',
  'notes', 'shepherd', 'star', 'thomas',
] as const

export type SpriteId = (typeof SPRITE_IDS)[number]

// Metro requires static require literals.
export const SPRITE_SOURCES: Record<SpriteId, ImageSourcePropType> = {
  acoustic: require('../../assets/sprites/acoustic.webp'),
  bible: require('../../assets/sprites/bible.webp'),
  boba: require('../../assets/sprites/boba.webp'),
  charlie: require('../../assets/sprites/charlie.webp'),
  drums: require('../../assets/sprites/drums.webp'),
  elec: require('../../assets/sprites/elec.webp'),
  heart: require('../../assets/sprites/heart.webp'),
  keys: require('../../assets/sprites/keys.webp'),
  lamb: require('../../assets/sprites/lamb.webp'),
  lion: require('../../assets/sprites/lion.webp'),
  mic: require('../../assets/sprites/mic.webp'),
  notes: require('../../assets/sprites/notes.webp'),
  shepherd: require('../../assets/sprites/shepherd.webp'),
  star: require('../../assets/sprites/star.webp'),
  thomas: require('../../assets/sprites/thomas.webp'),
}
