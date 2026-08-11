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

// PNG, not the .webp the web app serves from public/sprites — React Native's
// `Image` decodes WebP on Android only (see the format list in
// Libraries/Image/ImageProps.js), so on iOS every avatar rendered as nothing:
// blank circles in the profile card, the Home header, and an avatar picker
// whose tiles were invisible apart from the selected one's ring. The PNGs are
// generated from the same web source images — see assets/README.md.
//
// Metro requires static require literals.
export const SPRITE_SOURCES: Record<SpriteId, ImageSourcePropType> = {
  acoustic: require('../../assets/sprites/acoustic.png'),
  bible: require('../../assets/sprites/bible.png'),
  boba: require('../../assets/sprites/boba.png'),
  charlie: require('../../assets/sprites/charlie.png'),
  drums: require('../../assets/sprites/drums.png'),
  elec: require('../../assets/sprites/elec.png'),
  heart: require('../../assets/sprites/heart.png'),
  keys: require('../../assets/sprites/keys.png'),
  lamb: require('../../assets/sprites/lamb.png'),
  lion: require('../../assets/sprites/lion.png'),
  mic: require('../../assets/sprites/mic.png'),
  notes: require('../../assets/sprites/notes.png'),
  shepherd: require('../../assets/sprites/shepherd.png'),
  star: require('../../assets/sprites/star.png'),
  thomas: require('../../assets/sprites/thomas.png'),
}
