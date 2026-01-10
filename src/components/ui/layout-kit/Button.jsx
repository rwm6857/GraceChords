import React from 'react'

export default function Button({
  variant = 'secondary',
  size = 'md',
  leftIcon,
  rightIcon,
  iconLeft,
  iconRight,
  loading = false,
  fullWidth = false,
  as,
  href,
  className = '',
  children,
  ...rest
}){
  const resolvedLeft = leftIcon ?? iconLeft
  const resolvedRight = rightIcon ?? iconRight
  const variantMap = {
    default: 'secondary',
    danger: 'destructive',
  }
  const resolvedVariant = variantMap[variant] || variant
  const Component = as || (href ? 'a' : 'button')
  const props = { ...rest }
  if (href) props.href = href

  const isButton = Component === 'button'
  const disabled = Boolean(props.disabled || loading)
  if (isButton && !props.type) props.type = 'button'
  if (isButton) props.disabled = disabled
  if (!isButton && disabled) {
    props['aria-disabled'] = true
    props.tabIndex = -1
  }
  if (loading) props['aria-busy'] = true

  const cls = [
    'gc-btn',
    resolvedVariant ? `gc-btn--${resolvedVariant}` : '',
    size ? `gc-btn--${size}` : '',
    fullWidth ? 'gc-btn--full' : '',
    loading ? 'is-loading' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <Component className={cls} {...props}>
      {loading ? <span className="gc-btn__spinner" aria-hidden /> : null}
      <span className="gc-btn__content">
        {resolvedLeft ? <span className="gc-btn__icon gc-btn__icon--left" aria-hidden>{resolvedLeft}</span> : null}
        <span className="gc-btn__label">{children}</span>
        {resolvedRight ? <span className="gc-btn__icon gc-btn__icon--right" aria-hidden>{resolvedRight}</span> : null}
      </span>
    </Component>
  )
}
