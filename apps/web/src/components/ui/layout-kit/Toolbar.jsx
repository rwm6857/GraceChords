import React from 'react'

export default function Toolbar({
  sticky = false,
  as: Component = 'div',
  className = '',
  children,
  ...rest
}){
  const cls = [
    'gc-toolbar',
    sticky ? 'is-sticky' : '',
    className,
  ].filter(Boolean).join(' ')
  return (
    <Component className={cls} {...rest}>
      {children}
    </Component>
  )
}
