import React from 'react'
import { Link } from 'react-router-dom'

const SongCard = React.forwardRef(function SongCard({
  title,
  subtitle,
  tags = [],
  leftSlot,
  rightSlot,
  onClick,
  className = '',
  as: Component = 'div',
  to,
  ...rest
}, ref) {
  const Cmp = to ? Link : Component
  const props = { className: `gc-card ${className}`.trim(), onClick, ref, ...rest }
  if (to) props.to = to
  return (
    <Cmp {...props}>
      {leftSlot}
      <div className="gc-card__body">
        <div className="gc-card__title">{title}</div>
        {subtitle && <div className="gc-card__meta">{subtitle}</div>}
        {tags.length > 0 && (
          <div className="gc-card__tags">
            {tags.map(t => (
              <span key={t} className="gc-tag gc-tag--gray">{t}</span>
            ))}
          </div>
        )}
      </div>
      <div className="gc-card__spacer" />
      {rightSlot}
    </Cmp>
  )
})

export default SongCard
