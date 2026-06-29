import React from 'react'

const SIZE_MAP = { sm: 32, md: 44, card: 64, lg: 80 }

export const DEFAULT_SPRITE = 'notes'

export default function SpriteAvatar({ sprite, size = 'md', className = '' }) {
  const id = sprite || DEFAULT_SPRITE
  const px = SIZE_MAP[size] ?? SIZE_MAP.md
  return (
    <div
      className={`gc-sprite-avatar gc-sprite-avatar--${size} ${className}`}
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      <img
        src={`/sprites/${id}.webp`}
        alt=""
        width={px}
        height={px}
      />
    </div>
  )
}
