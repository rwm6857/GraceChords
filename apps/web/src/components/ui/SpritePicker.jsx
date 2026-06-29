import React from 'react'
import SpriteAvatar from './SpriteAvatar'

export const SPRITE_IDS = [
  'acoustic', 'bible', 'boba', 'charlie', 'drums', 'elec',
  'heart', 'keys', 'lamb', 'lion', 'mic',
  'notes', 'shepherd', 'star', 'thomas',
]

export default function SpritePicker({ value, onChange }) {
  return (
    <div className="gc-sprite-picker" role="group" aria-label="Choose your icon">
      {SPRITE_IDS.map(id => (
        <button
          key={id}
          type="button"
          className={`gc-sprite-picker__item${value === id ? ' selected' : ''}`}
          onClick={() => value !== id && onChange(id)}
          aria-label={id.replace(/-/g, ' ')}
          aria-pressed={value === id}
        >
          <SpriteAvatar sprite={id} size="card" />
        </button>
      ))}
    </div>
  )
}
