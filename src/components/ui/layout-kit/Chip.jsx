import React from 'react'

export default function Chip({
  variant = 'filter',
  selected = false,
  as,
  className = '',
  children,
  ...rest
}){
  const isTag = variant === 'tag'
  const Component = as || (isTag ? 'span' : 'button')
  const cls = [
    'gc-chip',
    `gc-chip--${variant}`,
    selected ? 'is-selected' : '',
    className,
  ].filter(Boolean).join(' ')
  const props = { ...rest }
  if (Component === 'button' && !props.type) props.type = 'button'
  if (!isTag) props['aria-pressed'] = selected
  return (
    <Component className={cls} {...props}>
      {children}
    </Component>
  )
}
