import React from 'react'

export type SongCardProps = {
  title: React.ReactNode
  subtitle?: React.ReactNode
  tags?: string[]
  leftSlot?: React.ReactNode
  rightSlot?: React.ReactNode
  onClick?: React.MouseEventHandler
  className?: string
  as?: any
  to?: string
  role?: string
  tabIndex?: number
  ariaSelected?: boolean
  draggable?: boolean
  onDragStart?: any
  onDragOver?: any
  onDrop?: any
}

export const SongCard = React.forwardRef<any, SongCardProps>(function SongCard({
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
  const Cmp: any = to ? (Component as any) : Component
  const props: any = { className: `gc-card gc-song-card ${className}`.trim(), onClick, ref, ...rest }
  if (to) props.to = to
  return (
    // @ts-ignore
    <Cmp {...props}>
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
    </Cmp>
  )
})

export default SongCard
