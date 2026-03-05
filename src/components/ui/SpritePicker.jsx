import React from 'react'
import SpriteAvatar from './SpriteAvatar'

export const SPRITE_IDS = [
  'guitar', 'piano', 'candle', 'dove', 'harp',
  'cross', 'music-note', 'bell', 'crown', 'flame',
]

export default function SpritePicker({ value, onChange }) {
  return (
    <div className="gc-sprite-picker" role="radiogroup" aria-label="Choose your icon">
      {SPRITE_IDS.map(id => (
        <button
          key={id}
          type="button"
          className={`gc-sprite-picker__item${value === id ? ' selected' : ''}`}
          onClick={() => onChange(id)}
          aria-label={id.replace(/-/g, ' ')}
          aria-pressed={value === id}
        >
          <SpriteAvatar sprite={id} size="md" />
        </button>
      ))}
    </div>
  )
}
