import React from 'react'

export default function IconButton({
  variant = 'default',
  label,
  as: Component = 'button',
  className = '',
  children,
  ...rest
}){
  const cls = [
    'gc-iconbtn',
    variant !== 'default' ? `gc-iconbtn--${variant}` : '',
    className,
  ].filter(Boolean).join(' ')
  const props = { ...rest }
  if (Component === 'button' && !props.type) props.type = 'button'
  if (!props['aria-label'] && label) props['aria-label'] = label
  return (
    <Component className={cls} {...props}>
      {children}
    </Component>
  )
}
