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

export default Card
