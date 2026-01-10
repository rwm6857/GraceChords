import React from 'react'

export default function IconButton({
  variant = 'secondary',
  label,
  as: Component = 'button',
  className = '',
  children,
  ...rest
}){
  const variantMap = {
    default: 'secondary',
    danger: 'destructive',
  }
  const resolvedVariant = variantMap[variant] || variant
  const cls = [
    'gc-btn',
    'gc-btn--icon',
    resolvedVariant ? `gc-btn--${resolvedVariant}` : '',
    resolvedVariant ? `gc-iconbtn--${resolvedVariant}` : '',
    'gc-iconbtn',
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
