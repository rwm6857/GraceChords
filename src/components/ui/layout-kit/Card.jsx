import React from 'react'

export function Card({
  as: Component = 'div',
  className = '',
  children,
  ...rest
}){
  return (
    <Component className={`gc-card ${className}`.trim()} {...rest}>
      {children}
    </Component>
  )
}

export function InsetCard({
  as: Component = 'div',
  className = '',
  children,
  ...rest
}){
  return (
    <Component className={`gc-inset-card ${className}`.trim()} {...rest}>
      {children}
    </Component>
  )
}

export const SongCard = React.forwardRef(function SongCard({
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
}, ref){
  const props = { className: `gc-card gc-song-card ${className}`.trim(), onClick, ref, ...rest }
  if (to) props.to = to
  return (
    <Component {...props}>
      {leftSlot}
      <div className="gc-card__body">
        <div className="gc-card__title">{title}</div>
        {subtitle ? <div className="gc-card__meta">{subtitle}</div> : null}
        {tags.length ? (
          <div className="gc-card__tags">
            {tags.map((t) => (
              <span key={t} className="gc-tag gc-tag--gray">{t}</span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="gc-card__spacer" />
      {rightSlot}
    </Component>
  )
})

export default Card
