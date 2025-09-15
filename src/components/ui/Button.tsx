import React from 'react'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  iconLeft?: React.ReactNode
  iconOnly?: boolean
  as?: any
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  iconLeft,
  iconOnly,
  className = '',
  children,
  as,
  ...rest
}: ButtonProps){
  const Cmp: any = as || 'button'
  const cls = [
    'gc-btn',
    variant ? `gc-btn--${variant}` : '',
    size ? `gc-btn--${size}` : '',
    iconOnly ? 'gc-btn--iconOnly' : '',
    className,
  ].filter(Boolean).join(' ')
  return (
    <Cmp className={cls} {...rest}>
      {iconLeft ? <span aria-hidden>{iconLeft}</span> : null}
      {!iconOnly && children}
    </Cmp>
  )
}

